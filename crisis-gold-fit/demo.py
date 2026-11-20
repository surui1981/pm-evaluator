# 最小可运行示例：python demo.py
import json, os
from gold_cycle_fit import build_cycle_fit

D = os.path.join(os.path.dirname(__file__), "data")
with open(os.path.join(D, "cycles.json"), encoding="utf-8") as f:
    cycles = json.load(f)["cycles"]
with open(os.path.join(D, "daily_example.json"), encoding="utf-8") as f:
    daily = json.load(f)["nodes"]

fit = build_cycle_fit(cycles=cycles, daily_nodes=daily, horizon=30, drift=0.003)

if not fit:
    print("数据不足，无法拟合")
else:
    m = fit["meta"]
    print("锚点:", m["anchorMonth"], "$%s" % m["anchorAvg"],
          "| 最新:", m["lastMonth"], "归一", m["curNorm"])
    print("--- 拟合曲线 (月, 归一化指数, 隐含金价) ---")
    for p in fit["curve"]:
        print(p["month"], p["norm"], "$%s" % p["price"])
    e = fit["endpoint"]
    print("--- 30月终点 ---")
    print(e["month"], "归一", e["norm"], "$%s" % e["price"],
          "(较当前 %+s%%)" % fit["gainPct"])
