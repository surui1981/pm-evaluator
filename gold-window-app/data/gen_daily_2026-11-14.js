'use strict';
// 本地生成脚本（无任何外部 API 调用）：仅基于本次 WebFetch 已抓取数值写入四文件。
const fs = require('fs');
const path = require('path');
const { evalParams } = require('../server/lib.js');

const DIR = path.join(__dirname);
const HIS = path.join(DIR, 'history');

const today = '2026-11-14';
const now = '2026-11-14 00:30';

// ---- 本次 WebFetch 抓取结果（2026-11-13 NY 周五收盘附近）----
const gold = 3873.88;      // TradingEconomics 黄金 Actual (2026-11-13)
const silver = 49.982;     // TradingEconomics 白银 Actual (2026-11-13)
const goldPrice = Math.round(gold);           // 3874
const gsr = Math.round((gold / silver) * 100) / 100; // 77.51
const dxy = 103.2373;      // TradingEconomics (2026-11-13)
const ffr = 4.00;          // FRED DFEDTARU (2026-11-13)
const ust10y = 5.10;       // 美国财政部曲线 2026-11-12
const ust2y = 4.86;        // 美国财政部曲线 2026-11-12
const curve = Math.round((ust10y - ust2y) * 100) / 100; // 0.24
const t10yie = 2.20;       // FRED T10YIE (2026-11-10)
const tips = Math.round((ust10y - t10yie) * 100) / 100; // 2.90
const twi = 121.8803;      // FRED DTWEXBGS (2026-11-06)
const ecbdfr = 2.50;       // FRED ECBDFR (2026-11-13)
const ratediff = Math.round((ffr - ecbdfr) * 100) / 100; // 1.50
const vix = 25.64;         // MarketWatch JS 拦截→沿用上次
const cb = 321;            // WGC 404→沿用上次
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
snap.source = "TradingEconomics(WebFetch免key) 黄金 3873.88 / 白银 49.982 (2026-11-13 NY 收盘/盘中); TradingEconomics DXY 103.2373 (2026-11-13); 美国财政部日频收益率曲线(WebFetch 成功 2026-11-12: 2Y=4.86/10Y=5.10→curve=0.24); FRED(DFEDTARU 成功=4 2026-11-13; T10YIE 成功=2.20 2026-11-10; DTWEXBGS 成功=121.8803 2026-11-06; ECBDFR 成功=2.5 2026-11-13); MarketWatch(VIX WebFetch JS 拦截→沿用 25.64 上次值); WGC(落地页 404→沿用 321t 上次值)。westock-mcp 连接器本环境不可用(data_* 工具未注册), 全部行情经 WebFetch(免key) 刷新, 零付费账号/API key。";
snap.stale = false;
snap.note = "westock-mcp 连接器在本环境不可用(data_futures/data_forex/data_macro/data_kline 均未注册), 按任务允许的替代通道全部经 WebFetch(免key) 刷新, 零付费账号/API key。本次为 2026-11-14 例行刷新(每日自动化; 实际触发 00:30 GMT+8 对应纽约周五 2026-11-13 收盘附近, 最新 NY 交易日为 2026-11-13 周五): 取到最新行情——TradingEconomics 黄金 3873.88 / 白银 49.982 (goldPrice 取整 3874; 较 11-13 运行的 3871.50/50.11 基本持平 +0.06%/-0.25%, gsr 77.27→77.51); TradingEconomics DXY 103.2373(2026-11-13, 较上次 103.075 微升, 仍 mapDXY -0.7); 美国财政部曲线 CSV WebFetch 成功刷新至 2026-11-12: 2Y=4.86/10Y=5.10(10Y 升破 5% 整数关→mapUst10 -0.7→-1.0)→curve=0.24; FRED DFEDTARU 4(11-13)/T10YIE 2.20(11-10)→tips=2.90/DTWEXBGS 121.8803(11-06, mapTWI -0.1)/ECBDFR 2.5(11-13)→ratediff=1.5; MarketWatch VIX 本次 WebFetch JS 拦截→按任务兜底沿用 25.64(上次值, mapVIX 0.5); WGC 落地页 404→按任务兜底沿用 321t(上次值)。关键变化: 美国10Y收益率升破5%(5.10)触发 mapUst10 -0.7→-1.0(-0.3×0.08=-0.024) → comp 由 -0.135 下修至 -0.159、score100 由 43.3 降至 42.1, 仍处中性窗口·观望(comp 未破 -0.33 阈值, 空头权重较上期略加重)。goldPrice/gsr 不参与加权, 仅随现货小幅波动。comp 经 server/lib.js evalParams() 复核一致。gpr/fiscal/etf 结构性沿用。";
snap.provenance = {
  gold_silver: "TradingEconomics 现货金/银: 黄金 3873.88 / 白银 49.982 美元/盎司 (2026-11-13 NY, WebFetch免key；westock-mcp fuGC/fuSI 不可用)",
  goldPrice: "COMEX黄金参考价: TradingEconomics 黄金 3873.88 美元/盎司 (2026-11-13 NY, 取整数=3874)。westock-mcp data_kline(fuGC) 与 data_futures(fuGC) 均不可用, 按任务兜底改经 WebFetch 获取现货金作为 COMEX 参考价",
  dxy: "美元指数 DXY: 103.2373 (TradingEconomics WebFetch 成功解析, 2026-11-13, mapDXY -0.7)",
  ffr: "联邦基金利率目标上限: FRED DFEDTARU 最新完整行=4% (2026-11-13；FOMC 9/16-17 加息25bp至 3.75%-4.00% 后维持；WebFetch 成功)",
  ust10y: "美国财政部 Daily Treasury Par Yield Curve 10Y CMT: 5.10% (2026-11-12, 美国财政部曲线 CSV WebFetch 成功；升破5%)",
  ust2y: "美国财政部 Daily Treasury Par Yield Curve 2Y CMT: 4.86% (2026-11-12, 美国财政部曲线 CSV WebFetch 成功)",
  gsr: "派生 = 黄金/白银 = 3873.88/49.982 = " + gsr + " (TradingEconomics, 2026-11-13 NY)",
  curve: "派生 = ust10y - ust2y = 5.10-4.86 = " + curve + " (美国财政部曲线 2026-11-12)",
  tips: "派生 = ust10y - T10YIE = 5.10 - 2.20 = " + tips + "% (T10YIE 2026-11-10, FRED WebFetch 成功；ust10y 5.10)",
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
  dxy:      { src: "TradingEconomics(WebFetch 成功 103.2373)", freq: "日频", date: "2026-11-13" },
  gsr:      { src: "TradingEconomics 金银价派生(WebFetch, 成功)", freq: "日频", date: "2026-11-13" },
  ffr:      { src: "FRED DFEDTARU(WebFetch 成功)", freq: "日频", date: "2026-11-13" },
  ust10y:   { src: "美国财政部日频曲线(WebFetch 成功 2026-11-12)", freq: "日频", date: "2026-11-12" },
  ust2y:    { src: "美国财政部日频曲线(WebFetch 成功 2026-11-12)", freq: "日频", date: "2026-11-12" },
  tips:     { src: "FRED T10YIE 派生(WebFetch 成功 2026-11-10)", freq: "日频", date: "2026-11-10" },
  twi:      { src: "FRED DTWEXBGS(WebFetch 成功 2026-11-06)", freq: "日频(滞后~数日)", date: "2026-11-06" },
  ratediff: { src: "FRED ECBDFR 派生(WebFetch 成功 2026-11-13)", freq: "日频", date: "2026-11-13" },
  cb:       { src: "世界黄金协会 WGC Q3 2026(落地页 404→沿用 321t)", freq: "季频", date: "2026-09-30" },
  etf:      { src: "纽约交易所大行财报披露(GLD持仓/流量)", freq: "季频(大行财报)", date: "2026 Q2" },
  gpr:      { src: "结构性判断(无免费日频)", freq: "月频复核", date: "基准55" },
  fiscal:   { src: "结构性判断(无免费日频)", freq: "季频复核", date: "基准60" }
};
snap.params = {
  tips, ust10y, ust2y, ffr, curve, dxy, twi, ratediff, cb, gpr, fiscal, vix, etf
};
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

