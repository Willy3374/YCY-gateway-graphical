/* order.test.js — 顺序自检（不依赖浏览器）
 * 覆盖两处容易搞反的顺序：
 *   1) 拖放落点：顶层画布 listEl 为 null 时也必须按各块中线算插入下标（否则恒插到第 0 位 → 顺序反）
 *   2) 引擎输出：body / else / next 的遍历顺序 == 画布从上到下的执行顺序
 * 用法: node tools/order.test.js
 */
require(require('path').join(__dirname, '..', 'js', 'blocks.js'));
require(require('path').join(__dirname, '..', 'js', 'engine.js'));
require(require('path').join(__dirname, '..', 'js', 'workspace.js'));
const GP = globalThis.GP;

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '\n      实际 ' + a + '\n      期望 ' + e));
}

/* ---------- 1. 落点下标 ---------- */
const insert = globalThis.GPWorkspace.insertIndexFromMids;
// 画布上已有 3 块，中线分别在 100 / 200 / 300
const mids = [100, 200, 300];
check('指针在最上方 → 插到第 0 位', insert(mids, 40), 0);
check('指针在第 1 块中线之上 → 第 0 位', insert(mids, 90), 0);
check('指针在第 1 块中线之下 → 第 1 位', insert(mids, 110), 1);
check('指针在最后一块中线之下 → 追加到末尾', insert(mids, 999), 3);
check('空画布 → 第 0 位', insert([], 123), 0);

// 模拟「依次拖入 A、B、C，每次松手都在最下方」→ 顺序应与拖入顺序一致
const canvas = [];
['A', 'B', 'C'].forEach((op) => {
  const liveMids = canvas.map((_, i) => 100 + i * 40); // 每块高约 40px
  const y = 999;                                       // 松手位置在最下方
  canvas.splice(insert(liveMids, y), 0, op);
});
check('从上到下依次拖入 A/B/C → 堆叠顺序 A,B,C（不是 C,B,A）', canvas, ['A', 'B', 'C']);

// 反向：每次都松手在最上方 → 后拖的排在上面，这是符合直觉的
const canvas2 = [];
['A', 'B', 'C'].forEach((op) => {
  const liveMids = canvas2.map((_, i) => 100 + i * 40);
  canvas2.splice(insert(liveMids, 0), 0, op);
});
check('每次都插到最上方 → 堆叠顺序 C,B,A', canvas2, ['C', 'B', 'A']);

/* ---------- 2. 引擎输出顺序 ---------- */
function b(op, uid, fields, children) {
  return { uid: uid, op: op, fields: fields || {}, children: children || { body: [], else: [] } };
}
// 画布（从上到下）：当开始 → 强度设为 50 → 等待 1 秒 → 全部关闭
const state = {
  root: [
    b('when_start', 'blk_1', { FLAG: true }),
    b('tens_channel_set', 'blk_2', { ID: '1', CH: 'A', N: '50' }),
    b('wait_seconds', 'blk_3', { N: '1', UNIT: '秒' }),
    b('tens_all_off', 'blk_4', { ID: '1' })
  ],
  variables: []
};
const spec = GP.toSpec(state).spec;

check('顶层链保留画布顺序', spec.program.length, 1);
check('当开始被点击是链头', spec.program[0].opcode, 'when_start');
check('链的第二块是第一句设备指令', spec.program[0].next.opcode, 'tens_channel_set');
check('链的第三块接在其后', spec.program[0].next.next.opcode, 'wait_seconds');
check('链的第四块接在其后', spec.program[0].next.next.next.opcode, 'tens_all_off');
check('末块没有 next', spec.program[0].next.next.next.next, undefined);

// 嵌套 body：C 形积木内部同样按画布从上到下
const nested = {
  root: [
    b('when_start', 'blk_1', { FLAG: true }),
    b('repeat_times', 'blk_2', { N: '2' }, {
      body: [
        b('tens_channel_set', 'blk_3', { ID: '1', CH: 'A', N: '50' }),
        b('wait_seconds', 'blk_4', { N: '1', UNIT: '秒' })
      ],
      else: []
    }),
    b('if_then_else', 'blk_5', { COND: b('cmp_gt', 'blk_6', { A: '1', B: '0' }) }, {
      body: [b('lock_set', 'blk_7', { ID: '1', STATE: '闭锁' })],
      else: [b('lock_set', 'blk_8', { ID: '1', STATE: '开锁' })]
    })
  ],
  variables: []
};
const nspec = GP.toSpec(nested).spec;
const chain = nspec.program[0];
check('body 数组顺序 = 画布顺序', chain.next.body.map((x) => x.opcode), ['tens_channel_set', 'wait_seconds']);
check('body 第一句强度 50', chain.next.body[0].inputs.N, 50);
check('else 分支保留', chain.next.next.else.map((x) => x.opcode), ['lock_set']);
check('if 的条件内联在 inputs 中', chain.next.next.inputs.COND.opcode, 'cmp_gt');

/* ---------- 3. 自由摆放：JSON 链序按 pos 排序（y 优先，其次 x） ---------- */
const fp = {
  root: [
    { uid: 'u1', op: 'when_start', fields: { FLAG: true }, children: { body: [], else: [] }, pos: { x: 300, y: 200 } },
    { uid: 'u2', op: 'wait_seconds', fields: { N: 1, UNIT: '秒' }, children: { body: [], else: [] }, pos: { x: 40, y: 40 } },
    { uid: 'u3', op: 'when_true', fields: { COND: { uid: 'u4', op: 'cmp_eq', fields: { A: 1, B: 1 }, children: { body: [], else: [] } } }, children: { body: [], else: [] }, pos: { x: 40, y: 320 } }
  ],
  variables: []
};
const fpSpec = GP.toSpec(fp).spec;
/* 排序后链序：等待(y=40) → 当开始(y=200,事件帽开新链) → 当条件(y=320,事件帽再开新链) */
check('自由摆放：链序按 y 再 x',
  fpSpec.program.map((n) => n.opcode), ['wait_seconds', 'when_start', 'when_true']);
check('自由摆放：事件帽各自开链（等待块成为首条链）', fpSpec.program[0].opcode, 'wait_seconds');
check('自由摆放：pos 不进入 JSON', 'pos' in JSON.parse(JSON.stringify(fpSpec.program[0])), false);

// 混合：有 pos 与无 pos 混排，无 pos 的按拖入顺序排在后面
const mixed = {
  root: [
    { uid: 'm1', op: 'when_start', fields: { FLAG: true }, children: { body: [], else: [] } },
    { uid: 'm2', op: 'tens_all_off', fields: { ID: 1 }, children: { body: [], else: [] }, pos: { x: 10, y: 10 } }
  ],
  variables: []
};
const mSpec = GP.toSpec(mixed).spec;
/* 有 pos 的块排前：非事件块开首条链（校验会报 orphan_top，与「事件之前不得有语句」一致） */
check('混合：有 pos 的块排前', mSpec.program.map((n) => n.opcode), ['tens_all_off', 'when_start']);

console.log(failed ? '\n' + failed + ' 项失败' : '\n全部通过');
if (failed) process.exitCode = 1;
