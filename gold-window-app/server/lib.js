'use strict';
// 评分库：与前端 index.html 的评分映射/权重/计算口径完全一致
// 内部评分 -1~+1；对外 100 分制（score100 = (comp+1)*50，50 为中性）
//
// === v0.5 模型修正（2026-11-17）===
// 病灶：v0.4 的 comp 在 122 个交易日里 100% 落在"中性窗口"，对金价 -17% 的下跌完全钝感。
// 根因：4 个季频/手填的结构性慢变量(cb/gpr/fiscal/etf)占 30% 权重、贡献恒定 +0.178 多头锚，
//       把 9 个周期项的看空信号钉死；且 mapVIX 在"权益外溢"状态下方向打反。
// 修正：① 结构慢变量权重减半(30%->15%)，权重按周期项有效性重新分配；
//       ② VIX 状态化：isEquityStress 命中时高 VIX 映射为利空金(流动性挤兑/保证金抛售)；
//       ③ 新增资金流影子层 flowShadow（黄金/美债比价动量等），仅记录不进主分。
// 校准依据：122 日归档回测——末值 comp 由 -0.159(中性) -> -0.389(偏空)，与实际金价逼近年内低点吻合；
//           IC3 +0.158 / IC5 +0.218（不降反升，未过拟合）；五档恢复区分度。

// ---- 13 项参数经验映射（+1=强利多金价，-1=强利空）----
// v0.6.4 修复：原阶梯映射让同一区间内的日间变化全部被抹平（DXY 103.5→103.8、
// TIPS 2.88→2.91 等均落同桶 → comp 连续多日一字不变）。改为「保锚点分段线性」：
// 每个原阈值处的映射值保持不变（历史校准锚点不漂移），阈值之间线性插值，
// 端点外取常数。指数因此能反映日度边际变化，同时不改变各档位的经验含义。
function ramp(points){
  const pts = points.slice().sort((a,b)=>a[0]-b[0]);
  return function(v){
    if(!isFinite(v)) return pts[0][1];
    if(v <= pts[0][0]) return pts[0][1];
    for(let i=1;i<pts.length;i++){
      if(v <= pts[i][0]){
        const [x0,y0]=pts[i-1], [x1,y1]=pts[i];
        if(x1===x0) return y1;
        return Math.round((y0+(y1-y0)*(v-x0)/(x1-x0))*10000)/10000;
      }
    }
    return pts[pts.length-1][1];
  };
}
const mapTIPS     = ramp([[-1,1],[-0.5,0.6],[0,0.1],[1,-0.4],[2,-0.8],[2.5,-1],[3,-1]]);
const mapUst10    = ramp([[1,1],[2,0.5],[3,0.1],[4,-0.3],[4.5,-0.7],[5,-1],[6,-1]]);
const mapUst2     = ramp([[1,1],[2.5,0.7],[3.5,0.3],[4.5,-0.2],[5,-0.6],[5.5,-1],[6,-1]]);
const mapFFR      = ramp([[1,1],[2.5,0.7],[3.5,0.3],[4.5,-0.2],[5,-0.6],[5.5,-1],[6,-1]]);
const mapCurve    = ramp([[-1.5,1],[-0.8,1],[-0.2,0.6],[0.2,0.1],[1,-0.4],[2,-1]]);
const mapDXY      = ramp([[90,0.9],[97,0.5],[99,0.1],[101,-0.3],[103,-0.7],[105,-1],[108,-1]]);
const mapTWI      = ramp([[105,0.8],[115,0.4],[120,-0.1],[125,-0.6],[130,-1],[135,-1]]);
const mapRateDiff = ramp([[-1,1],[0,0.4],[1,0],[2,-0.5],[3,-1],[4,-1]]);
const mapCB       = ramp([[-50,-0.8],[0,-0.1],[100,0.3],[200,0.6],[300,0.9],[400,0.9]]);
const mapGPR      = ramp([[0,-0.3],[30,0.1],[50,0.5],[70,0.9],[100,0.9]]);
const mapFiscal   = ramp([[0,-0.2],[30,0.1],[50,0.5],[70,0.9],[100,0.9]]);
// v0.5 状态化 VIX：默认"恐慌→避险利多"；权益外溢状态下"恐慌→流动性挤兑利空"
const mapVIXNormal= ramp([[10,-0.2],[15,0.1],[22,0.5],[30,0.9],[45,0.9]]);
const mapVIXStress= ramp([[10,0.2],[15,0],[22,-0.3],[30,-0.6],[45,-0.6]]);
function mapVIX(v, stress){ return stress ? mapVIXStress(v) : mapVIXNormal(v); }
const mapETF      = ramp([[-15,-0.8],[-5,-0.3],[0,0.1],[3,0.4],[8,0.8],[15,0.8]]);
const mapGSR      = ramp([[50,-0.7],[55,-0.3],[65,0],[75,0.4],[85,0.8],[100,0.8]]);

