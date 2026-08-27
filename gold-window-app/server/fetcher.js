'use strict';
// 在线数据抓取（尽力而为）：美财政部日频收益率 + FRED（T10YIE/DTWEXBGS/ECBDFR）+ MarketWatch VIX
// 所有失败字段返回 null；调用方负责回退到最近快照。
const https = require('https');
const { URL } = require('url');

function get(url, timeout = 15000){
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(u, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 PM-Evaluator' } }, res => {
      if(res.statusCode >= 400){ reject(new Error('HTTP ' + res.statusCode)); return; }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', c => buf += c);
      res.on('end', () => resolve(buf));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

function parseCsv(text){
  const lines = text.trim().split(/\r?\n/);
  if(lines.length < 2) return [];
  const head = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(l => {
    const cells = l.split(',');
    const o = {};
    head.forEach((h, i) => o[h] = (cells[i]||'').trim());
    return o;
  });
}

// 取 CSV 中最后一个非空数值行
function lastVal(rows, field){
  for(let i = rows.length - 1; i >= 0; i--){
    const v = parseFloat(rows[i][field]);
    if(!isNaN(v) && rows[i][field] !== '') return { date: rows[i].DATE || rows[i].date || '', value: v };
  }
  return null;
}

// 主抓取：返回 { ok, fetched:{...}, vals:{...} }
async function fetchAll(){
  const out = { ok: false, fetched: {}, vals: {}, errors: [] };

  // 1) 美国财政部 2Y/10Y 日频收益率
  try{
    const csv = await get('https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_yield_curve&field_tdr_date_value=2026&page&_format=csv');
    const rows = parseCsv(csv);
    const lastRow = rows[rows.length - 1] || {};
    const y2 = parseFloat(lastRow['2 Yr']), y10 = parseFloat(lastRow['10 Yr']);
    if(!isNaN(y2) && !isNaN(y10)){
      out.vals.ust2y = y2; out.vals.ust10y = y10;
      out.fetched.ust = { date: lastRow.Date || '', y2, y10 };
    } else { out.errors.push('treasury: 最新行缺 2Y/10Y'); }
  }catch(e){ out.errors.push('treasury: ' + e.message); }

  // 2) FRED 系列（免 key CSV）
  const fred = [
    { id: 'T10YIE', field: 'T10YIE', url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=T10YIE&cosd=2026-06-01', key: 't10yie' },
    { id: 'DTWEXBGS', field: 'DTWEXBGS', url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTWEXBGS&cosd=2026-06-01', key: 'twi' },
    { id: 'ECBDFR', field: 'ECBDFR', url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=ECBDFR&cosd=2026-01-01', key: 'ecbdfr' },
  ];
  for(const f of fred){
    try{
      const csv = await get(f.url);
      const lv = lastVal(parseCsv(csv), f.field);
      if(lv){ out.vals[f.key] = lv.value; out.fetched[f.key] = lv; }
      else out.errors.push(f.id + ': 无有效数值');
    }catch(e){ out.errors.push(f.id + ': ' + e.message); }
  }

  // 3) MarketWatch VIX（HTML 页面，解析失败则忽略）
  try{
    const html = await get('https://www.marketwatch.com/investing/index/vix');
    const m = html.match(/(?:class="intraday__price"[^>]*>\s*<span[^>]*>)([0-9.,]+)/) || html.match(/"price"\s*:\s*"?([0-9.]+)/i);
    if(m){ out.vals.vix = parseFloat(m[1].replace(/,/g, '')); out.fetched.vix = { value: out.vals.vix }; }
    else out.errors.push('vix: 页面结构解析失败');
  }catch(e){ out.errors.push('vix: ' + e.message); }

  out.ok = Object.keys(out.vals).length > 0;
  return out;
}

module.exports = { fetchAll };
