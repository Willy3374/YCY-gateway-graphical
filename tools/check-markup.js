/* check-markup.js — 检查 index.html 关键标记是否齐全 */
const fs = require('fs');
const h = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');

const need = [
  'id="save-overlay"',
  'id="save-name"',
  'id="btn-save-ok"',
  'id="btn-save-cancel"',
  'id="save-hint"',
  'id="save-title"',
  'id="device-panel"',
  'id="device-badge"',
  'id="device-status"',
  'id="device-status-title"',
  'id="device-status-sub"',
  'id="device-list"',
  'id="btn-device-refresh"',
  'id="btn-start"',
  'id="start-overlay"',
  'id="start-title"',
  'id="start-notice"',
  'id="start-notice-text"',
  'id="start-hint"',
  'id="btn-start-close"',
  'js/examples.js',
  'js/device.js',
  'js/theme.js',
  'js/blocks.js',
  'js/engine.js',
  'js/workspace.js',
  'js/main.js',
  'logo-dark.png'
];
let bad = 0;
need.forEach((n) => {
  const ok = h.indexOf(n) >= 0;
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'MISS ') + n);
});

// 脚本引用顺序：examples.js/device.js 必须在 engine.js/workspace.js 之前、main.js 之前
const order = ['theme.js', 'blocks.js', 'examples.js', 'device.js', 'engine.js', 'workspace.js', 'main.js']
  .map((f) => h.indexOf('js/' + f));
const sorted = order.every((v, i, a) => v >= 0 && (i === 0 || a[i - 1] < v));
console.log((sorted ? 'OK   ' : 'MISS ') + '脚本加载顺序 theme→blocks→examples→device→engine→workspace→main');
if (!sorted) bad++;

// 状态栏必须位于画布之后（页面右侧）
const canvasEnd = h.lastIndexOf('id="canvas"');
const panelStart = h.indexOf('id="device-panel"');
const rightSide = canvasEnd >= 0 && panelStart > canvasEnd;
console.log((rightSide ? 'OK   ' : 'MISS ') + '连接状态栏位于画布之后（页面右侧）');
if (!rightSide) bad++;

// 顶部菜单栏：执行 → 生成，且「开始」在「生成」右侧
const runIdx = h.indexOf('id="btn-run"');
const startIdx = h.indexOf('id="btn-start"');
console.log((h.indexOf('执行') < 0 ? 'OK   ' : 'MISS ') + '顶部菜单已无「执行」字样');
if (h.indexOf('执行') >= 0) bad++;
console.log((h.indexOf('生成 ▶') >= 0 ? 'OK   ' : 'MISS ') + '「生成」按钮文案正确');
if (h.indexOf('生成 ▶') < 0) bad++;
const startRight = runIdx >= 0 && startIdx > runIdx;
console.log((startRight ? 'OK   ' : 'MISS ') + '「开始」按钮位于「生成」右侧');
if (!startRight) bad++;

// 开始弹窗默认占位文案
console.log((h.indexOf('未连接到网关') >= 0 ? 'OK   ' : 'MISS ') + '开始弹窗含「未连接到网关」占位');
if (h.indexOf('未连接到网关') < 0) bad++;

console.log(bad ? '\n' + bad + ' 处缺失' : '\n全部齐全');
if (bad) process.exitCode = 1;
