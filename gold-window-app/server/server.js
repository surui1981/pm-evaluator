'use strict';
// PM-Evaluator 独立后端 API
// 启动：node server.js  （默认 127.0.0.1:8888）
// 功能：静态托管 index.html + 数据 API（/api/*）+ SQLite 存储 + 每日 08:30(北京时间) 定时抓数写库
const express = require('express');
const path = require('path');
const fs = require('fs');

const lib = require('./lib');
const db = require('./db');
const { fetchAll } = require('./fetcher');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const HIS_DIR = path.join(DATA_DIR, 'history');
const PORT = process.env.PORT || 8888;

const app = express();
app.use(express.json());

// freshness「获得时间」真值源：磁盘 JSON 优先于 SQLite 旧副本。
// freshness.date 常被每日自动化遗留成旧模板，而 provenance 才记录真实取值日；
// 这里直接取磁盘当日文件（快照 or 归档）的 freshness 覆盖，避免 DB 副本拖累面板显示。
function freshnessFromDisk(s){
  if(!s || !s.date) return;
  try{
    const rel = (s.date === (JSON.parse(fs.readFileSync(path.join(DATA_DIR,'snapshot.json'),'utf8')).date||''))
      ? 'snapshot.json' : ('history/'+s.date+'.json');
    const fp = path.join(DATA_DIR, rel);
    if(fs.existsSync(fp)){
      const d = JSON.parse(fs.readFileSync(fp,'utf8'));
      if(d.freshness) s.freshness = d.freshness;
      if(d.provenance) s.provenance = d.provenance;   // 前端派生的真值源也一并同步
    }
  }catch(e){ /* 读盘失败则沿用 DB 值 */ }
}

// 补全快照/归档的 comp/score100/band 字段（旧数据缺 comp/band 时按统一口径计算）
// v0.6：归档 comp 为当日快照旧口径；新增 compV06/score100V06/bandV06/regimeV06 为按当前模型
// （含 VIX 状态化）统一重算的新口径，供前端趋势图与明细表核验。原始 comp 不改写（历史真值保留）。
function enrich(s){
  if(!s || s.date == null) return s;
  freshnessFromDisk(s);
  if(s.comp == null || s.band == null){
    const ev = lib.evalParams(s.params || {});
    s.comp = s.comp != null ? s.comp : ev.comp;
    s.score100 = s.score100 != null ? s.score100 : ev.score100;
    s.band = s.band || ev.band.name;
    s.bandColor = s.bandColor || ev.band.color;
    s.bandShort = s.bandShort || ev.band.short;
  }
  if(s.params && Object.keys(s.params).length){
    const evV06 = lib.evalParams(s.params);
    s.compV06 = evV06.comp;
    s.score100V06 = evV06.score100;
    s.bandV06 = evV06.band.name;
    s.regimeV06 = evV06.regime;
  }
  return s;
}

// JSON 是真值源、SQLite 是查询副本：自动化写完 data/ 后常驻服务的 DB 会滞后到次日 08:30。
// 每次读 API 前幂等对齐一次（只在磁盘快照更新时迁移），避免前端在 00:30~08:30 之间读到旧值。
function syncFromDiskIfNeeded(){
  try{
    const disk = JSON.parse(fs.readFileSync(path.join(DATA_DIR,'snapshot.json'),'utf8'));
    const latest = db.latestSnapshot();
    if(disk && disk.date && (!latest || String(disk.updated||'') > String(latest.updated||''))) db.migrateFromJson();
  }catch(e){ /* 磁盘快照不可读时静默沿用 DB */ }
}

// ---- API 路由（先于静态托管声明，保证 /api/* 优先）----
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), counts: db.counts(), db: 'sqlite' });
});

app.get('/api/snapshot', (req, res) => {
  syncFromDiskIfNeeded();
  const s = db.latestSnapshot();
  if(!s) return res.status(404).json({ error: 'no snapshot' });
  const out = enrich(s);
  // v0.6 兜底：每日自动化直接写 JSON 时可能不带 trend，API 层按当日 gold_kline 实时补算，
  // 保证趋势模块长期存活（不依赖自动化 prompt 是否写入该字段）。前端只读、口径仍在 lib.js。
  if(!out.trend){
    try{
      const kraw = JSON.parse(fs.readFileSync(path.join(DATA_DIR,'gold_kline.json'),'utf8'));
      const kn = (kraw.data && kraw.data.nodes) || kraw.nodes || [];
      const tr = lib.trendAssessment(kn, out.params||{}, out.comp);
      if(tr) out.trend = tr;
    }catch(e){ /* 无 kline 时静默跳过，前端隐藏趋势卡 */ }
  }
  res.json(out);
});