// regime 判别：10Y 名义收益率≥5% 且 DXY≥103（实际利率高位+强美元+权益承压 → 权益外溢）
// 说明：黄金与纳指日收益相关性已从 0.20 升至 0.61，此状态下 VIX 飙升伴随金价下跌（保证金抛售），
//       "恐慌→利多金"的教科书假设被证伪。该判据日频可自动计算、零 API key。
function isEquityStress(p){
  if(!p) return false;
  return (Number(p.ust10y)>=5 && Number(p.dxy)>=103) || Number(p.vix)>=30;
}

const FNS = {
  tips: mapTIPS, ust10y: mapUst10, ust2y: mapUst2, ffr: mapFFR, curve: mapCurve,
  dxy: mapDXY, twi: mapTWI, ratediff: mapRateDiff,
  cb: mapCB, gpr: mapGPR, fiscal: mapFiscal, vix: mapVIXNormal, etf: mapETF,
};

// 全局权重（权重和 = 1.00）— v0.5 结构慢变量减半，周期项按有效性加权
// bond(0.40): tips .21 ust10y .11 ust2y .06 ffr .06 curve .02
// usd(0.33):  dxy .19 twi .08 ratediff .06
// sov(0.27):  cb .05 gpr .04 fiscal .03 vix .06 etf .03  (结构慢变量 cb/gpr/fiscal/etf 合计 15%)
const W = {
  tips: 0.21, ust10y: 0.11, ust2y: 0.06, ffr: 0.06, curve: 0.02,
  dxy: 0.19, twi: 0.08, ratediff: 0.06,
  cb: 0.05, gpr: 0.04, fiscal: 0.03, vix: 0.06, etf: 0.03,
};

const BANDS = [
  { key: 'strongBull', min: 0.66, range: '83.0 ~ 100.0', name: '强多窗口', short: '积极建仓', color: '#e0533a' },
  { key: 'bull',       min: 0.33, range: '66.5 ~ 83.0',  name: '偏多窗口', short: '分批建仓', color: '#e8896f' },
  { key: 'neutral',    min: -0.33,range: '33.5 ~ 66.5',  name: '中性窗口', short: '观望',     color: '#5aa9ff' },
  { key: 'bear',       min: -0.66,range: '17.0 ~ 33.5',  name: '偏空窗口', short: '减仓避险', color: '#5fbf94' },
  { key: 'strongBear', min: -1.01,range: '0.0 ~ 17.0',   name: '强空窗口', short: '清仓避险', color: '#3fae7a' },
];

function bandOf(c){ for(const b of BANDS){ if(c>=b.min) return b; } return BANDS[BANDS.length-1]; }
function sc100(c){ return Math.min(100, Math.max(0, Math.round(((c+1)*50)*10)/10)); }

// 资金流影子层：度量"钱去了美债还是黄金"。仅记录，不进主分。
// 输入：COMEX 黄金日线节点数组(按日期升序, 每项含 date/last) + 当前 10Y 收益率。
// 输出：goldBondRatio(金/美债相对强弱代理)、goldMomentum20(20 日金价动量%)、read(解读)。
function flowShadow(nodes, ust10y){
  if(!Array.isArray(nodes) || nodes.length < 2) return null;
  const sorted = nodes.slice().sort((a,b)=> a.date<b.date?-1:1);
  const closes = sorted.map(n=>+n.last).filter(isFinite);
  if(closes.length < 2) return null;
  const last = closes[closes.length-1];
  const win = closes.slice(-21);
  const base = win[0];
  const goldMomentum20 = base ? Math.round(((last/base)-1)*1000)/10 : null;
  // 黄金/美债比价代理：金价(美元) / (10Y收益率×100)。收益率越高、金价越低 → 比值越低 = 资金更偏好美债。
  // 该尺度下：黄金 3865/10Y 5.15% ≈ 7.5；黄金 2000/10Y 2% = 10；黄金 2000/10Y 4% = 5。
  const y = Number(ust10y);
  const goldBondRatio = (y>0) ? Math.round((last/y/100)*100)/100 : null;
  let read = '资金流影子层（仅记录、不进主分）：';
  if(goldMomentum20!=null){
    read += '金价近20交易日'+(goldMomentum20>=0?'上涨':'下跌')+' '+Math.abs(goldMomentum20).toFixed(1)+'%；';
  }
  if(goldBondRatio!=null){
    read += '黄金/美债比价 '+goldBondRatio.toFixed(2)+'（金价 '+last.toFixed(0)+' / 10Y '+y.toFixed(2)+'%）——'+
      (goldBondRatio<6?'资金显著偏好美债、黄金相对弱势':goldBondRatio>9?'黄金相对美债强势':'金债相对均衡')+'。';
  }
  return { goldBondRatio, goldMomentum20, read };
}

