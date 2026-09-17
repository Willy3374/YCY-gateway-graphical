/* delete.test.js — 拖入左侧选择栏删除 + 事件积木数量上限 自检（最小 DOM 桩驱动真实代码路径）
 * 用法: node tools/delete.test.js
 */
const path = require('path');

/* ---------- 最小 DOM 桩（与 dom.drag.test.js 同一套） ---------- */
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [], parentNode: null, dataset: {}, style: {}, handlers: {},
    _classes: new Set(), _text: '',
    classList: {
      add: (...c) => c.forEach((x) => el._classes.add(x)),
      remove: (...c) => c.forEach((x) => el._classes.delete(x)),
      contains: (c) => el._classes.has(c),
      toggle: (c, on) => (on ? el._classes.add(c) : el._classes.delete(c))
    },
    get className() { return Array.from(el._classes).join(' '); },
    set className(v) { el._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get textContent() { return el._text; },
    set textContent(v) { el._text = String(v); el.children = []; },
    get innerHTML() { return el._html || ''; },
    set innerHTML(v) { el._html = v; if (v === '') el.children = []; },
    appendChild(child) {
      if (child && child._isFragment) { child.children.forEach((c) => el.appendChild(c)); child.children = []; return child; }
      el.children.push(child); if (child) child.parentNode = el; return child;
    },
    insertBefore(child, ref) { const i = el.children.indexOf(ref); el.children.splice(i < 0 ? 0 : i, 0, child); if (child) child.parentNode = el; return child; },
    setAttribute(k, v) { el['_attr_' + k] = v; },
    getAttribute(k) { return el['_attr_' + k]; },
    addEventListener(type, fn) { (el.handlers[type] = el.handlers[type] || []).push(fn); },
    closest(sel) {
      let node = el; const cls = sel.replace(/^\./, '');
      while (node) { if (node._classes && node._classes.has(cls)) return node; node = node.parentNode; }
      return null;
    },
    contains(node) { while (node) { if (node === el) return true; node = node.parentNode; } return false; },
    querySelectorAll() { return []; },
    getBoundingClientRect() {
      const order = el.parentNode ? el.parentNode.children.indexOf(el) : 0;
      const top = 100 + order * 40;
      return { top, height: 34, bottom: top + 34, left: 0, right: 300, width: 300 };
    },
    fire(type, ev) {
      const list = (el.handlers[type] || []).slice(); list.forEach((fn) => fn(ev));
      let p = el.parentNode;
      while (p) { ((p.handlers[type] || []).slice()).forEach((fn) => fn(ev)); p = p.parentNode; }
      ((document.handlers[type] || []).slice()).forEach((fn) => fn(ev));
    }
  };
  return el;
}

const document = {
  handlers: {},
  createElement: makeEl,
  createDocumentFragment() { const f = makeEl('#fragment'); f._isFragment = true; return f; },
  getElementById() { return null; },
  addEventListener(type, fn) { (document.handlers[type] = document.handlers[type] || []).push(fn); },
  body: makeEl('body')
};
globalThis.document = document;
globalThis.window = globalThis;

function fakeEvent(target, y) {
  return {
    target, clientY: y, preventDefault() {}, stopPropagation() {},
    dataTransfer: { setData() {}, effectAllowed: '', dropEffect: '' }
  };
}

require(path.join(__dirname, '..', 'js', 'blocks.js'));
require(path.join(__dirname, '..', 'js', 'engine.js'));
require(path.join(__dirname, '..', 'js', 'workspace.js'));

const GP = globalThis.GP;
const palette = makeEl('aside');
palette._classes.add('palette'); // closest('.palette') 需要命中
const canvas = makeEl('div');

const ws = globalThis.GPWorkspace.init({ rootEl: canvas, paletteEl: palette });

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '\n      实际 ' + a + '\n      期望 ' + e));
}
function rootOps() { return ws.state.root.map((b) => b.op); }
function paletteBlockEl(op) {
  const found = [];
  (function walk(node) {
    if (node._classes && node._classes.has('palette-blk')) found.push(node);
    (node.children || []).forEach(walk);
  })(palette);
  return found.find((el) => (el.title || '').indexOf(op + ' ') === 0);
}
function dragFromPalette(op, target, y, preDrag) {
  const el = paletteBlockEl(op);
  if (!el) throw new Error('调色板里找不到积木: ' + op);
  el.fire('dragstart', fakeEvent(el, 0));
  if (preDrag) preDrag();
  document.handlers.dragover.slice().forEach((fn) => fn(fakeEvent(target, y)));
  target.fire('drop', fakeEvent(target, y));
  document.handlers.dragend.slice().forEach((fn) => fn(fakeEvent(target, y)));
}
function dragCanvasToPalette(uid, target, y) {
  const el = foundInCanvas(uid);
  if (!el) throw new Error('画布里找不到积木: ' + uid);
  el.fire('dragstart', fakeEvent(el, 0));
  document.handlers.dragover.slice().forEach((fn) => fn(fakeEvent(target, y)));
  target.fire('drop', fakeEvent(target, y));
  document.handlers.dragend.slice().forEach((fn) => fn(fakeEvent(target, y)));
}
function foundInCanvas(uid) {
  const found = [];
  (function walk(node) {
    if (node.dataset && node.dataset.uid === uid) found.push(node);
    (node.children || []).forEach(walk);
  })(canvas);
  return found[0];
}

