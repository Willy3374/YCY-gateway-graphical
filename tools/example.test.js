/* example.test.js — 示例工程往返自检（不依赖浏览器）
 * 验证：内置示例（附件 JSON）能被 importSpec 展开成线序，再由 toSpec 还原成
 * 同构的 program，且执行顺序、嵌套层级、内联条件全部保持一致。
 * 用法: node tools/example.test.js
 */
const path = require('path');
require(path.join(__dirname, '..', 'js', 'blocks.js'));
require(path.join(__dirname, '..', 'js', 'examples.js'));
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

const ex = GP.getExample();
const spec = JSON.parse(JSON.stringify(ex.spec));

/* ---------- 1. 示例结构符合任务描述 ---------- */
const p = spec.program[0];
check('示例以「当开始被点击」开头', p.opcode, 'when_start');
check('其下接「重复执行」', p.next.opcode, 'repeat_forever');

const foreverBody = p.next.body;
check('重复执行体内第 1 步是等待 1 秒', foreverBody[0].opcode, 'wait_seconds');
check('等待单位与数值正确', foreverBody[0].inputs, { N: 1, UNIT: '秒' });
check('重复执行体内第 2 步是条件判断', foreverBody[1].opcode, 'if_then_else');

const ifb = foreverBody[1];
check('条件为「电击器角速度 > 10」', ifb.inputs.COND.inputs.B, 10);
check('条件左侧是电击器角速度', ifb.inputs.COND.inputs.A.opcode, 'tens_omega');
check('条件槽参数 ID = 1', ifb.inputs.COND.inputs.A.inputs.ID, 1);

check('分支 if 第 1 步：跳蛋强度设 0', ifb.body[0].opcode, 'vibe_a_intensity');
check('分支 if 第 1 步强度 = 0', ifb.body[0].inputs.N, 0);
check('分支 if 第 2 步：重复 10 次', ifb.body[1].opcode, 'repeat_times');
check('重复次数 = 10', ifb.body[1].inputs.N, 10);

const loop = ifb.body[1].body;
check('循环体 4 步', loop.map((x) => x.opcode),
  ['tens_channel_set', 'wait_seconds', 'tens_channel_set', 'wait_seconds']);
check('循环第 1 步：通道 A 强度 30', loop[0].inputs, { ID: 1, CH: 'A', N: 30 });
check('循环第 2 步：等待 10 秒', loop[1].inputs, { N: 10, UNIT: '秒' });
check('循环第 3 步：通道 A 强度 0', loop[2].inputs, { ID: 1, CH: 'A', N: 0 });
check('循环第 4 步：等待 10 秒', loop[3].inputs, { N: 10, UNIT: '秒' });
check('分支 else：跳蛋强度 50', ifb.else.map((x) => x.opcode), ['vibe_a_intensity']);
check('分支 else 强度 = 50', ifb.else[0].inputs.N, 50);
check('变量表为空', spec.variables, {});

/* ---------- 2. 导入：next 链必须展开成线序，不能只剩第一块 ---------- */
const flat = globalThis.GPWorkspace.importSpec(spec);
const flatOps = flat.map((b) => b.op);
check('顶层展开为 2 块（当开始 + 重复执行）', flatOps, ['when_start', 'repeat_forever']);
check('重复执行的 body 展开为 2 块', flat[1].children.body.map((b) => b.op), ['wait_seconds', 'if_then_else']);
check('if 分支展开为 2 块', flat[1].children.body[1].children.body.map((b) => b.op),
  ['vibe_a_intensity', 'repeat_times']);
check('循环体展开为 4 块', flat[1].children.body[1].children.body[1].children.body.map((b) => b.op),
  ['tens_channel_set', 'wait_seconds', 'tens_channel_set', 'wait_seconds']);
check('else 展开为 1 块', flat[1].children.body[1].children.else.map((b) => b.op), ['vibe_a_intensity']);
check('嵌套条件已还原为积木对象', flat[1].children.body[1].fields.COND.op, 'cmp_gt');
check('条件左侧嵌套对象已还原', flat[1].children.body[1].fields.COND.fields.A.op, 'tens_omega');

/* ---------- 3. 往返：导入再导出，程序语义不变 ---------- */
const state = { root: flat, variables: [] };
const res = GP.toSpec(state);
const out = res.spec;

// 结构对比（忽略自动生成的 id）
function strip(node) {
  if (Array.isArray(node)) return node.map(strip);
  if (!node || typeof node !== 'object') return node;
  const o = {};
  Object.keys(node).sort().forEach((k) => {
    if (k === 'id') return;
    o[k] = strip(node[k]);
  });
  return o;
}
check('往返后 program 结构一致', strip(out.program), strip(spec.program));
check('往返后无占位告警', res.warnings, []);
check('往返后变量表一致', out.variables, spec.variables);

console.log(failed ? '\n' + failed + ' 项失败' : '\n全部通过');
if (failed) process.exitCode = 1;
