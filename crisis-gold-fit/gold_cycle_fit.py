# -*- coding: utf-8 -*-
"""
经济危机金价拟合曲线 —— 核心算法（零依赖 · Python 可移植版）
============================================================
与 gold_cycle_fit.js 完全等价的实现，方便在非 Node 应用中部署。

依赖：仅 Python 标准库（math / datetime）。无 pandas / numpy 需求。

用法：
    from gold_cycle_fit import build_cycle_fit, aggregate_months
    fit = build_cycle_fit(cycles=cycles, daily_nodes=daily, horizon=30, drift=0.003)
    for pt in fit["curve"]:
        print(pt["month"], pt["norm"], pt["price"])

⚠️ 免责声明：历史形态参照 + 情景假设，非统计回归、非预测。
    drift 为研究示意参数；等权均值受 2008 后 QE 大牛市影响偏乐观。
   不构成投资建议。
"""
import math
from datetime import date

__all__ = [
    "month_index", "months_between", "add_months", "aggregate_months",
    "build_template", "build_cycle_fit",
]


def month_index(ym):
    """'YYYY-MM' → 连续月序号"""
    y, m = str(ym).split("-")[:2]
    return int(y) * 12 + (int(m) - 1)


def months_between(a, b):
    """两月相差月数 b - a"""
    return month_index(b) - month_index(a)


def add_months(ym, n):
    """'YYYY-MM' 加 n 个月 → 'YYYY-MM'"""
    y, m = str(ym).split("-")[:2]
    total = int(y) * 12 + (int(m) - 1) + n
    return "%04d-%02d" % (total // 12, total % 12 + 1)


def aggregate_months(daily_nodes):
    """日线 [{date:'YYYY-MM-DD', last:number}] → 月均价 [{m,avg,count}]，月份升序"""
    import re
    by = {}
    for n in daily_nodes or []:
        m = str(n.get("date", ""))[:7]
        try:
            v = float(n["last"])
        except (KeyError, TypeError, ValueError):
            continue
        if not re.match(r"^\d{4}-\d{2}$", m):
            continue
        by.setdefault(m, []).append(v)
    out = []
    for m in sorted(by):
        arr = by[m]
        out.append({"m": m, "avg": round(sum(arr) / len(arr), 2), "count": len(arr)})
    return out


def _interpolator(points):
    """线性插值器（升序点 [[x,y],...]），端点外推取端值（clamp）"""
    def at(x):
        if not points:
            return None
        if x <= points[0][0]:
            return points[0][1]
        if x >= points[-1][0]:
            return points[-1][1]
        for i in range(1, len(points)):
            a, b = points[i - 1], points[i]
            if b[0] >= x:
                return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])
        return points[-1][1]
    return at


def build_template(cycles):
    """历史周期 → 归一化对齐 + 逐月等权均值模板。返回 (template, maps, at)"""
    maps = []
    for c in cycles:
        M = {}
        base = None
        for x in c.get("series", []):
            if x[0] == c.get("goldPeak"):
                base = x[1]
                break
        if not base:
            maps.append(M)
            continue
        for x in c["series"]:
            t = months_between(c["goldPeak"], x[0])
            if t >= 0:
                M[t] = x[1] / base * 100.0
        maps.append(M)
    max_t = max([max(m.keys()) if m else 0 for m in maps] + [0])
    tpl = []
    for t in range(max_t + 1):
        vals = [m[t] for m in maps if t in m]
        if vals:
            tpl.append([t, sum(vals) / len(vals)])
    return tpl, maps, _interpolator(tpl)


def build_cycle_fit(cycles, daily_nodes, horizon=30, drift=0.003,
                    min_month=None, anchor_month=None):
    """
    构建拟合曲线。参数与 JS 版 buildCycleFit 一致。

    @return None 或 {
        meta: {...}, curve: [{t,month,norm,price}, ...],
        endpoint: {...}, gainPct: float, cycleEnds: [...]
    }
    """
    months = aggregate_months(daily_nodes)
    min_month = min_month or (months[0]["m"] if months else None)
    if min_month:
        months = [x for x in months if x["m"] >= min_month]
    if not months or not cycles:
        return None

    # 锚点：默认日线最高价所在月
    peak_daily = None
    if not anchor_month:
        for n in sorted(daily_nodes, key=lambda x: str(x.get("date", ""))):
            if peak_daily is None or float(n["last"]) > float(peak_daily["last"]):
                peak_daily = n
        anchor_month = str(peak_daily["date"])[:7] if peak_daily else None
    anchor = next((x for x in months if x["m"] == anchor_month), None)
    if not anchor:
        return None

    tpl, maps, at = build_template(cycles)
    if len(tpl) < 2:
        return None

    last = months[-1]
    t0 = months_between(anchor_month, last["m"])
    cur_norm = last["avg"] / anchor["avg"] * 100.0 if anchor["avg"] > 0 else float("nan")
    tpl0 = at(t0)
    if not (isinstance(tpl0, (int, float)) and math.isfinite(tpl0)) or tpl0 <= 0:
        return None
    if not math.isfinite(cur_norm):
        return None
    scale = cur_norm / tpl0

    curve = []
    for t in range(t0, t0 + horizon + 1):
        v = at(t) * scale * ((1 + drift) ** (t - t0))
        curve.append({
            "t": t,
            "month": add_months(last["m"], t - t0),
            "norm": round(v, 1),
            "price": round(anchor["avg"] * v / 100.0),
        })

    ends = []
    for i, m in enumerate(maps):
        if not m:
            continue
        own_at = _interpolator(sorted([[k, v] for k, v in m.items()]))
        base = own_at(t0)
        if base is None:
            continue
        v = own_at(t0 + horizon) / base * cur_norm * ((1 + drift) ** horizon)
        ends.append({
            "name": cycles[i].get("short") or cycles[i].get("name") or ("cycle%d" % i),
            "norm": round(v, 1),
            "price": round(anchor["avg"] * v / 100.0),
        })

    return {
        "meta": {
            "anchorMonth": anchor_month,
            "anchorAvg": anchor["avg"],
            "peakDaily": ({"date": peak_daily["date"], "last": float(peak_daily["last"])}
                          if peak_daily else None),
            "lastMonth": last["m"],
            "lastAvg": last["avg"],
            "t0": t0,
            "curNorm": round(cur_norm, 1),
            "horizon": horizon,
            "drift": drift,
        },
        "curve": curve,
        "endpoint": curve[-1],
        "gainPct": round((curve[-1]["norm"] / cur_norm - 1) * 100.0, 1),
        "cycleEnds": ends,
    }