app.get('/api/history/:date', (req, res) => {
  syncFromDiskIfNeeded();
  const h = db.getHistory(req.params.date);
  if(!h) return res.status(404).json({ error: 'not found' });
  res.json(enrich(h));
});

app.get('/api/history', (req, res) => {
  syncFromDiskIfNeeded();
  const { from, to, limit } = req.query;
  const list = db.listHistory(from, to, limit ? parseInt(limit, 10) : null);
  res.json(list.map(enrich));
});

app.get('/api/gold-kline', (req, res) => {
  // 每日自动化直接写 gold_kline.json（真值源），SQLite 常驻期间不会自动更新；
  // 每次请求前幂等同步一次，保证 COMEX 曲线始终展示最新日线，不滞留启动快照。
  db.syncKlineFromJson();
  const nodes = db.listKline(120);
  res.json({ updated: db.latestSnapshot() && db.latestSnapshot().updated || '', source: 'COMEX fuGC', nodes });
});

// 历史泡沫周期金价月均价（2000 互联网泡沫 / 2008 房地产泡沫）：静态 JSON 直读，不入库
app.get('/api/gold-cycles', (req, res) => {
  try{
    res.json(JSON.parse(fs.readFileSync(path.join(DATA_DIR,'gold_bubble_cycles.json'),'utf8')));
  }catch(e){ res.status(404).json({ error: 'no gold cycles data' }); }
});

app.get('/api/bands', (req, res) => res.json({ bands: lib.BANDS, weights: lib.W }));

// ---- 静态托管（index.html + data/ 等）----
app.use(express.static(ROOT));

// ---- 每日定时任务：北京时间 08:30（UTC 00:30）----
function nextRunMs(){
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 30, 0));
  if(target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime() - now.getTime();
}

