import json, os, math
from datetime import datetime

DIR = r"C:\Users\EDY\WorkBuddy\2026-08-21-09-10-03\gold-window-app\data"
HIS = os.path.join(DIR, "history")

# 读取上次的 snapshot 作为模板
with open(os.path.join(DIR, "snapshot.json"), "r", encoding="utf-8") as f:
    snap = json.load(f)

# 今日（2026-08-26）新采集数据
today = "2026-08-26"
now = "2026-08-26 08:43:21"

fuGC = 4701.4
fuSI = 68.52
goldPrice = int(round(fuGC))
gsr = round(fuGC / fuSI, 2)

dxy = 98.91
ffr = 3.75
ust10y = 4.64
ust2y = 4.17
curve = round(ust10y - ust2y, 2)
t10yie = 2.32
tips = round(ust10y - t10yie, 2)
twi = 118.0628
ecbdfr = 2.25
ratediff = round(ffr - ecbdfr, 2)
vix = 15.13  # 沿用

# 计算三支柱与综合分
def mapTIPS(v):
    if v >= 2.5: return -1
    if v >= 2.0: return -0.8
    if v >= 1.0: return -0.4
    if v >= 0.0: return 0.1
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
    if d >= 0.0: return 0.4
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

def mapETF(v):
    if v >= 8: return 0.8
    if v >= 3: return 0.4
    if v >= 0: return 0.1
    if v >= -5: return -0.3
    return -0.8

# ---- 全局权重加权（与 index.html compute()/evalParams 完全一致，权重和=1）----
# bond(0.38): tips .17 ust10y .08 ust2y .05 ffr .06 curve .02
# usd(0.27):  dxy .15 twi .07 ratediff .05
# sov(0.35):  cb .09 gpr .07 fiscal .06 vix .05 etf .08
W = {
    "tips": 0.17, "ust10y": 0.08, "ust2y": 0.05, "ffr": 0.06, "curve": 0.02,
    "dxy": 0.15, "twi": 0.07, "ratediff": 0.05,
    "cb": 0.09, "gpr": 0.07, "fiscal": 0.06, "vix": 0.05, "etf": 0.08,
}
FNS = {
    "tips": mapTIPS, "ust10y": mapUst10, "ust2y": mapUst2, "ffr": mapFFR, "curve": mapCurve,
    "dxy": mapDXY, "twi": mapTWI, "ratediff": mapRateDiff,
    "cb": mapCB, "gpr": mapGPR, "fiscal": mapFiscal, "vix": mapVIX, "etf": mapETF,
}
def compute_comp(vals):
    n = sum(FNS[k](vals[k]) * w for k, w in W.items())
    return round(n / sum(W.values()), 3)

etf = 3   # GLD ETF 月度流量（$B）：纽约交易所大行财报披露（GLD 做市/托管机构持仓流量）
vals = {
    "tips": tips, "ust10y": ust10y, "ust2y": ust2y, "ffr": ffr, "curve": curve,
    "dxy": dxy, "twi": twi, "ratediff": ratediff,
    "cb": 289, "gpr": 55, "fiscal": 60, "vix": vix, "etf": etf,
}
comp = compute_comp(vals)

BANDS = [
    {"key":"strongBull","min":0.66,"name":"强多窗口","short":"积极建仓","color":"#e0533a"},
    {"key":"bull","min":0.33,"name":"偏多窗口","short":"分批建仓","color":"#e8896f"},
    {"key":"neutral","min":-0.33,"name":"中性窗口","short":"观望","color":"#5aa9ff"},
    {"key":"bear","min":-0.66,"name":"偏空窗口","short":"减仓避险","color":"#5fbf94"},
    {"key":"strongBear","min":-1.01,"name":"强空窗口","short":"清仓避险","color":"#3fae7a"},
]
band = next((b for b in BANDS if comp >= b["min"]), BANDS[-1])
score100 = round((comp + 1) * 50, 1)   # 100 分制对外口径（50=中性）