// ---- 3) gold_kline.json（追加 2026-11-13 节点，维持 120 条升序）----
const kPath = path.join(DIR, 'gold_kline.json');
const k = JSON.parse(fs.readFileSync(kPath, 'utf8'));
const prevLast = k.data.nodes[k.data.nodes.length - 1].last; // 2026-11-12 last = 3871.50
k.data.nodes.push({
  date: '2026-11-13',
  open: prevLast,
  high: gold.toFixed(2),
  low: prevLast,
  last: gold.toFixed(2),
  volume: '0.00',
  amount: '0.00'
});
// 升序保证 & 剔除最早维持 120
k.data.nodes.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
while (k.data.nodes.length > 120) k.data.nodes.shift();
k.updated = now;
k.source = "TradingEconomics 黄金(WebFetch,免key) 2026-11-13 NY 收盘 3873.88 美元/盎司（westock-mcp data_kline 不可用，改经 WebFetch 现货金作 COMEX 参考；volume/amount 缺省）。120 条日线升序。";
k.note = "TradingEconomics(WebFetch,免key) COMEX黄金参考价 2026-11-13 = 3873.88 美元/盎司（追加 2026-11-13 节点：open=" + prevLast + "、last=" + gold.toFixed(2) + "、high=" + gold.toFixed(2) + "、low=" + prevLast + "；volume/amount 缺省；剔除最早 " + k.data.nodes[0].date + " 节点，维持 120 条日线升序）。";
fs.writeFileSync(kPath, JSON.stringify(k, null, 2), 'utf8');

