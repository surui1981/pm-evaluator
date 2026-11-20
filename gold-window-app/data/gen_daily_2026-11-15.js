'use strict';
// 本地生成脚本（无任何外部 API 调用）：基于本次 WebFetch 已抓取数值写入四文件。
const fs = require('fs');
const path = require('path');
const { evalParams } = require('../server/lib.js');

const DIR = __dirname;
const HIS = path.join(DIR, 'history');

const today = '2026-11-15';
const now = '2026-11-15 00:30';

// ---- 本次 WebFetch 抓取结果（2026-11-13 为最新 NY 交易日；Nov 15 为周日，周末无新 session）----
const gold = 3881.75;      // TradingEconomics 黄金 Actual (2026-11-13 最终收盘)
const silver = 48.721;     // TradingEconomics 白银 Actual (2026-11-13)
const goldPrice = Math.round(gold);                // 3882
const gsr = Math.round((gold / silver) * 100) / 100; // 79.67
const dxy = 103.412;       // TradingEconomics DXY (2026-11-13)
const ffr = 4.00;          // FRED DFEDTARU (2026-11-14)
const ust10y = 5.15;       // 美国财政部曲线 2026-11-13
const ust2y = 4.88;        // 美国财政部曲线 2026-11-13
const curve = Math.round((ust10y - ust2y) * 100) / 100; // 0.27
const t10yie = 2.24;       // FRED T10YIE (2026-11-13)
const tips = Math.round((ust10y - t10yie) * 100) / 100; // 2.91
const twi = 121.8803;      // FRED DTWEXBGS (2026-11-06)
const ecbdfr = 2.50;       // FRED ECBDFR (2026-11-13)
const ratediff = Math.round((ffr - ecbdfr) * 100) / 100; // 1.50
const vix = 25.64;         // MarketWatch VIX WebFetch JS 拦截→沿用上次值
const cb = 321;            // WGC 落地页 404→沿用上次值
const gpr = 55, fiscal = 60, etf = 3; // 结构性沿用

const params = { tips, ust10y, ust2y, ffr, curve, dxy, twi, ratediff, cb, gpr, fiscal, vix, etf };
const ev = evalParams(params);
const comp = ev.comp, score100 = ev.score100, band = ev.band.name, color = ev.band.color, act = ev.band.short;

console.log('computed -> comp=%s score100=%s band=%s color=%s act=%s gsr=%s goldPrice=%s',
  comp, score100, band, color, act, gsr, goldPrice);

// ---- 1) snapshot.json ----
const snapPath = path.join(DIR, 'snapshot.json');
const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));

