#!/usr/bin/env python3
# fetch_window.py
# 每日拉取「贵金属投资窗口预期评估器」所需行情，写入 data/snapshot.json
#
# 设计目标（生产级健壮 / 稳定更新）：
#   1. 超时 + 指数退避重试，避免偶发网络抖动导致整段失败。
#   2. 单数据源失败隔离：Yahoo / FRED 各自 try/except，互不拖累。
#   3. 连续性兜底：启动时先载入「上次成功快照」作为底值；本次抓取成功的字段覆盖，
#      失败的字段沿用上次值 —— 即使今天网络全断，应用也不会清零或退回写死的默认，
#      而是显示最近一次成功数据（并标记 stale 提示）。
#   4. FRED 免费 key（注册一次，永久免维护）可补齐利率/TIPS/贸易加权/利差；
#      未配置时则用 Yahoo 实时字段 + 上次值，保证尽可能多的项实时。
#
# 数据源：
#   - Yahoo Finance（免 key）：GC=F/SI=F(金银比)、^VIX、6 外汇对算 DXY、
#     ^TNX(10Y)、^TYX(30Y)、^IRX(短端)。
#   - FRED（免费 key，可选）：DGS10/DGS2/FEDFUNDS/T10YIE/DTWEXBGS/ECBDFR
#     → tips=DGS10−T10YIE、curve=DGS10−DGS2、ratediff=FEDFUNDS−ECBDFR、twi=DTWEXBGS。
#
# 仅使用 Python 标准库，可在任意环境直接运行。
# 用法：python fetch_window.py
# FRED 免费 key 获取：https://fred.stlouisfed.org/docs/api/api_key.html
#   把 32 位 key 写入「工作区根目录」fred_key.txt（或设置环境变量 FRED_KEY）。

import json, os, datetime, time, urllib.request, urllib.error

BASE = os.path.dirname(os.path.abspath(__file__))
SNAP = os.path.join(BASE, "snapshot.json")
# 安全：key 文件放在「部署目录之外」（工作区根），避免随静态站点公开发布而泄露。
WORKSPACE = os.path.dirname(os.path.dirname(BASE))
KEYFILE = os.path.join(WORKSPACE, "fred_key.txt")
LEGACY_KEYFILE = os.path.join(BASE, "fred_key.txt")  # 旧位置，仅兼容读取并告警

# 写死默认仅作「完全无历史快照时的首次兜底」，正常运行会被「上次快照」覆盖
DEFAULTS = {
    "tips": 1.80, "ust10y": 4.65, "ust2y": 4.00, "ffr": 4.50, "curve": 0.50,
    "dxy": 98.8, "twi": 118.0, "ratediff": 2.0, "cb": 289, "gpr": 55,
    "fiscal": 60, "vix": 16, "gsr": 67, "etf": 3
}

# 应用实际使用的 12 项（顺序固定，便于前端对照）
ITEMS = ["tips", "ust10y", "ust2y", "ffr", "curve",
         "dxy", "twi", "ratediff", "cb", "gpr", "fiscal", "vix"]


def http_json(url, timeout=12, retries=3):
    """带超时与指数退避重试的 JSON 请求。"""
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            last = e
            if i < retries - 1:
                time.sleep(1.5 * (i + 1))
    raise last


def yahoo_price(sym):
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&range=5d" % sym
    d = http_json(url)
    return float(d["chart"]["result"][0]["meta"]["regularMarketPrice"])


def fred_last(series, api_key):
    url = ("https://api.stlouisfed.org/fred/series/observations?series_id=%s"
           "&api_key=%s&file_type=json&limit=1&sort_order=desc" % (series, api_key))
    d = http_json(url)
    obs = d.get("observations", [])
    if not obs:
        return None
    v = obs[0].get("value")
    if v in (None, "", "."):
        return None
    return float(v)


def _read_key(path):
    if not os.path.exists(path):
        return None
    for line in open(path, encoding="utf-8"):
        k = line.strip()
        if k.startswith("#") or not k:
            continue
        if len(k) == 32 and k.isalnum():
            return k
    return None


def get_fred_key():
    env = os.environ.get("FRED_KEY", "").strip()
    if env:
        return env
    k = _read_key(KEYFILE)
    if k:
        return k
    k = _read_key(LEGACY_KEYFILE)
    if k:
        print("!! 安全警告：key 位于部署目录内 (%s)，会随站点公开发布，请移动到 %s"
              % (LEGACY_KEYFILE, KEYFILE))
        return k
    return None


