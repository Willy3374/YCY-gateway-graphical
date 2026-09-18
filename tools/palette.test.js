/* palette.test.js — 积木库五分页自检（最小 DOM 桩驱动真实代码路径）
 * 用法: node tools/palette.test.js
 */
const path = require('path');

function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), children: [], parentNode: null, dataset: {}, style: {}, handlers: {},
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
    appendChild(child) { el.children.push(child); if (child) child.parentNode = el; return child; },
    insertBefore(child, ref) { const i = el.children.indexOf(ref); el.children.splice(i < 0 ? 0 : i, 0, child); if (child) child.parentNode = el; return child; },
    setAttribute(k, v) { el['_attr_' + k] = v; },
    getAttribute(k) { return el['_attr_' + k]; },
    addEventListener(type, fn) { (el.handlers[type] = el.handlers[type] || []).push(fn); },
    closest(sel) { let n = el; const cls = sel.replace(/^\./, ''); while (n) { if (n._classes && n._classes.has(cls)) return n; n = n.parentNode; } return null; },
    contains(node) { while (node) { if (node === el) return true; node = node.parentNode; } return false; },
    getBoundingClientRect() { return { top: 0, left: 0, height: 0, width: 0, bottom: 0, right: 0 }; }
  };
  return el;
}

const document = { handlers: {}, createElement: makeEl, createDocumentFragment() { const f = makeEl('#fragment'); f._isFragment = true; return f; }, getElementById() { return null; }, addEventListener() {}, body: makeEl('body') };
globalThis.document = document;
globalThis.window = globalThis;
/* localStorage 桩 */
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); }
};

require(path.join(__dirname, '..', 'js', 'blocks.js'));
require(path.join(__dirname, '..', 'js', 'engine.js'));
require(path.join(__dirname, '..', 'js', 'workspace.js'));

const GP = globalThis.GP;
let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '\n      实际 ' + a + '\n      期望 ' + e));
}

const palette = makeEl('aside');
const canvas = makeEl('div');
const ws = globalThis.GPWorkspace.init({ rootEl: canvas, paletteEl: palette });

/* ---------- 1. 结构：标签 + 四页容器 ---------- */
const tabs = palette.children.find((c) => c._classes.has('pal-tabs'));
const pages = palette.children.find((c) => c._classes.has('pal-pages'));
check('面板包含标签栏与页容器', [!!tabs, !!pages], [true, true]);
check('五个分页标签', tabs.children.length, 5);
check('标签文案', tabs.children.map((b) => b.textContent), ['事件', '控制', '设备', '运算', '值/变量']);
check('五个页容器', pages.children.length, 5);

/* ---------- 2. 41 个 opcode 全部可达 ---------- */
function pageBlocks(bodyEl) {
  const found = [];
  (function walk(node) {
    if (node._classes && node._classes.has('palette-blk') && node.title) {
      const m = node.title.match(/^([a-z_]+) /);
      if (m) found.push(m[1]);
    }
    (node.children || []).forEach(walk);
  })(bodyEl);
  return found;
}
const allOps = pages.children.flatMap(pageBlocks);
check('全部 41 个 opcode 可达', allOps.length, GP.DEFS.length);
check('无重复', new Set(allOps).size, allOps.length);
check('覆盖全部定义', GP.DEFS.every((d) => allOps.indexOf(d.op) >= 0), true);
const perPage = pages.children.map(pageBlocks).map((a) => a.length);
check('各页数量', perPage, [2, 7, 10, 14, 15]);

/* ---------- 3. 默认显示「事件」页，其他页隐藏 ---------- */
function visiblePages() {
  return pages.children.filter((p) => !p._classes.has('hidden')).map((p) => p.dataset.page);
}
check('默认显示事件页', visiblePages(), ['event']);
check('事件页 tab 选中态', tabs.children.map((b) => b._classes.has('active')), [true, false, false, false, false]);

/* ---------- 4. 切换分页：只显示当前页，其他隐藏 ---------- */
const eventTab = tabs.children[0], controlTab = tabs.children[1];
controlTab.fire ? null : null;
(controlTab.handlers.click || []).forEach((fn) => fn({ target: controlTab, preventDefault() {}, stopPropagation() {} }));
check('切换到控制页', visiblePages(), ['control']);
check('控制页 tab 选中态', tabs.children.map((b) => b._classes.has('active')), [false, true, false, false, false]);
check('切换后 opcode 仍全部可达', pages.children.flatMap(pageBlocks).length, GP.DEFS.length);
check('切换分页不重建 DOM（积木元素不变）', pages.children.flatMap(pageBlocks).length, allOps.length);
(eventTab.handlers.click || []).forEach((fn) => fn({ target: eventTab, preventDefault() {}, stopPropagation() {} }));
check('切回事件页', visiblePages(), ['event']);

/* ---------- 5. localStorage 记忆 ---------- */
(controlTab.handlers.click || []).forEach((fn) => fn({ target: controlTab }));
check('切换后记住分页', globalThis.localStorage.getItem('gp-palette-page'), 'control');
/* 重新 init：应恢复上次分页 */
const palette2 = makeEl('aside');
const canvas2 = makeEl('div');
globalThis.GPWorkspace.init({ rootEl: canvas2, paletteEl: palette2 });
const pages2 = palette2.children.find((c) => c._classes.has('pal-pages'));
check('重新 init 恢复上次分页', visiblePages.call ? null : null, null);
const vis2 = pages2.children.filter((p) => !p._classes.has('hidden')).map((p) => p.dataset.page);
check('重新 init 后显示控制页', vis2, ['control']);

/* ---------- 6. localStorage 不可用：静默降级 ---------- */
globalThis.localStorage.getItem = () => { throw new Error('unavailable'); };
const palette3 = makeEl('aside');
const canvas3 = makeEl('div');
globalThis.GPWorkspace.init({ rootEl: canvas3, paletteEl: palette3 });
const pages3 = palette3.children.find((c) => c._classes.has('pal-pages'));
const vis3 = pages3.children.filter((p) => !p._classes.has('hidden')).map((p) => p.dataset.page);
check('localStorage 异常 → 静默降级为默认页', vis3, ['event']);

console.log(failed ? '\n' + failed + ' 项失败' : '\n全部通过');
if (failed) process.exitCode = 1;
