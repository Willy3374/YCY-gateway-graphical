/* device.test.js — 右侧连接状态栏自检（DOM 桩，无浏览器）
 * 验证：默认占位为「未连接到设备」；状态切换、设备列表、探活回调行为正确。
 * 用法: node tools/device.test.js
 */
const path = require('path');

/* ---------- 最小 DOM 桩 ---------- */
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    parentNode: null,
    dataset: {},
    style: {},
    handlers: {},
    _classes: new Set(),
    _text: '',
    _html: '',
    classList: {
      add: (...c) => c.forEach((x) => el._classes.add(x)),
      remove: (...c) => c.forEach((x) => el._classes.delete(x)),
      contains: (c) => el._classes.has(c),
      toggle: (c, on) => (on ? el._classes.add(c) : el._classes.delete(c))
    },
    get className() { return Array.from(el._classes).join(' '); },
    set className(v) { el._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get textContent() { return el._text; },
    set textContent(v) { el._text = String(v); },
    get innerHTML() { return el._html; },
    set innerHTML(v) { el._html = String(v); },
    appendChild(c) { el.children.push(c); if (c) c.parentNode = el; return c; },
    addEventListener(t, fn) { (el.handlers[t] = el.handlers[t] || []).push(fn); },
    setAttribute(k, v) { el['_attr_' + k] = v; },
    getAttribute(k) { return el['_attr_' + k]; },
    closest() { return null; },
    querySelectorAll() { return []; },
    click() { (el.handlers.click || []).slice().forEach((fn) => fn({ target: el })); }
  };
  return el;
}

const ids = {};
const document = {
  handlers: {},
  title: '役次元 · 积木编辑器',
  createElement: makeEl,
  getElementById(id) { return ids[id] || null; },
  addEventListener(t, fn) { (document.handlers[t] = document.handlers[t] || []).push(fn); },
  body: makeEl('body')
};
globalThis.document = document;
globalThis.window = globalThis;

['device-badge', 'device-status', 'device-status-title', 'device-status-sub', 'device-list', 'btn-device-refresh']
  .forEach((id) => { ids[id] = makeEl('div'); });

require(path.join(__dirname, '..', 'js', 'device.js'));
const GPDevice = globalThis.GPDevice;

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '\n      实际 ' + a + '\n      期望 ' + e));
}

/* ---------- 1. 默认占位 ---------- */
GPDevice.init({});
check('默认状态为 disconnected', GPDevice.getState(), 'disconnected');
check('默认主文案 = 未连接到设备', ids['device-status-title'].textContent, '未连接到设备');
check('默认副文案 = 等待网关连接', ids['device-status-sub'].textContent, '等待网关连接');
check('徽标文案 = 离线', ids['device-badge'].textContent, '离线');
check('徽标 data-state = disconnected', ids['device-badge'].dataset.state, 'disconnected');
check('状态块 data-state = disconnected', ids['device-status'].dataset.state, 'disconnected');
check('设备列表占位 = 暂无设备', ids['device-list'].innerHTML, '<li class="device-empty">暂无设备</li>');
check('标签页标题加离线前缀', document.title, '● 役次元 · 积木编辑器');

/* ---------- 2. 状态切换 ---------- */
GPDevice.setState('connecting');
check('连接中：主文案', ids['device-status-title'].textContent, '正在连接…');
check('连接中：徽标', ids['device-badge'].textContent, '连接中');
check('连接中：data-state', ids['device-status'].dataset.state, 'connecting');

GPDevice.setState('connected', '设备网关 v1.0');
check('已连接：使用自定义主文案', ids['device-status-title'].textContent, '设备网关 v1.0');
check('已连接：徽标', ids['device-badge'].textContent, '在线');
check('已连接：副文案隐藏', ids['device-status-sub'].style.display, 'none');
check('已连接：标签页不再带离线前缀', document.title, '役次元 · 积木编辑器');

GPDevice.setState('error');
check('异常：主文案', ids['device-status-title'].textContent, '连接异常');
check('异常：data-state', ids['device-status'].dataset.state, 'error');

GPDevice.setState('不存在的状态');
check('非法状态回退为 disconnected', GPDevice.getState(), 'disconnected');

/* ---------- 3. 设备列表 ---------- */
GPDevice.setDevices([{ name: '电击器 1', meta: '通道 A/B', online: true }, { name: '智能锁 1', online: false }]);
check('设备名已渲染', ids['device-list'].innerHTML.indexOf('电击器 1') >= 0, true);
check('在线设备标记 data-online=1', ids['device-list'].innerHTML.indexOf('data-online="1"') >= 0, true);
check('离线设备标记 data-online=0', ids['device-list'].innerHTML.indexOf('data-online="0"') >= 0, true);

GPDevice.setDevices([{ name: '<script>alert(1)</script>' }]);
check('设备名转义，不注入标签', ids['device-list'].innerHTML.indexOf('<script>') < 0, true);

GPDevice.setDevices([]);
check('空列表回到占位', ids['device-list'].innerHTML, '<li class="device-empty">暂无设备</li>');

/* ---------- 4. 探活回调（探活是异步的：probe 在微任务中执行） ---------- */
function tick() { return new Promise((r) => setTimeout(r, 20)); }

(async function () {
  let probeCalls = 0;
  GPDevice.init({
    probe: function () {
      probeCalls++;
      return { connected: true, title: '网关在线', devices: [{ name: '灌肠机 1', online: true }] };
    },
    pollMs: 0
  });
  await tick();
  check('无轮询时不自动探活（pollMs=0）', probeCalls, 0);

  /* 手动刷新按钮触发探活 */
  ids['btn-device-refresh'].click();
  await tick();
  check('点击刷新触发一次探活', probeCalls, 1);
  check('探活成功后状态为 connected', GPDevice.getState(), 'connected');
  check('探活带回的设备已渲染', ids['device-list'].innerHTML.indexOf('灌肠机 1') >= 0, true);

  /* 探活返回未连接 → disconnected */
  GPDevice.init({ probe: function () { return { connected: false }; } });
  ids['btn-device-refresh'].click();
  await tick();
  check('探活返回未连接 → disconnected', GPDevice.getState(), 'disconnected');
  check('探活失败时清空设备列表', ids['device-list'].innerHTML, '<li class="device-empty">暂无设备</li>');

  /* 探活抛错 → error */
  GPDevice.init({ probe: function () { return Promise.reject(new Error('boom')); } });
  ids['btn-device-refresh'].click();
  await tick();
  check('探活失败 → error', GPDevice.getState(), 'error');

  /* 定时轮询：pollMs>0 时自动探活 */
  let pollCalls = 0;
  GPDevice.init({
    probe: function () { pollCalls++; return { connected: true }; },
    pollMs: 15
  });
  await tick();
  check('pollMs>0 时初始化即探活一次', pollCalls >= 1, true);

  /* 关掉轮询，否则定时器会让进程不退出 */
  GPDevice.init({ pollMs: 0 });
  await tick();
  const frozen = pollCalls;
  await tick();
  check('关闭轮询后不再自动探活', pollCalls, frozen);

  console.log(failed ? '\n' + failed + ' 项失败' : '\n全部通过');
  if (failed) process.exitCode = 1;
})();