def load_prev():
    """载入上次成功快照，作为连续性兜底底值。"""
    try:
        with open(SNAP, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def main():
    prev = load_prev()
    prev_params = (prev or {}).get("params", {})
    prev_valid = (prev or {}).get("valid", {})

    # 底值：先用上次成功快照；首次运行则退回写死默认
    out = dict(DEFAULTS)
    for k in out:
        if prev_params.get(k) is not None:
            out[k] = prev_params[k]
    if prev_valid.get("gsr") is not None:
        out["gsr"] = prev_valid["gsr"]
    if prev_valid.get("etf") is not None:
        out["etf"] = prev_valid["etf"]

    notes = []
    used_fred = False
    got_any = False  # 本次是否至少成功拿到一项新数据

    # ---------- Yahoo（免 key） ----------
    try:
        gold = yahoo_price("GC=F")
        silver = yahoo_price("SI=F")
        out["gsr"] = round(gold / silver, 1)
        got_any = True
    except Exception:
        notes.append("Yahoo 金银价失败→沿用上次值")

    try:
        out["vix"] = round(yahoo_price("^VIX"), 1)
        got_any = True
    except Exception:
        notes.append("Yahoo VIX 失败→沿用上次值")

    try:
        eur = yahoo_price("EURUSD=X")
        jpy = yahoo_price("USDJPY=X")
        gbp = yahoo_price("GBPUSD=X")
        cad = yahoo_price("USDCAD=X")
        sek = yahoo_price("USDSEK=X")
        chf = yahoo_price("USDCHF=X")
        dxy = (50.14348112 * (eur ** -0.576) * (jpy ** 0.136) * (gbp ** -0.119)
               * (cad ** 0.091) * (sek ** 0.042) * (chf ** 0.036))
        out["dxy"] = round(dxy, 1)
        got_any = True
    except Exception:
        notes.append("Yahoo 外汇对失败→DXY 沿用上次值")

    try:
        out["ust10y"] = round(yahoo_price("^TNX"), 2)  # 10Y 名义收益率（实时）
        got_any = True
    except Exception:
        notes.append("Yahoo 10Y 失败→沿用上次值")

    # ---------- FRED（免费 key，可选，补齐利率类） ----------
    key = get_fred_key()
    if key:
        used_fred = True
        try:
            dgs10 = fred_last("DGS10", key)
            dgs2 = fred_last("DGS2", key)
            ff = fred_last("FEDFUNDS", key)
            tie = fred_last("T10YIE", key)
            twi = fred_last("DTWEXBGS", key)
            ecb = fred_last("ECBDFR", key)
            if dgs10 is not None:
                out["ust10y"] = round(dgs10, 2); got_any = True
            if dgs2 is not None:
                out["ust2y"] = round(dgs2, 2); got_any = True
            if ff is not None:
                out["ffr"] = round(ff, 2); got_any = True
            if twi is not None:
                out["twi"] = round(twi, 1); got_any = True
            if dgs10 is not None and dgs2 is not None:
                out["curve"] = round(dgs10 - dgs2, 2)
            if dgs10 is not None and tie is not None:
                out["tips"] = round(dgs10 - tie, 2); got_any = True
            if ff is not None and ecb is not None:
                out["ratediff"] = round(ff - ecb, 2); got_any = True
        except Exception as e:
            notes.append("FRED 拉取失败：" + str(e)[:80])
    else:
        notes.append("FRED key 未配置：TIPS/利率/贸易加权/利差用 Yahoo 实时+上次值，请填工作区根 fred_key.txt")

    now = datetime.datetime.now()
    # 结构性参数（央行季购金 / 地缘风险 / 美元信用风险）无免费日频源，保留上次/默认并注明
    notes.append("结构性参数(央行购金/GPR/信用风险)无免费日频源，沿用上次值")

    stale = (not got_any)  # 本次一项新数据都没拿到 → 整份为旧值
    if stale:
        notes.insert(0, "!! 本次全部源获取失败，显示最近一次成功快照（数据可能滞后）")

    snap = {
        "updated": now.strftime("%Y-%m-%d %H:%M:%S"),
        "date": now.strftime("%Y-%m-%d"),
        "source": "Yahoo" + ("+FRED" if used_fred else "(部分)+上次快照"),
        "stale": stale,
        "note": "；".join(notes),
        "params": {k: out[k] for k in ITEMS},
        "valid": {"gsr": out["gsr"], "etf": out["etf"]}
    }
    with open(SNAP, "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=2)
    print("snapshot written ->", snap["source"], "| stale=", stale)
    print("  note:", snap["note"])
    print("  ust10y=", out["ust10y"], "vix=", out["vix"], "dxy=", out["dxy"],
          "gsr=", out["gsr"], "ffr=", out["ffr"], "tips=", out["tips"])


if __name__ == "__main__":
    main()
