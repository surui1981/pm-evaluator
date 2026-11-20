/**
 * 经济危机金价拟合曲线 —— 核心算法（零依赖 · 可移植版）
 * ============================================================
 * 来源：PM-Evaluator / gold-window-app 的 buildCycleFitAverage()
 * 用途：把「历史危机周期归一化路径 → 等权均值模板 → 康波长波漂移外推」这条
 *       逻辑从原 Web 应用里剥离出来，形成纯计算函数，可在任何应用中复用。
 *
 * 依赖：无。不依赖 ECharts / DOM / 任何第三方库。计算结果是纯数据，
 *       绘图交给调用方自己的图表库。
 *
 * 用法（Node / CommonJS）：
 *   const { buildCycleFit, aggregateMonths } = require('./gold_cycle_fit.js');
 *   const fit = buildCycleFit({ cycles, dailyNodes, horizon: 30, drift: 0.003 });
 *   // fit.curve = [{t, month, norm, price}, ...]  → 直接喂给折线图
 *
 * 用法（浏览器）：直接 <script src="gold_cycle_fit.js">，全局对象 GoldCycleFit。
 *
 * ⚠️ 免责声明：这是「历史形态参照 + 情景假设」，不是统计回归、不是预测。
 *    drift（康波长波漂移）是研究示意参数；等权均值受 2008 后 QE 大牛市影响偏乐观。
 *   不构成任何投资建议。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GoldCycleFit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 'YYYY-MM' → 连续月序号（便于做月份加减） */
  function monthIndex(ym) {
    const a = String(ym).split('-');
    return (+a[0]) * 12 + (+a[1] - 1);
  }
  /** 两月相差的月数 b - a */
  function monthsBetween(a, b) { return monthIndex(b) - monthIndex(a); }
  /** 'YYYY-MM' 加 n 个月 → 'YYYY-MM' */
  function addMonths(ym, n) {
    const a = String(ym).split('-');
    const d = new Date(+a[0], (+a[1] - 1) + n, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /**
   * 把日线节点 [{date:'YYYY-MM-DD', last:number}, ...] 按自然月聚合为月均价。
   * 返回 [{m:'YYYY-MM', avg:number, count:number}, ...]，按月份升序。
   */
  function aggregateMonths(dailyNodes) {
    const by = Object.create(null);
    (dailyNodes || []).forEach(function (n) {
      const m = String(n.date || '').slice(0, 7);
      const v = +n.last;
      if (!/^\d{4}-\d{2}$/.test(m) || !isFinite(v)) return;
      (by[m] = by[m] || []).push(v);
    });
    return Object.keys(by).sort().map(function (m) {
      const arr = by[m];
      return {
        m: m,
        avg: +(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length).toFixed(2),
        count: arr.length
      };
    });
  }

  /** 线性插值器：给定升序点 [[x,y],...]，返回 at(x)，端点之外做平台（clamp）外推 */
  function makeInterpolator(points) {
    return function at(x) {
      if (!points.length) return null;
      if (x <= points[0][0]) return points[0][1];
      const last = points[points.length - 1];
      if (x >= last[0]) return last[1];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (b[0] >= x) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      }
      return last[1];
    };
  }

  /**
   * 步骤 1+2：把每个历史周期按「距金价阶段高点月数」对齐、归一化为高点=100，
   *           再逐月等权平均，得到经济周期模板 tpl=[[t, norm], ...] 及其插值器。
   * @param cycles [{goldPeak:'YYYY-MM', series:[[YYYY-MM, price], ...]}, ...]
   */
  function buildTemplate(cycles) {
    const maps = (cycles || []).map(function (c) {
      const M = new Map();
      const found = (c.series || []).find(function (x) { return x[0] === c.goldPeak; });
      const base = found && found[1];
      if (!base) return M;
      c.series.forEach(function (x) {
        const t = monthsBetween(c.goldPeak, x[0]);
        if (t >= 0) M.set(t, x[1] / base * 100);   // 高点=100
      });
      return M;
    });
    const maxT = Math.max.apply(null, maps.map(function (m) {
      return m.size ? Math.max.apply(null, Array.from(m.keys())) : 0;
    }).concat([0]));
    const tpl = [];
    for (let t = 0; t <= maxT; t++) {
      const vals = maps.map(function (m) { return m.get(t); })
                       .filter(function (v) { return v != null; });
      if (vals.length) tpl.push([t, vals.reduce(function (a, b) { return a + b; }, 0) / vals.length]);
    }
    return { template: tpl, maps: maps, at: makeInterpolator(tpl) };
  }

  /**
   * 主函数：构建拟合曲线。
   * @param {Object}  opts
   * @param {Array}   opts.cycles      历史周期数组（见 buildTemplate）
   * @param {Array}   opts.dailyNodes  当前周期日线 [{date,last}, ...]
   * @param {number}  [opts.horizon=30] 向后外推月数
   * @param {number}  [opts.drift=0.003] 每月康波长波漂移（0.003=+0.3%/月）
   * @param {string}  [opts.minMonth]  当前周期起始月过滤（如 '2026-01'）；默认取日线最早月
   * @param {string}  [opts.anchorMonth] 手动指定锚点月；默认=日线最高价所在月
   * @returns {Object|null} 拟合结果，或数据不足时返回 null
   */
  function buildCycleFit(opts) {
    const cycles = opts.cycles || [];
    const dailyNodes = opts.dailyNodes || [];
    const horizon = opts.horizon != null ? opts.horizon : 30;
    const drift = opts.drift != null ? opts.drift : 0.003;

    // 当前周期月均价（可过滤起始月）
    let months = aggregateMonths(dailyNodes);
    const minMonth = opts.minMonth || (months.length ? months[0].m : null);
    if (minMonth) months = months.filter(function (x) { return x.m >= minMonth; });
    if (!months.length || !cycles.length) return null;

    // 锚点：默认取日线最高价所在月；其「月均价」作为价格锚
    let anchorMonth = opts.anchorMonth;
    let peakDaily = null;
    if (!anchorMonth) {
      const sorted = dailyNodes.slice().sort(function (a, b) {
        return String(a.date) < String(b.date) ? -1 : 1;
      });
      sorted.forEach(function (n) {
        if (peakDaily == null || (+n.last > +peakDaily.last)) peakDaily = n;
      });
      anchorMonth = peakDaily ? String(peakDaily.date).slice(0, 7) : null;
    }
    const anchor = anchorMonth ? months.find(function (x) { return x.m === anchorMonth; }) : null;
    if (!anchor) return null;

    const built = buildTemplate(cycles);
    if (built.template.length < 2) return null;
    const at = built.at;

    // 当前相对锚点的位置
    const last = months[months.length - 1];
    const t0 = monthsBetween(anchorMonth, last.m);
    const curNorm = anchor.avg > 0 ? last.avg / anchor.avg * 100 : NaN;
    const tpl0 = at(t0);
    if (!isFinite(tpl0) || tpl0 <= 0 || !isFinite(curNorm)) return null;

    // 缩放因子：让拟合线精确穿过当前点
    const scale = curNorm / tpl0;

    // 外推：模板 × 缩放 × (1+drift)^(t-t0)
    const curve = [];
    for (let t = t0; t <= t0 + horizon; t++) {
      const v = at(t) * scale * Math.pow(1 + drift, t - t0);
      curve.push({
        t: t,
        month: addMonths(last.m, t - t0),
        norm: +v.toFixed(1),                       // 归一化指数
        price: +(anchor.avg * v / 100).toFixed(0)  // 隐含美元价
      });
    }

    // 单周期终点（展示离散区间，说明均值受单轮周期影响的范围）
    const ends = built.maps.map(function (m, i) {
      const ownAt = makeInterpolator(Array.from(m.entries())
        .map(function (e) { return [e[0], e[1]]; })
        .sort(function (a, b) { return a[0] - b[0]; }));
      const base = ownAt(t0);
      if (base == null) return null;
      const v = ownAt(t0 + horizon) / base * curNorm * Math.pow(1 + drift, horizon);
      return {
        name: cycles[i].short || cycles[i].name || ('cycle' + i),
        norm: +v.toFixed(1),
        price: +(anchor.avg * v / 100).toFixed(0)
      };
    }).filter(Boolean);

    return {
      meta: {
        anchorMonth: anchorMonth,
        anchorAvg: anchor.avg,
        peakDaily: peakDaily ? { date: peakDaily.date, last: +peakDaily.last } : null,
        lastMonth: last.m,
        lastAvg: last.avg,
        t0: t0,
        curNorm: +curNorm.toFixed(1),
        horizon: horizon,
        drift: drift
      },
      curve: curve,
      endpoint: curve[curve.length - 1],
      gainPct: +((curve[curve.length - 1].norm / curNorm - 1) * 100).toFixed(1),
      cycleEnds: ends
    };
  }

  return {
    monthIndex: monthIndex,
    monthsBetween: monthsBetween,
    addMonths: addMonths,
    aggregateMonths: aggregateMonths,
    buildTemplate: buildTemplate,
    buildCycleFit: buildCycleFit
  };
});