/* ---------- 1. 基础搭建 ---------- */
dragFromPalette('when_start', canvas, 9999);
dragFromPalette('wait_seconds', canvas, 9999);
dragFromPalette('if_then', canvas, 9999);
check('初始：当开始 + 等待 + if', rootOps(), ['when_start', 'wait_seconds', 'if_then']);
const ifUid = ws.state.root[2].uid;

/* ---------- 2. 拖入左侧选择栏删除（含下级堆叠） ---------- */
// 给 if_then 的 body 放一块，验证删除时下级一并移除
dragFromPalette('lock_set', palette, 0);
check('拖到工具箱：新积木不落画布', rootOps(), ['when_start', 'wait_seconds', 'if_then']);

// 把 lock_set 从 body 拖回工具箱 → 删除
// 先拖入 body：拖 if_then 的 list（dataset.owner = ifUid）
const ifList = foundInCanvas(ifUid).children.find((c) => c._classes && c._classes.has('list'));
dragFromPalette('lock_set', ifList, 200);
check('lock_set 已进入 if 的 body', ws.state.root[2].children.body.map((b) => b.op), ['lock_set']);

dragCanvasToPalette(ws.state.root[2].children.body[0].uid, palette, 0);
check('从 body 拖到工具箱 → 已删除', ws.state.root[2].children.body, []);

// 删除整个 if_then（C 形，含 body 下级）
dragFromPalette('wait_until', ifList, 200);
check('wait_until 进入 body', ws.state.root[2].children.body.map((b) => b.op), ['wait_until']);
dragCanvasToPalette(ifUid, palette, 0);
check('删除 C 形积木 → 连同下级堆叠一并移除', rootOps(), ['when_start', 'wait_seconds']);
check('删除后校验仍通过', GP.validate(ws.state).ok, true);

/* ---------- 3. 事件积木数量上限 ---------- */
dragFromPalette('when_true', canvas, 9999);
check('第 2 个事件（when_true）允许添加', rootOps(), ['when_start', 'wait_seconds', 'when_true']);
check('countHats = 2', globalThis.GPWorkspace.countHats(), 2);
check('达到上限', globalThis.GPWorkspace.hatLimitReached(), true);

// 第 3 个事件：dragstart 被阻止，画布不变
const before = rootOps();
dragFromPalette('when_start', canvas, 9999);
check('第 3 个事件被阻止，画布不变', rootOps(), before);
check('countHats 仍为 2', globalThis.GPWorkspace.countHats(), 2);

// 删除一个事件后可以再加
dragCanvasToPalette(ws.state.root[2].uid, palette, 0);
check('删除 when_true 后 countHats = 1', globalThis.GPWorkspace.countHats(), 1);
dragFromPalette('when_start', canvas, 9999);
check('删除后可再添加 1 个事件', rootOps(), ['when_start', 'wait_seconds', 'when_start']);
check('countHats = 2', globalThis.GPWorkspace.countHats(), 2);

// 全部删除 → 0 个，校验必须失败
dragCanvasToPalette(ws.state.root[2].uid, palette, 0);
check('删除后 countHats = 1', globalThis.GPWorkspace.countHats(), 1);
dragCanvasToPalette(ws.state.root[0].uid, palette, 0);
check('全部删除后 countHats = 0', globalThis.GPWorkspace.countHats(), 0);
const vres = GP.validate(ws.state);
check('0 个事件：校验失败', vres.ok, false);
check('0 个事件：报 no_event', vres.errors.map((e) => e.code).indexOf('no_event') >= 0, true);

/* ---------- 4. 从工具箱拖出创建不受删除逻辑影响 ---------- */
dragFromPalette('when_start', canvas, 9999);
check('拖出创建新积木正常（松手在最下方 → 追加到末尾）', rootOps(), ['wait_seconds', 'when_start']);

/* ---------- 5. 超限的 dragstart 不污染拖拽状态 ---------- */
dragFromPalette('when_true', canvas, 9999);
check('第 2 个事件添加', globalThis.GPWorkspace.countHats(), 2);
// 阻止后再拖普通积木，应正常
dragFromPalette('tens_all_off', canvas, 9999);
check('超限阻止后仍可正常拖入普通积木', rootOps()[rootOps().length - 1], 'tens_all_off');

console.log(failed ? '\n' + failed + ' 项失败' : '\n全部通过');
if (failed) process.exitCode = 1;