snap.updated = now;
snap.date = today;
snap.goldPrice = goldPrice;
snap.source = "TradingEconomics(WebFetch免key) 黄金 3881.75 / 白银 48.721 (2026-11-13 NY 最终收盘, 较11-14运行取到的盘中3873.88上调为最终收盘); TradingEconomics DXY 103.412 (2026-11-13); 美国财政部日频收益率曲线(WebFetch 成功 2026-11-13: 2Y=4.88/10Y=5.15→curve=0.27); FRED(DFEDTARU 成功=4 2026-11-14; T10YIE 成功=2.24 2026-11-13; DTWEXBGS 成功=121.8803 2026-11-06; ECBDFR 成功=2.5 2026-11-13); MarketWatch(VIX WebFetch JS 拦截→沿用 25.64 上次值); WGC(落地页 404→沿用 321t 上次值)。westock-mcp 连接器本环境不可用(data_* 工具未注册), 全部行情经 WebFetch(免key) 刷新, 零付费账号/API key。";
snap.stale = false;
snap.note = "westock-mcp 连接器在本环境不可用(data_futures/data_forex/data_macro/data_kline 均未注册), 按任务允许的替代通道全部经 WebFetch(免key) 刷新, 零付费账号/API key。本次为 2026-11-15 例行刷新(每日自动化; 实际触发 00:30 GMT+8 对应纽约周六 2026-11-14 午间, 最新 NY 交易日仍为 2026-11-13 周五, 周末无新 session): 取到最新行情——TradingEconomics 黄金最终收盘 3881.75 / 白银 48.721 (goldPrice 取整 3882, 较 11-14 运行盘中 3873.88/49.982 上调/回落 +0.21%/-2.52%, gsr 77.51→79.67 因银价走弱被动推升); TradingEconomics DXY 103.412(2026-11-13, 较上次 103.2373 微升, 仍 mapDXY -0.7); 美国财政部曲线 CSV WebFetch 成功刷新至 2026-11-13: 2Y=4.88/10Y=5.15(10Y 维持破5%→mapUst10 -1.0)→curve=0.27; FRED DFEDTARU 4(11-14)/T10YIE 2.24(11-13)→tips=2.91/DTWEXBGS 121.8803(11-06, mapTWI -0.1)/ECBDFR 2.5(11-13)→ratediff=1.5; MarketWatch VIX 本次 WebFetch JS 拦截→按任务兜底沿用 25.64(上次值, mapVIX 0.5); WGC 落地页 404→按任务兜底沿用 321t(上次值)。关键结论: 加权 13 项参数映射区间较 11-14 无一跨阈值(T10YIE 2.20→2.24 仅使 tips 2.90→2.91 仍落 mapTIPS -1 桶; 其余同桶) → comp 仍为 -0.159、score100 仍为 42.1, 中性窗口·观望 与上期完全一致。goldPrice/gsr 不参与加权, 仅随现货修正。comp 经 server/lib.js evalParams() 复核一致。gpr/fiscal/etf 结构性沿用。";
snap.provenance = {
  gold_silver: "TradingEconomics 现货金/银: 黄金 3881.75 / 白银 48.721 美元/盎司 (2026-11-13 NY 最终收盘, WebFetch免key；westock-mcp fuGC/fuSI 不可用)",
  goldPrice: "COMEX黄金参考价: TradingEconomics 黄金 3881.75 美元/盎司 (2026-11-13 NY 最终收盘, 取整数=3882)。westock-mcp data_kline(fuGC) 与 data_futures(fuGC) 均不可用, 按任务兜底改经 WebFetch 获取现货金作为 COMEX 参考价",
  dxy: "美元指数 DXY: 103.412 (TradingEconomics WebFetch 成功解析, 2026-11-13, mapDXY -0.7)",
  ffr: "联邦基金利率目标上限: FRED DFEDTARU 最新完整行=4% (2026-11-14；FOMC 9/16-17 加息25bp至 3.75%-4.00% 后维持；WebFetch 成功)",
  ust10y: "美国财政部 Daily Treasury Par Yield Curve 10Y CMT: 5.15% (2026-11-13, 美国财政部曲线 CSV WebFetch 成功；升破5%)",
  ust2y: "美国财政部 Daily Treasury Par Yield Curve 2Y CMT: 4.88% (2026-11-13, 美国财政部曲线 CSV WebFetch 成功)",
  gsr: "派生 = 黄金/白银 = 3881.75/48.721 = " + gsr + " (TradingEconomics, 2026-11-13 NY)",
  curve: "派生 = ust10y - ust2y = 5.15-4.88 = " + curve + " (美国财政部曲线 2026-11-13)",
  tips: "派生 = ust10y - T10YIE = 5.15 - 2.24 = " + tips + "% (T10YIE 2026-11-13, FRED WebFetch 成功；ust10y 5.15)",
  twi: "FRED DTWEXBGS 贸易加权美元指数=121.8803 (2026-11-06, 免key WebFetch 成功, mapTWI -0.1)",
  ratediff: "FRED ECBDFR 欧央行存款便利利率=2.5% (2026-11-13, 免key WebFetch 成功) 派生: ffr - ECB = 4-2.5 = 1.5%",
  vix: "MarketWatch VIX: 25.64 (本次 WebFetch JS 拦截→按任务兜底沿用上次值, mapVIX 0.5)",
  cb: "世界黄金协会(WGC) 央行购金(季频): 全球央行净购金 321t(Q3 2026, 发布于 2026-11-03), 本次落地页 404→按任务兜底沿用上次值",
  gpr: "结构性判断基准 55 (地缘风险指数无免费日频 API, 月频手动复核；沿用)",
  fiscal: "结构性判断基准 60 (美元信用风险/财政无免费日频 API, 季频手动复核；沿用)",
  etf: "GLD ETF 月度流量=3$B (纽约交易所各大银行财报披露, 季频; 无免费日频API, 按最新季报基准沿用)"
};
snap.freshness = {
  vix:      { src: "MarketWatch(WebFetch JS 拦截→沿用 25.64)", freq: "日频", date: "2026-11-06" },
  dxy:      { src: "TradingEconomics(WebFetch 成功 103.412)", freq: "日频", date: "2026-11-13" },
  gsr:      { src: "TradingEconomics 金银价派生(WebFetch, 成功)", freq: "日频", date: "2026-11-13" },
  ffr:      { src: "FRED DFEDTARU(WebFetch 成功)", freq: "日频", date: "2026-11-14" },
  ust10y:   { src: "美国财政部日频曲线(WebFetch 成功 2026-11-13)", freq: "日频", date: "2026-11-13" },
  ust2y:    { src: "美国财政部日频曲线(WebFetch 成功 2026-11-13)", freq: "日频", date: "2026-11-13" },
  tips:     { src: "FRED T10YIE 派生(WebFetch 成功 2026-11-13)", freq: "日频", date: "2026-11-13" },
  twi:      { src: "FRED DTWEXBGS(WebFetch 成功 2026-11-06)", freq: "日频(滞后~数日)", date: "2026-11-06" },
  ratediff: { src: "FRED ECBDFR 派生(WebFetch 成功 2026-11-13)", freq: "日频", date: "2026-11-13" },
  cb:       { src: "世界黄金协会 WGC Q3 2026(落地页 404→沿用 321t)", freq: "季频", date: "2026-09-30" },
  etf:      { src: "纽约交易所大行财报披露(GLD持仓/流量)", freq: "季频(大行财报)", date: "2026 Q2" },
  gpr:      { src: "结构性判断(无免费日频)", freq: "月频复核", date: "基准55" },
  fiscal:   { src: "结构性判断(无免费日频)", freq: "季频复核", date: "基准60" }
};
snap.params = { tips, ust10y, ust2y, ffr, curve, dxy, twi, ratediff, cb, gpr, fiscal, vix, etf };
snap.valid = { gsr };
snap.score100 = score100;
snap._score100_note = "100 分制窗口分（50=中性），由 server/lib.js evalParams() 实时计算口径一致";
snap.comp = comp;
snap.band = band;
snap.color = color;
snap.act = act;

