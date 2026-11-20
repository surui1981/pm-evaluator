// 最小可运行示例：node demo.js
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, 'data');
const { buildCycleFit } = require('./gold_cycle_fit.js');

const cycles = JSON.parse(fs.readFileSync(path.join(D, 'cycles.json'), 'utf8')).cycles;
const dailyNodes = JSON.parse(fs.readFileSync(path.join(D, 'daily_example.json'), 'utf8')).nodes;

const fit = buildCycleFit({ cycles, dailyNodes, horizon: 30, drift: 0.003 });

if (!fit) {
  console.log('数据不足，无法拟合');
} else {
  console.log('锚点:', fit.meta.anchorMonth, '$' + fit.meta.anchorAvg,
              '| 最新:', fit.meta.lastMonth, '归一', fit.meta.curNorm);
  console.log('--- 拟合曲线 (月, 归一化指数, 隐含金价) ---');
  fit.curve.forEach(p => console.log(p.month, p.norm, '$' + p.price));
  console.log('--- 30月终点 ---');
  console.log(fit.endpoint.month, '归一', fit.endpoint.norm, '$' + fit.endpoint.price,
              '(较当前 ' + (fit.gainPct >= 0 ? '+' : '') + fit.gainPct + '%)');
}