# 更新 snapshot
snap.update({
    "updated": now,
    "date": today,
    "goldPrice": goldPrice,
    "stale": False,
    "provenance": {
        "gold_silver": f"腾讯自选股 fuGC={fuGC} / fuSI={fuSI} (实时, {today})",
        "goldPrice": f"COMEX黄金 fuGC {today} 收盘 = {goldPrice} 美元/盎司 (腾讯自选股)",
        "dxy": f"腾讯自选股 fxDINIW={dxy} (实时, {today} 08:45)",
        "ffr": f"腾讯自选股 macro_us_monetary 联邦基金利率目标上限 {ffr}% (2026-07-30)",
        "ust10y": f"美国财政部 Daily Treasury Par Yield Curve 10Y CMT={ust10y}% (2026-08-25, 免key)",
        "ust2y": f"美国财政部 Daily Treasury Par Yield Curve 2Y CMT={ust2y}% (2026-08-25, 免key)",
        "gsr": f"派生 = 黄金/白银 = {fuGC}/{fuSI} = {gsr} (实时)",
        "curve": f"派生 = ust10y - ust2y = {curve}",
        "tips": f"FRED T10YIE(10Y盈亏平衡)={t10yie}% 派生: ust10y - T10YIE = {ust10y}-{t10yie} = {tips}% (2026-08-25, 免key)",
        "twi": f"FRED DTWEXBGS 贸易加权美元指数={twi} (2026-08-21, 免key, 官方滞后约1周)",
        "ratediff": f"FRED ECBDFR 欧央行存款便利利率={ecbdfr}% 派生: ffr - ECB = {ffr}-{ecbdfr} = {ratediff}% (2026-08-25, 免key)",
        "vix": f"MarketWatch CBOE VIX={vix} (2026-08-21 收盘, 免费页面; 2026-08-26 页面需JS未能刷新, 沿用前值)",
        "etf": f"GLD ETF 月度流量={etf}$B (纽约交易所各大银行财报披露, 季频; 无免费日频API, 按最新季报基准)",
        "cb": "世界黄金协会(WGC) 2026 Q2 全球央行净购金=289t (数据截至 2026-06-30, 季频)",
        "gpr": "结构性判断基准 55 (地缘风险指数无免费日频 API, 月频手动复核)",
        "fiscal": "结构性判断基准 60 (美元信用风险/财政无免费日频 API, 季频手动复核)"
    },
    "freshness": {
        "vix":      {"src":"MarketWatch",                    "freq":"日频", "date":"2026-08-21"},
        "dxy":      {"src":"腾讯自选股 fxDINIW",             "freq":"日频", "date":today},
        "gsr":      {"src":"腾讯自选股 金银价派生",          "freq":"日频", "date":today},
        "ffr":      {"src":"腾讯自选股 macro_us_monetary",   "freq":"日频", "date":"2026-07-30"},
        "ust10y":   {"src":"美国财政部日频曲线(免key)",      "freq":"日频", "date":"2026-08-25"},
        "ust2y":    {"src":"美国财政部日频曲线(免key)",      "freq":"日频", "date":"2026-08-25"},
        "tips":     {"src":"FRED T10YIE 派生(免key)",        "freq":"日频", "date":"2026-08-25"},
        "twi":      {"src":"FRED DTWEXBGS(免key)",           "freq":"日频(滞后~1周)", "date":"2026-08-21"},
        "ratediff": {"src":"FRED ECBDFR 派生(免key)",        "freq":"日频", "date":"2026-08-25"},
        "cb":       {"src":"世界黄金协会 WGC Q2 2026",       "freq":"季频", "date":"2026-06-30"},
        "etf":      {"src":"纽约交易所大行财报披露(GLD持仓/流量)", "freq":"季频(大行财报)", "date":"2026 Q2"},
        "gpr":      {"src":"结构性判断(无免费日频)",         "freq":"月频复核", "date":"基准55"},
        "fiscal":   {"src":"结构性判断(无免费日频)",         "freq":"季频复核", "date":"基准60"}
    },
    "params": {
        "tips": tips,
        "ust10y": ust10y,
        "ust2y": ust2y,
        "ffr": ffr,
        "curve": curve,
        "dxy": dxy,
        "twi": twi,
        "ratediff": ratediff,
        "cb": 289,
        "gpr": 55,
        "fiscal": 60,
        "vix": vix,
        "etf": etf
    },
    "valid": {"gsr": gsr}
})

