# -*- coding: utf-8 -*-
"""一次性回填脚本：为 snapshot.json / history/index.json / history/*.json 补充 score100 字段（100 分制，50=中性）。
内部 comp 口径保持 -1~+1 不变，score100 = round((comp+1)*50, 1)。
"""
import json, os, glob

DIR = r"C:\Users\EDY\WorkBuddy\2026-08-21-09-10-03\gold-window-app\data"
HIS = os.path.join(DIR, "history")

# ---- 与 index.html / daily_update.py 一致的 12 项映射（内部 -1~+1）----
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

FNS = {
    "tips": mapTIPS, "ust10y": mapUst10, "ust2y": mapUst2, "ffr": mapFFR,
    "curve": mapCurve, "dxy": mapDXY, "twi": mapTWI, "ratediff": mapRateDiff,
    "cb": mapCB, "gpr": mapGPR, "fiscal": mapFiscal, "vix": mapVIX,
}
W = {"tips":0.17,"ust10y":0.08,"ust2y":0.05,"ffr":0.06,"curve":0.02,
     "dxy":0.15,"twi":0.07,"ratediff":0.05,"cb":0.10,"gpr":0.09,"fiscal":0.07,"vix":0.09}

def comp_of(params):
    n = d = 0.0
    for pid, fn in FNS.items():
        v = params.get(pid)
        if v is None:
            continue
        s = fn(float(v))
        n += s * W[pid]
        d += W[pid]
    return (n / d) if d else 0.0

def sc100(c):
    return round((c + 1) * 50, 1)

# ---- 1) snapshot.json：顶层补 score100 ----
snap_path = os.path.join(DIR, "snapshot.json")
with open(snap_path, "r", encoding="utf-8") as f:
    snap = json.load(f)
if "score100" not in snap and snap.get("params"):
    c = comp_of(snap["params"])
    snap["score100"] = sc100(c)
    snap["_score100_note"] = "100 分制窗口分（50=中性），由 params 实时计算口径一致"
with open(snap_path, "w", encoding="utf-8") as f:
    json.dump(snap, f, ensure_ascii=False, indent=2)
print("snapshot.json -> score100 =", snap.get("score100"))

# ---- 2) history/index.json：summary 每个日期补 score100 ----
idx_path = os.path.join(HIS, "index.json")
with open(idx_path, "r", encoding="utf-8") as f:
    idx = json.load(f)
updated = 0
for dd, s in idx.get("summary", {}).items():
    if "score100" not in s:
        if "comp" in s and s["comp"] is not None:
            s["score100"] = sc100(float(s["comp"]))
        else:
            # 尝试从逐日归档计算
            fp = os.path.join(HIS, dd + ".json")
            if os.path.exists(fp):
                with open(fp, "r", encoding="utf-8") as f:
                    arch = json.load(f)
                if arch.get("params"):
                    s["score100"] = sc100(comp_of(arch["params"]))
        if "score100" in s:
            updated += 1
with open(idx_path, "w", encoding="utf-8") as f:
    json.dump(idx, f, ensure_ascii=False, indent=2)
print("index.json summary updated:", updated, "/", len(idx.get("summary", {})))

# ---- 3) history/*.json：每个归档补顶层 score100 ----
n_files = 0
for fp in glob.glob(os.path.join(HIS, "*.json")):
    base = os.path.basename(fp)
    if base == "index.json":
        continue
    with open(fp, "r", encoding="utf-8") as f:
        arch = json.load(f)
    if "score100" not in arch and arch.get("params"):
        arch["score100"] = sc100(comp_of(arch["params"]))
        arch["_score100_note"] = "100 分制窗口分（50=中性），由 params 按统一口径计算"
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(arch, f, ensure_ascii=False, indent=2)
        n_files += 1
print("history/*.json files updated:", n_files)
print("DONE")
