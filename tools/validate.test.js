/* validate.test.js — 校验规则 / 事件数量上限 / 拖入左侧删除 自检（不依赖浏览器）
 * 用法: node tools/validate.test.js
 */
const path = require('path');
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
function codes(res) { return res.errors.map((e) => e.code); }
function b(op, uid, fields, children) {
  return { uid: uid, op: op, fields: fields || {}, children: children || { body: [], else: [] } };
}

/* ---------- 一 / 三. 校验规则 ---------- */
check('空画布：缺事件', codes(GP.validate({ root: [], variables: [] })), ['no_event']);

const st1 = { root: [b('when_start', 'blk_1', { FLAG: true })], variables: [] };
check('仅 1 个 when_start：通过', GP.validate(st1).ok, true);

check('2 个 when_start：通过', GP.validate({ root: [b('when_start', 'blk_1', { FLAG: true }), b('when_start', 'blk_2', { FLAG: true })], variables: [] }).ok, true);
check('2 个 when_true（条件齐全）：通过', GP.validate({ root: [b('when_true', 'blk_1', { COND: b('cmp_eq', 'blk_3', { A: 1, B: 1 }) }), b('when_true', 'blk_2', { COND: b('cmp_gt', 'blk_4', { A: 1, B: 0 }) })], variables: [] }).ok, true);
check('各一个（start+true）：通过', GP.validate({ root: [b('when_start', 'blk_1', { FLAG: true }), b('when_true', 'blk_2', { COND: b('cmp_gt', 'blk_3', { A: 1, B: 0 }) })], variables: [] }).ok, true);
check('3 个事件：too_many_events', codes(GP.validate({ root: [b('when_start', 'blk_1', { FLAG: true }), b('when_start', 'blk_2', { FLAG: true }), b('when_true', 'blk_3', { COND: b('cmp_eq', 'blk_4', { A: 1, B: 1 }) })], variables: [] })), ['too_many_events']);

check('when_true 条件为空：cond_missing', codes(GP.validate({ root: [b('when_true', 'blk_1', { COND: null })], variables: [] })), ['cond_missing']);
check('事件之前的顶层语句：orphan_top', codes(GP.validate({ root: [b('tens_all_off', 'blk_9', { ID: 1 }), b('when_start', 'blk_1', { FLAG: true })], variables: [] })), ['orphan_top']);
check('顶层 reporter：reporter_statement', codes(GP.validate({ root: [b('when_start', 'blk_1', { FLAG: true }), b('op_add', 'blk_2', { A: 1, B: 2 })], variables: [] })), ['reporter_statement']);
check('body 内嵌事件：hat_nested', codes(GP.validate({ root: [b('when_start', 'blk_1', { FLAG: true }, { body: [b('when_start', 'blk_2', { FLAG: true })], else: [] })], variables: [] })), ['hat_nested']);
check('未知 opcode：unknown_op', codes(GP.validate({ root: [b('when_start', 'blk_1', { FLAG: true }), b('made_up_op', 'blk_2', {})] })), ['unknown_op']);
check('条件槽嵌数值积木：slot_type', codes(GP.validate({ root: [b('when_true', 'blk_1', { COND: b('op_add', 'blk_2', { A: 1, B: 2 }) })], variables: [] })), ['slot_type']);
check('数值槽嵌判断积木：slot_type', codes(GP.validate({ root: [b('when_start', 'blk_1', { FLAG: true }), b('vibe_a_intensity', 'blk_2', { ID: 1, N: b('cmp_eq', 'blk_3', { A: 1, B: 1 }) })], variables: [] })), ['slot_type']);

/* 三.4 数学合理性（数学积木内嵌在输入槽，不能单独作为语句） */
function mathState(op, fields) {
  const root = [b('when_start', 'blk_0', { FLAG: true }), b('vibe_a_intensity', 'blk_9x', { ID: 1, N: b(op, 'blk_2', fields) })];
  return { root: root, variables: [] };
}
function checkMath(name, op, fields, expected) {
  check(name, codes(GP.validate(mathState(op, fields))), expected);
}
checkMath('除数为 0：math_div_zero', 'op_div', { A: 1, B: 0 }, ['math_div_zero']);
checkMath('除数非 0：通过', 'op_div', { A: 1, B: 2 }, []);
checkMath('除数为嵌套积木：不判除数（运行期才知道），通过', 'op_div', { A: 1, B: b('op_random', 'blk_3', { A: 0, B: 10 }) }, []);
checkMath('ln(0)：math_log_domain', 'op_math', { A: 0, FN: 'ln' }, ['math_log_domain']);
checkMath('log(-1)：math_log_domain', 'op_math', { A: -1, FN: 'log' }, ['math_log_domain']);
checkMath('asin(2)：math_asin_domain', 'op_math', { A: 2, FN: 'asin' }, ['math_asin_domain']);
checkMath('acos(-1.5)：math_asin_domain', 'op_math', { A: -1.5, FN: 'acos' }, ['math_asin_domain']);
checkMath('tan(90)：math_tan_domain', 'op_math', { A: 90, FN: 'tan' }, ['math_tan_domain']);
checkMath('tan(270)：math_tan_domain', 'op_math', { A: 270, FN: 'tan' }, ['math_tan_domain']);
checkMath('tan(45)：通过', 'op_math', { A: 45, FN: 'tan' }, []);

/* 二. 拖入左侧删除：数据层验证（children 数组随父块一并移除） */
const ws2 = { root: [
  b('when_start', 'blk_1', { FLAG: true }),
  b('wait_seconds', 'blk_2', { N: 1, UNIT: '秒' }),
  b('repeat_times', 'blk_3', { N: 2 }, { body: [b('vibe_a_intensity', 'blk_4', { ID: 1, N: 0 })], else: [] }),
  b('lock_set', 'blk_5', { ID: 1, STATE: '开锁' })
], variables: [] };
// 删除 blk_3（带下级堆叠）：其 body 里的 blk_4 一并离开 state.root
ws2.root.splice(2, 1);
check('删除带堆叠的 C 形积木：下级一并移除', ws2.root.map((x) => x.op), ['when_start', 'wait_seconds', 'lock_set']);
const spec2 = GP.toSpec(ws2).spec;
const chain2 = [];
let cur = spec2.program[0];
while (cur) { chain2.push(cur.opcode); cur = cur.next; }
check('删除后 JSON 链只剩剩余积木', chain2, ['when_start', 'wait_seconds', 'lock_set']);
check('删除后校验仍通过', GP.validate(ws2).ok, true);

/* 删除后事件为 0 → 校验失败（全部删空 → 只报 no_event） */
ws2.root.splice(0, 3);
check('删除事件后为 0：报 no_event', codes(GP.validate(ws2)), ['no_event']);

/* 部分删除：事件删掉但语句留在顶层 → no_event + orphan_top 都报 */
const ws3 = { root: [b('when_start', 'blk_1', { FLAG: true }), b('wait_seconds', 'blk_2', { N: 1, UNIT: '秒' })], variables: [] };
ws3.root.splice(0, 1);
check('部分删除后：报 no_event 与 orphan_top', codes(GP.validate(ws3)), ['no_event', 'orphan_top']);

console.log(failed ? '\n' + failed + ' 项失败' : '\n全部通过');
if (failed) process.exitCode = 1;