function cnNow(){
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function cnDate(){ return cnNow().slice(0, 10); }

// 同步最新快照到 data/ 静态 JSON（保持云端静态版可用）
function syncDataFiles(snap){
  if(!snap || !snap.date) return;
  const today = snap.date;
  fs.mkdirSync(HIS_DIR, { recursive: true });
  // snapshot.json
  fs.writeFileSync(path.join(DATA_DIR, 'snapshot.json'), JSON.stringify(snap, null, 2), 'utf8');
  // history/YYYY-MM-DD.json
  fs.writeFileSync(path.join(HIS_DIR, today + '.json'), JSON.stringify(snap, null, 2), 'utf8');
  // history/index.json（增量更新 summary）
  const idxFile = path.join(HIS_DIR, 'index.json');
  let idx = { dates: [], summary: {}, updated: '' };
  try{ idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')); }catch(e){}
  if(!idx.dates.includes(today)) idx.dates.push(today);
  idx.dates.sort();
  idx.updated = snap.updated;
  // 同步回填字段：当日收盘若已生成则取真值，否则沿用抓取价并标记未对齐
  const gk = (()=>{ try{ const k=JSON.parse(fs.readFileSync(path.join(DATA_DIR,'gold_kline.json'),'utf8')); const ns=(k.data&&k.data.nodes)||k.nodes||[]; const nd=ns.find(x=>x.date===today); return nd&&nd.last!=null? Math.round(+nd.last):null; }catch(e){ return null; } })();
  idx.summary[today] = {
    comp: snap.comp, score100: snap.score100, band: snap.band,
    color: snap.bandColor, act: snap.bandShort, goldPrice: snap.goldPrice,
    goldPriceClose: gk, goldPriceAligned: gk!=null,
    // v0.6 趋势快照（当日阶段/方向/共振/触发数，便于历史回溯）
    trend: snap.trend ? { phase: snap.trend.phase, phaseName: snap.trend.phaseName,
      direction: snap.trend.direction, confluence: snap.trend.confluence,
      triggersLit: snap.trend.triggersLit, position: snap.trend.position } : undefined,
    modelVersion: snap.modelVersion,
  };
  fs.writeFileSync(idxFile, JSON.stringify(idx, null, 2), 'utf8');
}

// 每日更新：抓数 → 计算 → 写库 + 同步 JSON；全部失败则沿用最近快照并标记 stale
async function updateDaily(){
  const today = cnDate();
  console.log(`[daily ${today}] 开始每日更新...`);
  // 先同步金价真值 JSON → kline 表（自动化直接写 JSON，DB 需跟随），保证图表曲线不落后
  db.syncKlineFromJson();
  // 真值源是 data/*.json（每日自动化写入），SQLite 只是查询副本。
  // 原先一律以 DB 最新快照为模板：常驻服务重启/抓数失败时会回放几年前的旧快照，
  // 把 00:30 刚写入的新快照/归档整体覆盖成陈旧值（日历指数/金价因此多日不变）。
  // 修正：取磁盘快照与 DB 快照中 updated 更新的一方作为模板。
  const dbPrev = db.latestSnapshot() || {};
  let base = dbPrev;
  try{
    const diskSnap = JSON.parse(fs.readFileSync(path.join(DATA_DIR,'snapshot.json'),'utf8'));
    if(diskSnap && diskSnap.date && String(diskSnap.updated||'') >= String(dbPrev.updated||'')) base = diskSnap;
  }catch(e){ /* 磁盘快照不可用则退回 DB */ }
  base = JSON.parse(JSON.stringify(base));

  const f = await fetchAll();
  const fetchedAny = Object.keys(f.vals).length > 0;
  if(!fetchedAny){
    // 抓数全失败时严禁写盘：保留自动化写入的真值，不再用旧数据覆盖今日归档。
    console.warn(`[daily ${today}] 全部数据源抓取失败 → 跳过写盘，保留 data/ 现有快照与归档（不回放旧数据）`);
    return;
  }

  // 组装新 params：抓到的覆盖，抓不到的沿用模板
  const p = Object.assign({}, base.params || {});
  if(f.vals.ust2y != null) p.ust2y = f.vals.ust2y;
  if(f.vals.ust10y != null) p.ust10y = f.vals.ust10y;
  if(f.vals.t10yie != null) p.tips = Math.round((p.ust10y - f.vals.t10yie) * 100) / 100;
  if(f.vals.twi != null) p.twi = f.vals.twi;
  if(f.vals.ecbdfr != null && p.ffr != null) p.ratediff = Math.round((p.ffr - f.vals.ecbdfr) * 100) / 100;
  if(f.vals.vix != null) p.vix = f.vals.vix;

  // 计算
  const ev = lib.evalParams(p);
  const now = cnNow();
  const snap = Object.assign({}, base, {
    date: today, updated: now, params: p, stale: !fetchedAny,
    comp: ev.comp, score100: ev.score100, band: ev.band.name,
    bandColor: ev.band.color, bandShort: ev.band.short,
    regime: ev.regime, modelVersion: '0.6.0',
  });
  // v0.6 趋势评估：基于当日 gold_kline 序列重算（独立于主分，零外部 API）
  try{
    const kraw = JSON.parse(fs.readFileSync(path.join(DATA_DIR,'gold_kline.json'),'utf8'));
    const kn = (kraw.data && kraw.data.nodes) || kraw.nodes || [];
    const tr = lib.trendAssessment(kn, p, ev.comp);
    if(tr) snap.trend = tr;
  }catch(e){ console.warn('[daily] 趋势评估跳过:', e.message); }
  if(!fetchedAny) snap.note = '在线抓取失败，沿用最近快照参数（' + now + '）';

  db.saveSnapshot(snap);
  db.saveHistory(snap);
  syncDataFiles(snap);
  console.log(`[daily ${today}] comp=${ev.comp} score100=${ev.score100} band=${ev.band.name} fetched=${fetchedAny} errors=${JSON.stringify(f.errors)}`);
}

function scheduleDaily(){
  const wait = nextRunMs();
  const h = Math.floor(wait / 3600000), m = Math.floor(wait % 3600000 / 60000);
  console.log(`[scheduler] 下次每日更新（北京时间 08:30）在 ${h} 小时 ${m} 分钟后`);
  setTimeout(async () => {
    try{ await updateDaily(); }catch(e){ console.error('[daily] 执行失败:', e.message); }
    scheduleDaily();
  }, wait);
}

// ---- 启动 ----
// 金价回填闭环：启动时先把 gold_kline 新落入的同日收盘价回填进归档 JSON（幂等），再迁移到 DB。
// 这样每日 08:30 抓数写入新交易日 kline 后，下次启动即自动对齐前一日归档金价，无需人工干预。
try{
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, [path.join(__dirname, 'backfill.js')], { encoding: 'utf8', timeout: 30000 });
  const line = out.split('\n').find(l => l.indexOf('归档总数') >= 0);
  if(line) console.log('[backfill] 启动回填:', line.trim());
}catch(e){ console.error('[backfill] 启动回填失败（不影响服务启动）:', e.message); }
const migrated = db.migrateFromJson();
console.log('[migrate] 迁移完成:', JSON.stringify(migrated));
app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`PM-Evaluator 后端已启动: http://127.0.0.1:${PORT}`);
  console.log(`  API: /api/health /api/snapshot /api/history /api/gold-kline /api/gold-cycles /api/bands`);
  scheduleDaily();
});
