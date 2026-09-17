/* dom.drag.test.js — 用最小 DOM 桩驱动真实的 workspace.js 拖放代码路径
 * 目的：验证「从积木库依次拖 A、B、C 到画布最下方」后，state.root 的执行顺序是 A,B,C。
 * 用法: node tools/dom.drag.test.js
 */
const path = require('path');

/* ---------- 最小 DOM 桩 ---------- */
let posCounter = 0;

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
      if (child && child._isFragment) {
        child.children.forEach((c) => el.appendChild(c));
        child.children = [];
        return child;
      }
      el.children.push(child);
      if (child) child.parentNode = el;
      return child;
    },
    insertBefore(child, ref) {
      const i = el.children.indexOf(ref);
      el.children.splice(i < 0 ? 0 : i, 0, child);
      if (child) child.parentNode = el;
      return child;
    },
    removeChild(child) {
      const i = el.children.indexOf(child);
      if (i >= 0) el.children.splice(i, 1);
      return child;
    },
    setAttribute(k, v) { el['_attr_' + k] = v; },
    getAttribute(k) { return el['_attr_' + k]; },
    addEventListener(type, fn) { (el.handlers[type] = el.handlers[type] || []).push(fn); },
    closest(sel) {
      let node = el;
      const cls = sel.replace(/^\./, '');
      while (node) {
        if (node._classes && node._classes.has(cls)) return node;
        node = node.parentNode;
      }
      return null;
    },
    contains(node) {
      while (node) { if (node === el) return true; node = node.parentNode; }
      return false;
    },
    querySelectorAll() { return []; },
    /* 顺序堆叠：每块高 34px，间距 6px，从 y=100 起 */
    getBoundingClientRect() {
      const order = el.parentNode ? el.parentNode.children.indexOf(el) : 0;
      const top = 100 + order * 40;
      return { top, height: 34, bottom: top + 34, left: 0, right: 300, width: 300 };
    },
    fire(type, ev) {
      const list = (el.handlers[type] || []).slice();
      list.forEach((fn) => fn(ev));
      // 冒泡到父链与 document
      let p = el.parentNode;
      while (p) {
        ((p.handlers[type] || []).slice()).forEach((fn) => fn(ev));
        p = p.parentNode;
      }
      ((document.handlers[type] || []).slice()).forEach((fn) => fn(ev));
    }
  };
  posCounter++;
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
    target,
    clientY: y,
    preventDefault() {},
    stopPropagation() {},
    dataTransfer: { setData() {}, effectAllowed: '', dropEffect: '' }
  };
}

/* ---------- 加载真实代码 ---------- */
require(path.join(__dirname, '..', 'js', 'blocks.js'));
require(path.join(__dirname, '..', 'js', 'engine.js'));
require(path.join(__dirname, '..', 'js', 'workspace.js'));

const GP = globalThis.GP;
const palette = makeEl('aside');
const canvas = makeEl('div');

const ws = globalThis.GPWorkspace.init({ rootEl: canvas, paletteEl: palette });

/* ---------- 模拟拖拽 ---------- */
function paletteBlockEl(op) {
  const found = [];
  (function walk(node) {
    if (node._classes && node._classes.has('palette-blk')) found.push(node);
    (node.children || []).forEach(walk);
  })(palette);
  const hit = found.filter((el) => {
    let n = el;
    return true;
  });
  // 通过标题里的 opcode 定位
  return found.find((el) => (el.title || '').indexOf(op + ' ') === 0);
}

function dragToBottom(op) {
  const el = paletteBlockEl(op);
  if (!el) throw new Error('调色板里找不到积木: ' + op);
  el.fire('dragstart', fakeEvent(el, 0));
  document.handlers.dragover.slice().forEach((fn) => fn(fakeEvent(canvas, 9999)));
  canvas.fire('drop', fakeEvent(canvas, 9999));
  document.handlers.dragend.slice().forEach((fn) => fn(fakeEvent(canvas, 9999)));
}

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '\n      实际 ' + a + '\n      期望 ' + e));
}

function rootOps() { return ws.state.root.map((b) => b.op); }

/* 依次拖入：当开始被点击 → 强度 50 → 等待 → 全部关闭（每次松手都在画布最下方） */
dragToBottom('when_start');
dragToBottom('tens_channel_set');
dragToBottom('wait_seconds');
dragToBottom('tens_all_off');

check('画布从上到下的顺序 = 拖入顺序', rootOps(),
  ['when_start', 'tens_channel_set', 'wait_seconds', 'tens_all_off']);

check('第一块是事件积木', rootOps()[0], 'when_start');

/* 生成的 JSON 必须与视觉顺序一致 */
const spec = GP.toSpec(ws.state).spec;
const chain = [];
let cur = spec.program[0];
while (cur) { chain.push(cur.opcode); cur = cur.next; }
check('JSON 链顺序与画布一致', chain,
  ['when_start', 'tens_channel_set', 'wait_seconds', 'tens_all_off']);

/* 拖到画布顶部应插到最前 */
dragToBottom('enema_pause');
const el = paletteBlockEl('enema_run');
el.fire('dragstart', fakeEvent(el, 0));
document.handlers.dragover.slice().forEach((fn) => fn(fakeEvent(canvas, 0)));
canvas.fire('drop', fakeEvent(canvas, 0));
document.handlers.dragend.slice().forEach((fn) => fn(fakeEvent(canvas, 0)));
check('拖到画布最上方 → 顶到第 0 位（事件积木前）', rootOps(),
  ['enema_run', 'when_start', 'tens_channel_set', 'wait_seconds', 'tens_all_off', 'enema_pause']);

console.log(failed ? '\n' + failed + ' 项失败' : '\n全部通过');
if (failed) process.exitCode = 1;
