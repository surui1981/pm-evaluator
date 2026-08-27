# -*- coding: utf-8 -*-
"""一次性升级脚本：GLD ETF 月度流量(etf) 从共振验证升级为主参数（支柱三·sov，权重 0.08）。
- 所有 params 补 etf=3，valid 只保留 gsr
- comp 按「全局权重加权」统一口径重算（与 index.html compute()/evalParams 一致）
- score100 / band / color / act 同步重算
- snapshot.freshness / provenance 补充 etf 条目
"""
import json, os, glob

DIR = r"C:\Users\EDY\WorkBuddy\2026-08-21-09-10-03\gold-window-app\data"
HIS = os.path.join(DIR, "history")

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

# 全局权重（与 index.html 一致，权重和=1）
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
BANDS = [
    ("strongBull", 0.66, "强多窗口", "积极建仓", "#e0533a"),
    ("bull", 0.33, "偏多窗口", "分批建仓", "#e8896f"),
    ("neutral", -0.33, "中性窗口", "观望", "#5aa9ff"),
    ("bear", -0.66, "偏空窗口", "减仓避险", "#5fbf94"),
    ("strongBear", -1.01, "强空窗口", "清仓避险", "#3fae7a"),
]

def comp_of(params):
    p = dict(params)
    p.setdefault("etf", 3)   # 历史 params 无 etf 时按基准 3 补
    n = d = 0.0
    for pid, w in W.items():
        v = p.get(pid)
        if v is None:
            continue
        n += FNS[pid](float(v)) * w
        d += w
    return (n / d) if d else 0.0

def sc100(c):
    return round((c + 1) * 50, 1)

def band_of(c):
    for b in BANDS:
        if c >= b[1]:
            return b
    return BANDS[-1]

def ensure_params(obj, note_prefix=""):
    """补 etf 参数、清理 valid，返回 comp/score100"""
    obj.setdefault("params", {})
    obj["params"].setdefault("etf", 3)
    if obj.get("valid") is not None and "etf" in obj["valid"]:
        obj["valid"].pop("etf", None)
    c = comp_of(obj["params"])
    obj["score100"] = sc100(c)
    return c

# ---- snapshot.json ----
sp = os.path.join(DIR, "snapshot.json")
snap = json.load(open(sp, encoding="utf-8"))
c = ensure_params(snap)
snap["provenance"]["etf"] = "GLD ETF 月度流量=3$B (纽约交易所各大银行财报披露, 季频; 无免费日频API, 按最新季报基准)"
snap["freshness"]["etf"] = {"src": "纽约交易所大行财报披露(GLD持仓/流量)", "freq": "季频(大行财报)", "date": "2026 Q2"}
json.dump(snap, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"snapshot.json -> comp={round(c,3)} score100={snap['score100']}")

# ---- history/*.json ----
n = 0
for fp in glob.glob(os.path.join(HIS, "*.json")):
    if os.path.basename(fp) == "index.json":
        continue
    arch = json.load(open(fp, encoding="utf-8"))
    c = ensure_params(arch)
    arch.setdefault("provenance", {})["etf"] = "GLD ETF 月度流量=3$B (纽约交易所大行财报披露基准)"
    json.dump(arch, open(fp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    n += 1
print(f"history/*.json updated: {n}")

# ---- history/index.json ----
ip = os.path.join(HIS, "index.json")
idx = json.load(open(ip, encoding="utf-8"))
for dd in idx["dates"]:
    fp = os.path.join(HIS, dd + ".json")
    if not os.path.exists(fp):
        continue
    arch = json.load(open(fp, encoding="utf-8"))
    c = comp_of(arch.get("params") or {})
    b = band_of(c)
    idx["summary"].setdefault(dd, {})
    idx["summary"][dd].update({
        "comp": round(c, 3), "score100": sc100(c),
        "band": b[2], "color": b[4], "act": b[3],
    })
json.dump(idx, open(ip, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("index.json summary recomputed for", len(idx["dates"]), "dates")
print("DONE")
