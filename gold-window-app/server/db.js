'use strict';
// 数据访问层：node:sqlite（Node 22 内置），负责建表 + 从 data/ JSON 迁移 + 读写
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');          // gold-window-app/
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(__dirname, 'pm.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS snapshots (
  date TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS history (
  date TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  gold_price REAL,
  comp REAL,
  score100 REAL,
  band TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS kline (
  date TEXT PRIMARY KEY,
  last REAL, open REAL, high REAL, low REAL,
  volume REAL, amount REAL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

const upsertSnapshot = db.prepare(`INSERT INTO snapshots(date,payload) VALUES(?,?)
  ON CONFLICT(date) DO UPDATE SET payload=excluded.payload, created_at=datetime('now','localtime')`);
const upsertHistory = db.prepare(`INSERT INTO history(date,payload,gold_price,comp,score100,band) VALUES(?,?,?,?,?,?)
  ON CONFLICT(date) DO UPDATE SET payload=excluded.payload, gold_price=excluded.gold_price,
  comp=excluded.comp, score100=excluded.score100, band=excluded.band, created_at=datetime('now','localtime')`);
const upsertKline = db.prepare(`INSERT INTO kline(date,last,open,high,low,volume,amount) VALUES(?,?,?,?,?,?,?)
  ON CONFLICT(date) DO UPDATE SET last=excluded.last, open=excluded.open, high=excluded.high,
  low=excluded.low, volume=excluded.volume, amount=excluded.amount`);
const setMeta = db.prepare(`INSERT INTO meta(key,value) VALUES(?,?)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value`);

// ---- 从 data/ 目录一次性迁移到 SQLite（幂等，可重复执行）----
function migrateFromJson(){
  let nSnap = 0, nHis = 0, nKline = 0;

  // snapshot.json → snapshots 表
  const snapFile = path.join(DATA_DIR, 'snapshot.json');
  if(fs.existsSync(snapFile)){
    try{
      const s = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
      if(s && s.date){ upsertSnapshot.run(s.date, JSON.stringify(s)); nSnap++; }
    }catch(e){ console.error('[migrate] snapshot.json 解析失败:', e.message); }
  }

  // history/*.json → history 表
  const hisDir = path.join(DATA_DIR, 'history');
  if(fs.existsSync(hisDir)){
    for(const f of fs.readdirSync(hisDir).sort()){
      if(!/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue;
      try{
        const h = JSON.parse(fs.readFileSync(path.join(hisDir, f), 'utf8'));
        const date = h.date || f.slice(0,10);
        upsertHistory.run(date, JSON.stringify(h),
          h.goldPrice != null ? Number(h.goldPrice) : null,
          h.comp != null ? Number(h.comp) : null,
          h.score100 != null ? Number(h.score100) : null,
          h.band || null);
        nHis++;
      }catch(e){ console.error('[migrate] 归档解析失败:', f, e.message); }
    }
  }

  // gold_kline.json → kline 表
  const kFile = path.join(DATA_DIR, 'gold_kline.json');
  if(fs.existsSync(kFile)){
    try{
      const k = JSON.parse(fs.readFileSync(kFile, 'utf8'));
      const nodes = k && k.data && k.data.nodes || [];
      for(const nd of nodes){
        if(!nd.date) continue;
        upsertKline.run(nd.date,
          nd.last!=null?Number(nd.last):null, nd.open!=null?Number(nd.open):null,
          nd.high!=null?Number(nd.high):null, nd.low!=null?Number(nd.low):null,
          nd.volume!=null?Number(nd.volume):null, nd.amount!=null?Number(nd.amount):null);
        nKline++;
      }
    }catch(e){ console.error('[migrate] gold_kline.json 解析失败:', e.message); }
  }

  setMeta.run('last_migrate', new Date().toISOString());
  return { nSnap, nHis, nKline };
}

// ---- 查询接口 ----
function latestSnapshot(){
  const row = db.prepare('SELECT date,payload FROM snapshots ORDER BY date DESC LIMIT 1').get();
  return row ? JSON.parse(row.payload) : null;
}
function getSnapshot(date){
  const row = db.prepare('SELECT payload FROM snapshots WHERE date=?').get(date);
  return row ? JSON.parse(row.payload) : null;
}
function listHistory(from, to, limit){
  let sql = 'SELECT date,payload FROM history WHERE 1=1';
  const args = [];
  if(from){ sql += ' AND date>=?'; args.push(from); }
  if(to){ sql += ' AND date<=?'; args.push(to); }
  sql += ' ORDER BY date ASC';
  if(limit){ sql += ' LIMIT ?'; args.push(limit); }
  return db.prepare(sql).all(...args).map(r => JSON.parse(r.payload));
}
function getHistory(date){
  const row = db.prepare('SELECT payload FROM history WHERE date=?').get(date);
  return row ? JSON.parse(row.payload) : null;
}
// 从 data/gold_kline.json 幂等同步节点进 kline 表（严格镜像 JSON 的最新窗口）。
// 每日自动化直接写 JSON 真值源、不走 DB；服务常驻期间 SQLite 会落后于 JSON，
// 因此 API/每日任务在读取前先调用本函数，保证曲线实时同步、且不残留 JSON 已移除的旧节点。
function syncKlineFromJson(){
  const kFile = path.join(DATA_DIR, 'gold_kline.json');
  if(!fs.existsSync(kFile)) return 0;
  let n = 0;
  try{
    const k = JSON.parse(fs.readFileSync(kFile, 'utf8'));
    const nodes = (k && k.data && k.data.nodes) || (k && k.nodes) || [];
    const dates = [];
    for(const nd of nodes){
      if(!nd.date) continue;
      dates.push(nd.date);
      upsertKline.run(nd.date,
        nd.last!=null?Number(nd.last):null, nd.open!=null?Number(nd.open):null,
        nd.high!=null?Number(nd.high):null, nd.low!=null?Number(nd.low):null,
        nd.volume!=null?Number(nd.volume):null, nd.amount!=null?Number(nd.amount):null);
      n++;
    }
    // 移除 JSON 已不再包含的旧节点，使 kline 表严格等于 JSON 窗口（防陈旧/测试数据残留）
    if(dates.length){
      const existing = db.prepare('SELECT date FROM kline').all().map(r=>r.date);
      const keep = new Set(dates), del = db.prepare('DELETE FROM kline WHERE date=?');
      for(const d of existing) if(!keep.has(d)) del.run(d);
    }
  }catch(e){ console.error('[syncKline] gold_kline.json 同步失败:', e.message); }
  return n;
}

function listKline(limit){
  // kline 表会跨多次 migrate 累积所有历史节点（>limit 行），必须取「最新 limit 条」而非最旧。
  // 先按日期降序取最近 limit 条，再反转为升序，保证图表始终展示最新窗口。
  let sql = 'SELECT date,last,open,high,low,volume,amount FROM kline ORDER BY date DESC';
  if(limit) sql += ' LIMIT ?';
  const rows = limit ? db.prepare(sql).all(limit) : db.prepare(sql).all();
  return rows.reverse();
}
function counts(){
  return {
    snapshots: db.prepare('SELECT COUNT(*) c FROM snapshots').get().c,
    history: db.prepare('SELECT COUNT(*) c FROM history').get().c,
    kline: db.prepare('SELECT COUNT(*) c FROM kline').get().c,
  };
}

// ---- 写入接口（供每日定时任务使用）----
function saveSnapshot(s){ if(s && s.date) upsertSnapshot.run(s.date, JSON.stringify(s)); }
function saveHistory(h){
  if(!h || !h.date) return;
  upsertHistory.run(h.date, JSON.stringify(h),
    h.goldPrice != null ? Number(h.goldPrice) : null,
    h.comp != null ? Number(h.comp) : null,
    h.score100 != null ? Number(h.score100) : null,
    h.band || null);
}
function saveKline(nodes){ for(const nd of nodes||[]){ if(nd.date) upsertKline.run(nd.date, nd.last!=null?Number(nd.last):null, nd.open!=null?Number(nd.open):null, nd.high!=null?Number(nd.high):null, nd.low!=null?Number(nd.low):null, nd.volume!=null?Number(nd.volume):null, nd.amount!=null?Number(nd.amount):null); } }

module.exports = { migrateFromJson, syncKlineFromJson, latestSnapshot, getSnapshot, listHistory, getHistory, listKline, counts, saveSnapshot, saveHistory, saveKline };
