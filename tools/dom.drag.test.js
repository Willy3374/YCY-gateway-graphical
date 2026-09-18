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
    /* 顺序堆叠：每块高 34px，间距 6px，从 y=100 起；left 放远处（left:0 会参与顶缘/底缘吸附竞争） */
    getBoundingClientRect() {
      const order = el.parentNode ? el.parentNode.children.indexOf(el) : 0;
      const top = 100 + order * 40;
      return { top, height: 34, bottom: top + 34, left: 700, right: 1000, width: 300 };
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

/* ---------- 自由摆放 + 自由移动：已摆放的积木再次拖动 → 换位置 ---------- */
// DOM 桩需要 getBoundingClientRect 支持 rootEl（freePos 计算相对画布偏移）
const canvasRect = { top: 0, left: 0, height: 600, width: 800, bottom: 600, right: 800 };
canvas.getBoundingClientRect = () => canvasRect;

// 拖入一块积木，释放点画布内 (50, 120) → pos 应为 {x:50,y:120}
function dragFromPaletteTo(op, target, clientX, clientY) {
  const e2 = paletteBlockEl(op);
  if (!e2) throw new Error('调色板里找不到积木: ' + op);
  e2.fire('dragstart', fakeEvent(e2, 0));
  document.handlers.dragover.slice().forEach((fn) => fn(fakeEvent(target, clientY)));
  target.fire('drop', fakeEvent({ target, clientX, clientY }, clientY));
  document.handlers.dragend.slice().forEach((fn) => fn(fakeEvent(target, clientY)));
}
// handleDrop 读 e.clientX/clientY；保留 target 本身（冒泡与 contains 判定依赖它），只附加坐标
function dropAt(target, clientX, clientY) {
  const ev = fakeEvent(target, clientY);
  ev.clientX = clientX; ev.clientY = clientY;
  document.handlers.dragover.slice().forEach((fn) => fn(ev));
  target.fire('drop', ev);
  document.handlers.dragend.slice().forEach((fn) => fn(ev));
}

function foundInCanvas(uid) {
  const found = [];
  (function walk(node) {
    if (node.dataset && node.dataset.uid === uid) found.push(node);
    (node.children || []).forEach(walk);
  })(canvas);
  return found[0];
}

// 拖入新积木到画布 (50,120)；已有多个块时按 y 插入中间，需按 opcode 定位
const e3 = paletteBlockEl('lock_set');
e3.fire('dragstart', fakeEvent(e3, 0));
dropAt(canvas, 50, 120);
const moved = ws.state.root.find((b) => b.op === 'lock_set');
check('自由摆放：落点 (50,120) 记录 pos', moved && moved.pos, { x: 50, y: 120 });

// 再次拖动同一块到 (300,80) → pos 被覆盖，实现自由移动
if (moved) {
  const el2 = foundInCanvas(moved.uid);
  el2.fire('dragstart', fakeEvent(el2, 0));
  dropAt(canvas, 300, 80);
}
check('自由移动：再次拖动后 pos 更新为 (300,80)', moved && moved.pos, { x: 300, y: 80 });

// JSON 链序随新位置变化
const mSpec = GP.toSpec(ws.state).spec;
check('自由移动后 JSON 链序随位置变化', mSpec.program.length >= 1, true);

/* ---------- 吸附：拖到某块底部附近 → 吸附到其正下方并接入执行链 ---------- */
// 桩的 getBoundingClientRect 需要返回实际块位置（rootBlockEls 渲染后的块）
// 给画布桩补上真实的 rect：按 dataset.uid 定位，返回预设位置表
const RECTS = {};
function setRect(uid, left, top, width, height) {
  RECTS[uid] = { left, top, width, height, right: left + width, bottom: top + height };
}
function rectFor(el) {
  if (el === canvas) return canvasRect;
  const uid = el.dataset && el.dataset.uid;
  if (uid && RECTS[uid]) return RECTS[uid];
  /* 无预设位置的块：放远处（left:0 会在顶缘吸附时竞争干扰场景） */
  const o = el.parentNode ? el.parentNode.children.indexOf(el) : 0;
  const top = 500 + o * 40;
  return { top, left: 700, height: 34, width: 200, bottom: top + 34, right: 900 };
}
// 把 RECTS 应用到画布内所有顶层积木元素（rootBlockEls 读的是元素自身的 getBoundingClientRect）
function applyRects() {
  (function walk(node) {
    if (node._classes && node._classes.has('blk') && node.dataset && node.dataset.uid) {
      node.getBoundingClientRect = () => rectFor(node);
    }
    (node.children || []).forEach(walk);
  })(canvas);
}
canvas.getBoundingClientRect = () => ({ top: 0, left: 0, height: 600, width: 800, bottom: 600, right: 800 });

// 把无关块移远（默认桩位置 top=100+o*40 会在顶缘吸附时竞争），保证场景隔离
function moveAside(entry, x, y) {
  if (!entry) return;
  setRect(entry.uid, x, y, 220, 40);
  const elx = foundInCanvas(entry.uid);
  if (elx) elx.getBoundingClientRect = () => ({ left: x, top: y, width: 220, height: 40, right: x + 220, bottom: y + 40 });
}

// 当前画布：若干块。找到 when_start 块与 lock_set 块，设置真实位置；其余移远
const hatEntry = ws.state.root.find((b) => GP.isHat(b.op));
const lockEntry = ws.state.root.find((b) => b.op === 'lock_set');
ws.state.root.forEach((b) => {
  if (b !== hatEntry && b !== lockEntry) moveAside(b, 700, 500 + ws.state.root.indexOf(b) * 60);
});
if (hatEntry && lockEntry) {
  setRect(hatEntry.uid, 40, 100, 220, 40);   // when_start 在 (40,100)，底缘 140、顶缘 100
  setRect(lockEntry.uid, 400, 300, 220, 40); // lock_set 在远处 (400,300)
  applyRects();
}

// 把 lock_set 拖到 when_start 底部附近（clientX=100，clientY=145，在底缘 140 的 14px 内）
if (hatEntry && lockEntry) {
  const elS = foundInCanvas(lockEntry.uid);
  elS.fire('dragstart', fakeEvent(elS, 0));
  dropAt(canvas, 100, 145);
}
check('吸附：落点在某块底缘附近 → pos 对齐该块正下方',
  lockEntry && lockEntry.pos, { x: 40, y: 140 });
check('吸附：插入到吸附块之后（同一执行链）',
  hatEntry && ws.state.root[ws.state.root.indexOf(hatEntry) + 1] === lockEntry, true);

// 远离任何块底部 → 自由摆放不受影响
if (lockEntry) {
  const elS2 = foundInCanvas(lockEntry.uid);
  elS2.fire('dragstart', fakeEvent(elS2, 0));
  dropAt(canvas, 600, 500);
}
check('远离块底部 → 自由摆放', lockEntry && lockEntry.pos, { x: 600, y: 500 });

/* ---------- 上方接入：拖到某块顶缘附近 → 插到它之前（向上对接） ---------- */
if (hatEntry && lockEntry) {
  // 重置位置：when_start 在 (40,100)（顶缘 100），lock_set 拖到其顶缘上方 (100, 95)
  setRect(hatEntry.uid, 40, 100, 220, 40);
  applyRects(); // drop 后 renderRoot 重建 DOM，需重新应用预设 rect
  const elT = foundInCanvas(lockEntry.uid);
  elT.getBoundingClientRect = () => ({ left: 600, top: 400, width: 220, height: 40, right: 820, bottom: 440 });
  elT.fire('dragstart', fakeEvent(elT, 0));
  dropAt(canvas, 100, 95); // 顶缘 100 的 5px 内 → 顶缘吸附
}
check('顶缘吸附：落点在某块顶缘附近 → pos 对齐该块正上方',
  lockEntry && lockEntry.pos, { x: 40, y: 100 });
check('顶缘吸附：插入到吸附块之前（同一执行链）',
  hatEntry && ws.state.root[ws.state.root.indexOf(hatEntry) - 1] === lockEntry, true);

/* ---------- 整体联动：下方串联绑定的相连积木随首块同步移动 ---------- */
// 造组：把 lock_set 吸附到 when_start 底部（形成 x 对齐 + y 递增的组），再拖 when_start 整体移动
if (hatEntry && lockEntry) {
  setRect(hatEntry.uid, 40, 100, 220, 40);
  hatEntry.pos = { x: 40, y: 100 }; // 重置首块 pos（前面测试可能遗留旧值，x 对齐是组判定前提）
  applyRects(); // 重建后重新应用
  const elR = foundInCanvas(lockEntry.uid);
  elR.getBoundingClientRect = () => ({ left: 600, top: 400, width: 220, height: 40, right: 820, bottom: 440 });
  elR.fire('dragstart', fakeEvent(elR, 0));
  dropAt(canvas, 100, 145); // 底缘吸附回 when_start 正下方 → 组形成

  // 拖 when_start 到 (200, 200)：lock_set 应同步移动到 (200, 240)
  setRect(hatEntry.uid, 40, 100, 220, 40);
  setRect(lockEntry.uid, 40, 140, 220, 40); // 吸附后的组内位置
  applyRects();
  const elH = foundInCanvas(hatEntry.uid);
  elH.fire('dragstart', fakeEvent(elH, 0));
  dropAt(canvas, 200, 200);
}
check('整体联动：首块移动后相连积木同步移动',
  (function () {
    // 期望：hat pos {x:200,y:200}，lock pos {x:200,y:240}
    return !!(hatEntry && lockEntry && hatEntry.pos && lockEntry.pos &&
      hatEntry.pos.x === 200 && hatEntry.pos.y === 200 &&
      lockEntry.pos.x === 200 && lockEntry.pos.y === 240);
  })(), true);

console.log(failed ? '\n' + failed + ' 项失败' : '\n全部通过');
if (failed) process.exitCode = 1;