// ============================================================
// v0.6 趋势评估模块（2026-11-17）——与 comp 主分「解耦」的独立确认层
// 设计依据：2000 年互联网泡沫类比。泡沫破裂初期(2000.3-2001.1)金随股跌、
//   避险失效，真正拐点要等「降息+弱美元」政策转向，时滞约 12 个月(2001.4 见底)。
//   这段「趋势状态」是 13 项宏观因子无法表达的独立信息，故不加权进主分，
//   只做「共振/背离」判定 + 阶段判别 + 反转触发清单，避免污染已校准的 comp。
// 数据：仅用 gold_kline.json 日线序列 + 现有 params，零外部 API、日频可自动更新。
// ============================================================
function trendAssessment(nodes, pp, comp){
  if(!Array.isArray(nodes)) return null;
  const sorted = nodes.slice().sort((a,b)=> a.date<b.date?-1:(a.date>b.date?1:0));
  const closes = sorted.map(n=>+n.last).filter(isFinite);
  if(closes.length < 21) return null;
  const n = closes.length;
  const last = closes[n-1];
  const at = k => (n>k ? closes[n-1-k] : null);
  const pct = (a,b)=> (a&&b) ? Math.round(((a/b)-1)*1000)/10 : null;
  const mom5 = pct(last, at(5)), mom20 = pct(last, at(20)), mom60 = pct(last, at(60));
  const avg = k => (n>=k) ? Math.round((closes.slice(-k).reduce((s,x)=>s+x,0)/k)*10)/10 : null;
  const ma5=avg(5), ma20=avg(20), ma60=avg(60), ma120=avg(120);
  const lo=Math.min(...closes), hi=Math.max(...closes);
  const position = hi>lo ? Math.round(((last-lo)/(hi-lo))*1000)/10 : 50;  // 0=区间最低,100=最高
  const drawdown = Math.round(((last/hi)-1)*1000)/10;

  // 均线排列与方向打分（-4 完全空头 … +4 完全多头）
  let score=0;
  if(ma5!=null){ score += last<ma5 ? -1 : 1; if(ma20!=null) score += ma5<ma20 ? -1 : 1; }
  if(ma20!=null) score += last<ma20 ? -1 : 1;
  if(ma60!=null) score += last<ma60 ? -1 : 1;
  const direction = score<=-2 ? 'down' : (score>=2 ? 'up' : 'side');
  const strength = Math.round((Math.abs(score)/4)*100)/100;   // 0~1.0
  const bearStack = (ma5!=null&&ma20!=null&&ma60!=null) ? (last<ma5 && ma5<ma20 && ma20<ma60) : false;

  const p = pp||{};
  const regime = isEquityStress(p) ? 'equityStress' : 'normal';

  // ---- 周期阶段判别（泡沫类比五阶段）----
  // 阈值经验化、可解释，不做参数拟合（样本短、IC 符号翻转）
  let phase, phaseNote;
  if(position>=75 && (mom20==null||mom20>0)){
    phase='euphoria'; phaseNote='泡沫顶部区：价格处区间高位、动量仍正，估值与情绪亢奋（类比 1999Q4-2000Q1）。';
  } else if(position<35 && mom20!=null && mom20<0 && bearStack){
    phase='capitulation'; phaseNote='流动性挤兑·磨底期：价格探至区间低位、均线完全空头、金随股跌避险失效（类比 2000.3-2001.1）。';
  } else if(position<45 && mom20!=null && mom20<0 && Math.abs(mom20)<4){
    phase='policy_pivot'; phaseNote='政策转向观察期：仍在低位但跌势收敛，等待降息/弱美元确认（类比 2001.1-2001.4）。';
  } else if(position>35 && mom20!=null && mom20>0 && ma20!=null && last>ma20){
    phase='recovery'; phaseNote='趋势反转确认：价格站上 MA20、20 日动量转正（类比 2001.4 之后四轮恐慌买盘）。';
  } else if(position>55 && mom20!=null && mom20>0){
    phase='uptrend'; phaseNote='趋势上行期：多头排列、动量向上，牛市展开（类比 2002-2003 弱美元+低利率）。';
  } else {
    phase='range'; phaseNote='震荡整理：方向未明，多空信号交织。';
  }

  // ---- 与 comp 的共振/背离判定 ----
  const compDir = (comp==null)?'neutral':(comp<=-0.15?'bear':(comp>=0.15?'bull':'neutral'));
  const trendDir= (direction==='down')?'bear':(direction==='up'?'bull':'neutral');
  let confluence, confluenceNote;
  if(compDir!=='neutral' && compDir===trendDir){
    confluence='resonant'; confluenceNote='宏观评分与价格趋势同向（共振），信号可信度增强。';
  } else if(compDir!=='neutral' && trendDir!=='neutral'){
    confluence='divergent'; confluenceNote='宏观评分与价格趋势背离：警示「利多未被价格确认」或「趋势先于基本面转向」，需等待确认。';
  } else {
    confluence='neutral'; confluenceNote='一方或双方处中性区，共振关系不明确。';
  }

  // ---- 反转触发清单（可观测、日频核对；阈值经验化并显式标注）----
  const dxy=Number(p.dxy), u10=Number(p.ust10y), ffr=Number(p.ffr);
  const triggers = [
    { key:'fed_pivot',   label:'美联储政策转向（FFR 自 4.0 高位回落至 ≤3.5，经验阈值）', met: (isFinite(ffr)&&ffr<=3.5) },
    { key:'dxy_top',     label:'美元见顶回落（DXY 跌破 101）', met: (isFinite(dxy)&&dxy<101) },
    { key:'yield_top',   label:'名义利率回落（10Y 跌破 4.8%）', met: (isFinite(u10)&&u10<4.8) },
    { key:'ma_reclaim',  label:'技术确认（金价站上 MA20 ≈ '+(ma20!=null?ma20:'—')+'）', met: (ma20!=null&&last>ma20) },
    { key:'regime_clear',label:'权益外溢解除（regime → normal）', met: (regime==='normal') },
  ];
  const lit = triggers.filter(t=>t.met).length;

  const PHASE_LABEL={euphoria:'泡沫顶部',capitulation:'流动性挤兑·磨底',policy_pivot:'政策转向观察',recovery:'趋势反转确认',uptrend:'趋势上行',range:'震荡整理'};
  const read = '金价处 120 日区间 '+position.toFixed(0)+'% 分位、距峰值 '+drawdown.toFixed(1)+'%，'
    + '20 日动量 '+(mom20!=null?(mom20>=0?'+':'')+mom20.toFixed(1)+'%':'—')+'，'
    + '阶段＝'+PHASE_LABEL[phase]+'；'+confluenceNote
    + ' 反转触发已点亮 '+lit+'/'+triggers.length+' 项——'
    + (lit>=3?'政策与技术确认较充分':lit>=1?'局部信号出现，尚待确认':'反转条件尚未满足，维持谨慎');

  return {
    asOf: sorted[n-1].date, price: last,
    position, drawdown,
    momentum: { m5: mom5, m20: mom20, m60: mom60 },
    ma: { ma5, ma20, ma60, ma120, bearStack },
    direction, strength, regime,
    phase, phaseName: PHASE_LABEL[phase], phaseNote,
    confluence, confluenceNote,
    triggers, triggersLit: lit,
    analog: phase==='capitulation'
      ? '对照 2000 年：泡沫破裂初期(2000.3)金价先随美股下跌约 12% 至 2001.4 见底，避险失效是常态；真正的十年牛市起点是 2001 年降息+弱美元，滞后股市见顶约 12-13 个月。当前「金随股跌+强美元+高实际利率」与该阶段高度相似。'
      : '对照 2000 年泡沫周期的对应阶段，关注「降息 + 弱美元」这一政策转向组合是否出现——它是历史上黄金趋势反转的前置条件。',
    read,
  };
}

// 由 params 计算综合分 / 档位 / 100 分制（与前端 evalParams 一致）
function evalParams(pp){
  let n = 0, d = 0;
  const stress = isEquityStress(pp);
  for(const pid in W){
    const v = pp && pp[pid] != null ? Number(pp[pid]) : null;
    if(v === null) continue;
    const s = (pid==='vix') ? mapVIX(v, stress) : FNS[pid](v);
    n += s * W[pid];
    d += W[pid];
  }
  const comp = d ? n/d : 0;
  return { comp: Math.round(comp*1000)/1000, band: bandOf(comp), score100: sc100(comp), regime: stress?'equityStress':'normal' };
}

module.exports = { FNS, W, BANDS, bandOf, sc100, evalParams, mapGSR, mapVIX, mapVIXNormal, mapVIXStress, isEquityStress, flowShadow, trendAssessment };