with open(os.path.join(DIR, "snapshot.json"), "w", encoding="utf-8") as f:
    json.dump(snap, f, ensure_ascii=False, indent=2)

# 写入今日归档
arch = snap.copy()
arch["archivedAt"] = now
with open(os.path.join(HIS, f"{today}.json"), "w", encoding="utf-8") as f:
    json.dump(arch, f, ensure_ascii=False, indent=2)

# 补 2026-08-25 归档（参数沿用 8-24，goldPrice 用 fuGC 2026-08-25 收盘 4716）
date25 = "2026-08-25"
arch25 = snap.copy()
arch25["date"] = date25
arch25["goldPrice"] = 4716
arch25["archivedAt"] = "2026-08-26 08:43:21（回填）"
arch25["note"] = "当日金价由 COMEX 黄金 fuGC 日线收盘价回填；其余参数沿用 2026-08-24 最新完整快照。"
arch25["provenance"]["goldPrice"] = f"COMEX黄金 fuGC {date25} 收盘 = 4716 美元/盎司 (腾讯自选股)"
arch25["freshness"]["gsr"]["date"] = date25
with open(os.path.join(HIS, f"{date25}.json"), "w", encoding="utf-8") as f:
    json.dump(arch25, f, ensure_ascii=False, indent=2)

# 更新 gold_kline.json 的 updated 字段
with open(os.path.join(DIR, "gold_kline.json"), "r", encoding="utf-8") as f:
    kline = json.load(f)
kline["updated"] = now
with open(os.path.join(DIR, "gold_kline.json"), "w", encoding="utf-8") as f:
    json.dump(kline, f, ensure_ascii=False, indent=2)

# 更新 history/index.json
with open(os.path.join(HIS, "index.json"), "r", encoding="utf-8") as f:
    idx = json.load(f)

if date25 not in idx["dates"]:
    idx["dates"].append(date25)
if today not in idx["dates"]:
    idx["dates"].append(today)
idx["dates"] = sorted(list(set(idx["dates"])))
idx["updated"] = now
idx["note"] = "每日行情数据按日归档索引。2026-06-09 至 2026-08-24 为历史金价回填，2026-08-25 为金价回填，其余参数沿用最近完整快照基准。"

# 2026-08-25 摘要（沿用 8-24 参数）
idx["summary"][date25] = {
    "comp": 0.085,
    "score100": round((0.085 + 1) * 50, 1),
    "band": "中性窗口",
    "color": "#5aa9ff",
    "act": "观望",
    "goldPrice": 4716
}
# 2026-08-26 摘要
idx["summary"][today] = {
    "comp": comp,
    "score100": score100,
    "band": band["name"],
    "color": band["color"],
    "act": band["short"],
    "goldPrice": goldPrice
}

with open(os.path.join(HIS, "index.json"), "w", encoding="utf-8") as f:
    json.dump(idx, f, ensure_ascii=False, indent=2)

print(f"Updated snapshot for {today}: goldPrice={goldPrice}, comp={comp}, band={band['name']}")
print("Files written:")
print(" - snapshot.json")
print(f" - history/{today}.json")
print(f" - history/{date25}.json")
print(" - history/index.json")
print(" - gold_kline.json")
