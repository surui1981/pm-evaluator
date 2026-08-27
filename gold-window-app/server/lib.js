'use strict';
// 评分库：与前端 index.html 的评分映射/权重/计算口径完全一致
// 内部评分 -1~+1；对外 100 分制（score100 = (comp+1)*50，50 为中性）

// ---- 12+1 项参数经验映射（+1=强利多金价，-1=强利空）----
function mapTIPS(v){ if(v>=2.5)return -1; if(v>=2.0)return -0.8; if(v>=1.0)return -0.4; if(v>=0)return 0.1; if(v>=-0.5)return 0.6; return 1; }
function mapUst10(v){ if(v>=5.0)return -1; if(v>=4.5)return -0.7; if(v>=4.0)return -0.3; if(v>=3.0)return 0.1; if(v>=2.0)return 0.5; return 1; }
function mapUst2(v){ if(v>=5.5)return -1; if(v>=5.0)return -0.6; if(v>=4.5)return -0.2; if(v>=3.5)return 0.3; if(v>=2.5)return 0.7; return 1; }
function mapFFR(v){ if(v>=5.5)return -1; if(v>=5.0)return -0.6; if(v>=4.5)return -0.2; if(v>=3.5)return 0.3; if(v>=2.5)return 0.7; return 1; }
function mapCurve(s){ if(s<=-0.8)return 1; if(s<=-0.2)return 0.6; if(s<=0.2)return 0.1; if(s<=1.0)return -0.4; return -1; }
function mapDXY(v){ if(v>=105)return -1; if(v>=103)return -0.7; if(v>=101)return -0.3; if(v>=99)return 0.1; if(v>=97)return 0.5; return 0.9; }
function mapTWI(v){ if(v>=130)return -1; if(v>=125)return -0.6; if(v>=120)return -0.1; if(v>=115)return 0.4; return 0.8; }
function mapRateDiff(d){ if(d>=3.0)return -1; if(d>=2.0)return -0.5; if(d>=1.0)return 0.0; if(d>=0)return 0.4; return 1; }
function mapCB(t){ if(t>=300)return 0.9; if(t>=200)return 0.6; if(t>=100)return 0.3; if(t>=0)return -0.1; return -0.8; }
function mapGPR(g){ if(g>=70)return 0.9; if(g>=50)return 0.5; if(g>=30)return 0.1; return -0.3; }
function mapFiscal(r){ if(r>=70)return 0.9; if(r>=50)return 0.5; if(r>=30)return 0.1; return -0.2; }
function mapVIX(v){ if(v>=30)return 0.9; if(v>=22)return 0.5; if(v>=15)return 0.1; return -0.2; }
function mapETF(v){ if(v>=8)return 0.8; if(v>=3)return 0.4; if(v>=0)return 0.1; if(v>=-5)return -0.3; return -0.8; }
function mapGSR(v){ if(v>=85)return 0.8; if(v>=75)return 0.4; if(v>=65)return 0.0; if(v>=55)return -0.3; return -0.7; }

const FNS = {
  tips: mapTIPS, ust10y: mapUst10, ust2y: mapUst2, ffr: mapFFR, curve: mapCurve,
  dxy: mapDXY, twi: mapTWI, ratediff: mapRateDiff,
  cb: mapCB, gpr: mapGPR, fiscal: mapFiscal, vix: mapVIX, etf: mapETF,
};

// 全局权重（权重和 = 1.00）
// bond(0.38): tips .17 ust10y .08 ust2y .05 ffr .06 curve .02
// usd(0.27):  dxy .15 twi .07 ratediff .05
// sov(0.35):  cb .09 gpr .07 fiscal .06 vix .05 etf .08
const W = {
  tips: 0.17, ust10y: 0.08, ust2y: 0.05, ffr: 0.06, curve: 0.02,
  dxy: 0.15, twi: 0.07, ratediff: 0.05,
  cb: 0.09, gpr: 0.07, fiscal: 0.06, vix: 0.05, etf: 0.08,
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

// 由 params 计算综合分 / 档位 / 100 分制（与前端 evalParams 一致）
function evalParams(pp){
  let n = 0, d = 0;
  for(const pid in W){
    const v = pp && pp[pid] != null ? Number(pp[pid]) : null;
    if(v === null) continue;
    n += FNS[pid](v) * W[pid];
    d += W[pid];
  }
  const comp = d ? n/d : 0;
  return { comp: Math.round(comp*1000)/1000, band: bandOf(comp), score100: sc100(comp) };
}

module.exports = { FNS, W, BANDS, bandOf, sc100, evalParams, mapGSR };
