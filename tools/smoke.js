/* smoke.js — 无浏览器自检：验证空槽、嵌套位置、条件内联、线性 next */
const path = require('path');
require(path.join(__dirname, '..', 'js', 'blocks.js'));
require(path.join(__dirname, '..', 'js', 'engine.js'));
const GP = globalThis.GP;

function block(op, fields, children) {
  return { uid: 'u_' + op + Math.random().toString(36).slice(2, 6), op: op, fields: fields || {}, children: children || { body: [], else: [] } };
}
function b(op, uid, fields, children) {
  return { uid: uid, op: op, fields: fields || {}, children: children || { body: [], else: [] } };
}

const state = {
  root: [
    b('when_start', 'blk_1', { FLAG: true }, {
      body: [], else: []
    }),
    b('wait_seconds', 'blk_2', { N: '2', UNIT: '秒' }),
    b('repeat_times', 'blk_3', { N: '3' }, {
      body: [
        b('tens_channel_set', 'blk_4', { ID: '1', CH: 'A', N: '50' }),
        b('if_then', 'blk_5', {
          COND: b('cmp_ge', 'blk_6', {
            A: b('tens_omega', 'blk_7', { ID: '1' }),
            B: '10'
          })
        }, {
          body: [b('lock_set', 'blk_8', { ID: '1', STATE: '闭锁' })],
          else: []
        }),
        b('if_then_else', 'blk_9', { COND: null }, {
          body: [b('break_loop', 'blk_10', {}, {})],
          else: [b('vibe_a_intensity', 'blk_11', { ID: '1', N: b('op_random', 'blk_12', { A: '1', B: '9' }) }, {})]
        })
      ]
    }),
    b('var_define', 'blk_13', { NAME: '次数' }),
    b('var_add', 'blk_14', { NAME: '次数', VALUE: b('val_time', 'blk_15', { UNIT: '分' }) })
  ],
  variables: []
};
// 顶层第一块是 hat，其余同链。验证多事件分链：
state.root.push(b('when_true', 'blk_16', { COND: b('logic_not', 'blk_17', { A: b('cmp_lt', 'blk_18', { A: '1', B: '2' }) }) }));
state.root.push(b('enema_run', 'blk_19', { ID: '2' }));

const res = GP.toSpec(state);
console.log(JSON.stringify(res.spec, null, 2));
console.log('--- warnings ---');
res.warnings.forEach(w => console.log('*', w));

// 断言
const spec = res.spec;
const a = [];
function walkChain(c) {
  if (Array.isArray(c)) { c.forEach(walkChain); return; }
  if (!c) return;
  a.push(c.opcode);
  // 内联条件/运算/值积木：嵌在 inputs 里，可多层嵌套
  Object.keys(c.inputs || {}).forEach(function (k) {
    var v = c.inputs[k];
    if (v && typeof v === 'object' && typeof v.opcode === 'string') walkChain(v);
  });
  if (c.body) walkChain(c.body);
  if (c.else) walkChain(c.else);
  walkChain(c.next);
}
spec.program.forEach(p => walkChain(p));
const must = ['when_start', 'wait_seconds', 'repeat_times', 'tens_channel_set', 'if_then', 'cmp_ge', 'tens_omega', 'lock_set', 'if_then_else', 'cmp_eq', 'break_loop', 'vibe_a_intensity', 'op_random', 'var_define', 'var_add', 'val_time', 'when_true', 'logic_not', 'cmp_lt', 'enema_run'];
const missing = must.filter(op => !a.includes(op));
console.log('chains:', spec.program.length, 'blocks:', a.length, 'missing:', missing);
if (spec.program.length !== 2) throw new Error('事件应分成 2 条链');
if (missing.length) throw new Error('缺失 opcode: ' + missing);
if (!spec.program[0].next) throw new Error('线性 next 丢失');
console.log('OK');
