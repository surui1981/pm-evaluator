import json
import os
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.abspath(__file__))
HISTORY_DIR = os.path.join(ROOT, 'history')

with open(os.path.join(ROOT, 'gold_kline.json'), 'r', encoding='utf-8') as f:
    kline = json.load(f)

with open(os.path.join(HISTORY_DIR, '2026-08-24.json'), 'r', encoding='utf-8') as f:
    template = json.load(f)

# 提取交易日收盘价序列
nodes = kline['data']['nodes']
by_date = {}
for n in nodes:
    by_date[n['date']] = {
        'open': float(n['open']),
        'high': float(n['high']),
        'low': float(n['low']),
        'last': float(n['last']),
        'volume': float(n['volume']),
        'amount': float(n['amount']),
    }

# 目标区间：2026-06-09 至 2026-08-24（今天之前）
start = datetime(2026, 6, 9)
end = datetime(2026, 8, 24)

dates = []
cur = start
while cur <= end:
    dates.append(cur.strftime('%Y-%m-%d'))
    cur += timedelta(days=1)

# 复用模板的 params / valid / source / freshness 作为基准
base_params = template['params']
base_valid = template['valid']
base_source = template['source']

now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

summary = {}
for d in dates:
    if d not in by_date:
        continue
    close = round(by_date[d]['last'])

    snap = {
        'archivedAt': now_str,
        'updated': d + ' 15:30:00',
        'date': d,
        'goldPrice': close,
        'source': base_source,
        'stale': False,
        'note': '历史金价回填：当日 COMEX 黄金收盘价已按 gold_kline.json 补录；其余参数（利率/美元/央行购金等）无免费历史日频 API，暂沿用最近完整快照（2026-08-24）基准值，仅用于保持日历与趋势连续展示。',
        'provenance': {
            'goldPrice': 'COMEX黄金 fuGC {} 收盘 = {} 美元/盎司 (gold_kline.json 回填)'.format(d, close),
            'backfill': '其余参数沿用 2026-08-24 快照基准，待后续接入历史数据后替换'
        },
        'freshness': {
            'goldPrice': {'src':'gold_kline.json 历史日线', 'freq':'日频', 'date': d},
            'backfill': {'src':'最近完整快照', 'freq':'一次性回填', 'date':'2026-08-24'}
        },
        'params': base_params,
        'valid': base_valid
    }

    path = os.path.join(HISTORY_DIR, d + '.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(snap, f, ensure_ascii=False, indent=2)

    # 计算综合分（与前端 evalParams 逻辑一致）
    def mapTIPS(v):
        if v >= 2.5: return -1
        if v >= 2.0: return -0.8
        if v >= 1.0: return -0.4
        if v >= 0: return 0.1
        if v >= -0.5: return 0.6
        return 1
    def mapUst10(v):
        if v >= 5.0: return -1
        if v >= 4.5: return -0.7
        if v >= 4.0: return -0.3
        if v >= 3.0: return 0.1
        if v >= 2.0: return 0.5
        return 1
    def mapUst2(v):
        if v >= 5.5: return -1
        if v >= 5.0: return -0.6
        if v >= 4.5: return -0.2
        if v >= 3.5: return 0.3
        if v >= 2.5: return 0.7
        return 1
    def mapFFR(v):
        if v >= 5.5: return -1
        if v >= 5.0: return -0.6
        if v >= 4.5: return -0.2
        if v >= 3.5: return 0.3
        if v >= 2.5: return 0.7
        return 1
    def mapCurve(s):
        if s <= -0.8: return 1
        if s <= -0.2: return 0.6
        if s <= 0.2: return 0.1
        if s <= 1.0: return -0.4
        return -1
    def mapDXY(v):
        if v >= 105: return -1
        if v >= 103: return -0.7
        if v >= 101: return -0.3
        if v >= 99: return 0.1
        if v >= 97: return 0.5
        return 0.9
    def mapTWI(v):
        if v >= 130: return -1
        if v >= 125: return -0.6
        if v >= 120: return -0.1
        if v >= 115: return 0.4
        return 0.8
    def mapRateDiff(d):
        if d >= 3.0: return -1
        if d >= 2.0: return -0.5
        if d >= 1.0: return 0.0
        if d >= 0: return 0.4
        return 1
    def mapCB(t):
        if t >= 300: return 0.9
        if t >= 200: return 0.6
        if t >= 100: return 0.3
        if t >= 0: return -0.1
        return -0.8
    def mapGPR(g):
        if g >= 70: return 0.9
        if g >= 50: return 0.5
        if g >= 30: return 0.1
        return -0.3
    def mapFiscal(r):
        if r >= 70: return 0.9
        if r >= 50: return 0.5
        if r >= 30: return 0.1
        return -0.2
    def mapVIX(v):
        if v >= 30: return 0.9
        if v >= 22: return 0.5
        if v >= 15: return 0.1
        return -0.2

    fns = {
        'tips': mapTIPS, 'ust10y': mapUst10, 'ust2y': mapUst2, 'ffr': mapFFR,
        'curve': mapCurve, 'dxy': mapDXY, 'twi': mapTWI, 'ratediff': mapRateDiff,
        'cb': mapCB, 'gpr': mapGPR, 'fiscal': mapFiscal, 'vix': mapVIX
    }
    weights = {
        'tips': 0.17, 'ust10y': 0.08, 'ust2y': 0.05, 'ffr': 0.06, 'curve': 0.02,
        'dxy': 0.15, 'twi': 0.07, 'ratediff': 0.05,
        'cb': 0.10, 'gpr': 0.09, 'fiscal': 0.07, 'vix': 0.09
    }

    n = d_sum = 0
    for pid, w in weights.items():
        s = fns[pid](base_params[pid])
        n += s * w
        d_sum += w
    comp = n / d_sum if d_sum else 0

    BANDS = [
        {'key':'strongBull', 'min':0.66, 'name':'强多窗口', 'short':'积极建仓', 'color':'#e0533a'},
        {'key':'bull', 'min':0.33, 'name':'偏多窗口', 'short':'分批建仓', 'color':'#e8896f'},
        {'key':'neutral', 'min':-0.33, 'name':'中性窗口', 'short':'观望', 'color':'#5aa9ff'},
        {'key':'bear', 'min':-0.66, 'name':'偏空窗口', 'short':'减仓避险', 'color':'#5fbf94'},
        {'key':'strongBear', 'min':-1.01, 'name':'强空窗口', 'short':'清仓避险', 'color':'#3fae7a'},
    ]
    band = next(b for b in BANDS if comp >= b['min'])

    summary[d] = {
        'comp': round(comp, 3),
        'band': band['name'],
        'color': band['color'],
        'act': band['short'],
        'goldPrice': close
    }

# 写入索引
index = {
    'updated': now_str,
    'note': '每日行情数据按日归档索引。2026-06-09 至 2026-08-24 为历史金价回填，其余参数沿用最近完整快照基准。',
    'dates': sorted(summary.keys()),
    'summary': summary
}
with open(os.path.join(HISTORY_DIR, 'index.json'), 'w', encoding='utf-8') as f:
    json.dump(index, f, ensure_ascii=False, indent=2)

print('回填完成：共', len(summary), '个交易日')
print('日期范围：', min(summary.keys()), '~', max(summary.keys()))
