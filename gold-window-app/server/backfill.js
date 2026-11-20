'use strict';
// 历史金价回填工具（幂等，可每日重复运行）
// 背景：每日 00:30(北京) 归档抓到的是「前一交易日收盘价」，却打了当日日期戳 → 与 gold_kline 同日收盘错位一天。
// 策略（零篡改）：
//   - 原 goldPrice 一律保留不动（它是当时的真实记录），新增 goldPriceClose = gold_kline 同日收盘真值。
//   - 归档缺 comp/band/score100 时，从 index.json 的历史评估值回填（非伪造，是当时 index 已记录的评估）。
//   - 交易日同日有 kline → goldPriceClose = 该日 last，goldPriceAligned=true。
//   - 周末/休市无 kline → goldPriceClose = null，沿用 goldPrice 展示，goldPriceAligned=false（不臆造价格）。
//   - 幂等：重复运行覆盖的是派生字段，不触碰任何原始记录字段。
// 用法：node server/backfill.js [--dry]   （--dry 仅报告不写盘）
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const HIS_DIR = path.join(DATA_DIR, 'history');
const DRY = process.argv.includes('--dry');

function readJson(p){ return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJson(p, o){ if(!DRY) fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8'); }

// 1) 真值源：gold_kline.json 日线收盘
const kRaw = readJson(path.join(DATA_DIR, 'gold_kline.json'));
const nodes = (kRaw.data && kRaw.data.nodes) || kRaw.nodes || [];
const closeByDate = {};
for(const nd of nodes){
  if(!nd.date || nd.last == null || !isFinite(+nd.last)) continue;
  closeByDate[nd.date] = Math.round(+nd.last);   // 与 goldPrice 口径一致：整数美元/盎司
}
const kDates = Object.keys(closeByDate).sort();

// 2) 历史评估值源：index.json summary
const idxPath = path.join(HIS_DIR, 'index.json');
const idx = readJson(idxPath);
const summary = idx.summary || {};

// 3) 遍历归档
const files = fs.readdirSync(HIS_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const report = { total: files.length, aligned: 0, weekend: 0, compFilled: 0, bandFilled: 0, alreadyOk: 0, changedFiles: [] };

for(const f of files){
  const p = path.join(HIS_DIR, f);
  const a = readJson(p);
  const d = a.date || f.slice(0, 10);

  // —— 金价回填（只增派生字段）——
  const trueClose = closeByDate[d] != null ? closeByDate[d] : null;
  a.goldPriceClose = trueClose;                         // 同日收盘真值；休市日为 null
  a.goldPriceAligned = trueClose != null;               // 是否已与日线对齐
  if(trueClose != null) report.aligned++; else report.weekend++;

  // —— 历史评估值回填（把 index.summary 已记录的评估同步进归档，避免归档缺 comp）——
  const s = summary[d];
  let touched = false;
  if(a.comp == null && s && s.comp != null){ a.comp = s.comp; report.compFilled++; touched = true; }
  if(a.band == null && s && s.band != null){
    a.band = s.band;
    if(a.bandColor == null && s.color != null) a.bandColor = s.color;
    if(a.bandShort == null && s.act != null) a.bandShort = s.act;
    report.bandFilled++; touched = true;
  }
  if(a.score100 == null && s && s.score100 != null){ a.score100 = s.score100; touched = true; }
  if(!a.provenance) a.provenance = {};
  a.provenance.goldPriceBackfill = trueClose != null
    ? { source: 'gold_kline 同日收盘', date: d, close: trueClose, note: '回填字段，原 goldPrice 未改动' }
    : { source: '休市无日线', date: d, close: null, note: '沿用 goldPrice（T-1 收盘）' };

  const before = JSON.stringify(a);
  writeJson(p, a);
  report.changedFiles.push(f);
  if(!touched) report.alreadyOk++;
}

// 4) 同步 index.json：summary 每项补 goldPriceClose / goldPriceAligned（供静态版日历与回测使用）
for(const d of idx.dates || []){
  if(!summary[d]) continue;
  const c = closeByDate[d] != null ? closeByDate[d] : null;
  summary[d].goldPriceClose = c;
  summary[d].goldPriceAligned = c != null;
}
idx.updated = idx.updated || new Date().toISOString().slice(0, 16).replace('T', ' ');
idx.note = (idx.note || '') + (idx.note && idx.note.indexOf('金价回填') >= 0 ? '' : ' ｜ 金价回填：goldPriceClose 为 gold_kline 同日收盘真值，goldPrice 保留原始记录');
writeJson(idxPath, idx);

// 5) 当日 snapshot.json 也带对齐字段（今日若 kline 尚未有同日收盘则为 null，次日回填）
const snapPath = path.join(DATA_DIR, 'snapshot.json');
const snap = readJson(snapPath);
const todayClose = closeByDate[snap.date] != null ? closeByDate[snap.date] : null;
snap.goldPriceClose = todayClose;
snap.goldPriceAligned = todayClose != null;
if(!snap.provenance) snap.provenance = {};
snap.provenance.goldPriceBackfill = todayClose != null
  ? { source: 'gold_kline 同日收盘', date: snap.date, close: todayClose, note: '回填字段，原 goldPrice 未改动' }
  : { source: '当日收盘未生成', date: snap.date, close: null, note: 'goldPrice 为抓取时 T-1 参考价，次日 kline 更新后回填' };
writeJson(snapPath, snap);

console.log('[backfill] ' + (DRY ? 'DRY RUN（未写盘）' : '完成'));
console.log('[backfill] kline 交易日:', kDates.length, '范围', kDates[0], '~', kDates[kDates.length - 1]);
console.log('[backfill] 归档总数:', report.total, '| 同日对齐:', report.aligned, '| 休市沿用:', report.weekend);
console.log('[backfill] comp 回填:', report.compFilled, '| band 回填:', report.bandFilled, '| 评估字段已存在:', report.alreadyOk);
console.log('[backfill] 当日快照 goldPriceClose:', snap.goldPriceClose, '对齐:', snap.goldPriceAligned);