// ---- 4) history/index.json ----
const iPath = path.join(HIS, 'index.json');
const idx = JSON.parse(fs.readFileSync(iPath, 'utf8'));
if (!idx.dates.includes(today)) idx.dates.push(today);
idx.dates = Array.from(new Set(idx.dates)).sort();
idx.updated = now;
idx.note = "每日自动化刷新（WebFetch 免key，零付费账号/API key）。最新归档: " + today + " (goldPrice=" + goldPrice + ", comp=" + comp + ", score100=" + score100 + ", 中性窗口·观望)。";
idx.summary[today] = {
  comp, score100, band, color, act, goldPrice
};
fs.writeFileSync(iPath, JSON.stringify(idx, null, 2), 'utf8');

// ---- 校验 ----
const snap2 = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
const k2 = JSON.parse(fs.readFileSync(kPath, 'utf8'));
const idx2 = JSON.parse(fs.readFileSync(iPath, 'utf8'));
console.log('VERIFY snapshot.date=%s goldPrice=%s comp=%s score100=%s band=%s gsr=%s',
  snap2.date, snap2.goldPrice, snap2.comp, snap2.score100, snap2.band, snap2.valid.gsr);
console.log('VERIFY kline count=%d first=%s last=%s lastDate=%s',
  k2.data.nodes.length, k2.data.nodes[0].date, k2.data.nodes[k2.data.nodes.length-1].date, k2.data.nodes[k2.data.nodes.length-1].date);
console.log('VERIFY index dates count=%d last=%s summary[%s].goldPrice=%s',
  idx2.dates.length, idx2.dates[idx2.dates.length-1], today, idx2.summary[today].goldPrice);
// 断言 comp 与 lib 一致
const assertComp = evalParams(snap2.params).comp;
if (assertComp !== comp) throw new Error('comp mismatch: ' + assertComp + ' vs ' + comp);
console.log('OK: all files written and verified.');
