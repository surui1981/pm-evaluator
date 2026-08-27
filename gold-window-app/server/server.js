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

// 补全快照/归档的 comp/score100/band 字段（旧数据缺 comp/band 时按统一口径计算）
function enrich(s){
  if(!s || s.date == null) return s;
  if(s.comp == null || s.band == null){
    const ev = lib.evalParams(s.params || {});
    s.comp = s.comp != null ? s.comp : ev.comp;
    s.score100 = s.score100 != null ? s.score100 : ev.score100;
    s.band = s.band || ev.band.name;
    s.bandColor = s.bandColor || ev.band.color;
    s.bandShort = s.bandShort || ev.band.short;
  }
  return s;
}

// ---- API 路由（先于静态托管声明，保证 /api/* 优先）----
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), counts: db.counts(), db: 'sqlite' });
});

app.get('/api/snapshot', (req, res) => {
  const s = db.latestSnapshot();
  if(!s) return res.status(404).json({ error: 'no snapshot' });
  res.json(enrich(s));
});

app.get('/api/history/:date', (req, res) => {
  const h = db.getHistory(req.params.date);
  if(!h) return res.status(404).json({ error: 'not found' });
  res.json(enrich(h));
});

app.get('/api/history', (req, res) => {
  const { from, to, limit } = req.query;
  const list = db.listHistory(from, to, limit ? parseInt(limit, 10) : null);
  res.json(list.map(enrich));
});

app.get('/api/gold-kline', (req, res) => {
  const nodes = db.listKline(120);
  res.json({ updated: db.latestSnapshot() && db.latestSnapshot().updated || '', source: 'COMEX fuGC', nodes });
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
  idx.summary[today] = {
    comp: snap.comp, score100: snap.score100, band: snap.band,
    color: snap.bandColor, act: snap.bandShort, goldPrice: snap.goldPrice,
  };
  fs.writeFileSync(idxFile, JSON.stringify(idx, null, 2), 'utf8');
}

// 每日更新：抓数 → 计算 → 写库 + 同步 JSON；全部失败则沿用最近快照并标记 stale
async function updateDaily(){
  const today = cnDate();
  console.log(`[daily ${today}] 开始每日更新...`);
  const prev = db.latestSnapshot() || {};
  const base = JSON.parse(JSON.stringify(prev));   // 模板（沿用最近完整快照）

  const f = await fetchAll();
  let fetchedAny = Object.keys(f.vals).length > 0;

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
  });
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
const migrated = db.migrateFromJson();
console.log('[migrate] 迁移完成:', JSON.stringify(migrated));
app.listen(PORT, '127.0.0.1', () => {
  console.log(`PM-Evaluator 后端已启动: http://127.0.0.1:${PORT}`);
  console.log(`  API: /api/health /api/snapshot /api/history /api/gold-kline /api/bands`);
  scheduleDaily();
});