fs.writeFileSync(snapPath, JSON.stringify(snap, null, 2), 'utf8');

// ---- 2) history/<today>.json ----
const arch = JSON.parse(JSON.stringify(snap));
arch.archivedAt = now;
fs.writeFileSync(path.join(HIS, today + '.json'), JSON.stringify(arch, null, 2), 'utf8');

// ---- 3) gold_kline.json（更新 2026-11-13 节点为最终收盘，维持 120 条升序；周末不新增 session）----
const kPath = path.join(DIR, 'gold_kline.json');
const k = JSON.parse(fs.readFileSync(kPath, 'utf8'));
const gStr = gold.toFixed(2);
let target = k.data.nodes.find(n => n.date === '2026-11-13');
if (target) {
  target.last = gStr;
  target.high = gStr; // 3881.75 > 既有 3873.88
  // open/low 沿用既有 3871.50
} else {
  // 兜底：若节点缺失则追加
  const prevLast = k.data.nodes[k.data.nodes.length - 1].last;
  k.data.nodes.push({ date: '2026-11-13', open: prevLast, high: gStr, low: prevLast, last: gStr, volume: '0.00', amount: '0.00' });
}
k.data.nodes.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
while (k.data.nodes.length > 120) k.data.nodes.shift();
k.updated = now;
k.source = "TradingEconomics 黄金(WebFetch,免key) 2026-11-13 NY 最终收盘 3881.75 美元/盎司（westock-mcp data_kline 不可用，改经 WebFetch 现货金作 COMEX 参考；volume/amount 缺省）。120 条日线升序。";
k.note = "TradingEconomics(WebFetch,免key) COMEX黄金参考价 2026-11-13 最终收盘 = 3881.75 美元/盎司（更新 2026-11-13 节点：open=3871.50、last=3881.75、high=3881.75、low=3871.50；volume/amount 缺省；周末无新 session，维持 120 条日线升序）。";
fs.writeFileSync(kPath, JSON.stringify(k, null, 2), 'utf8');

// ---- 4) history/index.json ----
const iPath = path.join(HIS, 'index.json');
const idx = JSON.parse(fs.readFileSync(iPath, 'utf8'));
if (!idx.dates.includes(today)) idx.dates.push(today);
idx.dates = Array.from(new Set(idx.dates)).sort();
idx.updated = now;
idx.note = "每日自动化刷新（WebFetch 免key，零付费账号/API key）。最新归档: " + today + " (goldPrice=" + goldPrice + ", comp=" + comp + ", score100=" + score100 + ", 中性窗口·观望)。";
idx.summary[today] = { comp, score100, band, color, act, goldPrice };
fs.writeFileSync(iPath, JSON.stringify(idx, null, 2), 'utf8');

// ---- 校验 ----
const snap2 = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
const k2 = JSON.parse(fs.readFileSync(kPath, 'utf8'));
const idx2 = JSON.parse(fs.readFileSync(iPath, 'utf8'));
console.log('VERIFY snapshot.date=%s goldPrice=%s comp=%s score100=%s band=%s gsr=%s',
  snap2.date, snap2.goldPrice, snap2.comp, snap2.score100, snap2.band, snap2.valid.gsr);
console.log('VERIFY kline count=%d first=%s last=%s', k2.data.nodes.length, k2.data.nodes[0].date, k2.data.nodes[k2.data.nodes.length-1].date);
console.log('VERIFY kline last node:', JSON.stringify(k2.data.nodes[k2.data.nodes.length-1]));
console.log('VERIFY index dates count=%d last=%s summary[%s].goldPrice=%s',
  idx2.dates.length, idx2.dates[idx2.dates.length-1], today, idx2.summary[today].goldPrice);
const assertComp = evalParams(snap2.params).comp;
if (assertComp !== comp) throw new Error('comp mismatch: ' + assertComp + ' vs ' + comp);
// 去重升序校验
const dates = k2.data.nodes.map(n => n.date);
const uniq = new Set(dates);
if (uniq.size !== dates.length) throw new Error('kline has duplicate dates');
for (let i = 1; i < dates.length; i++) if (dates[i] < dates[i-1]) throw new Error('kline not ascending');
console.log('OK: all files written and verified (count/asc/uniq/comp consistent).');
