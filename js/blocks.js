/* blocks.js — 积木库定义（唯一数据源，供面板渲染 / 引擎转换共用）
 * 全部 opcode 来自需求文档的积木库，不额外发明。
 */
(function (root) {
  'use strict';
  var GP = (root.GP = root.GP || {});

  /* ---------- 分类 ---------- */
  GP.CATS = [
    { id: 'event', name: '事件', color: '#f0b429' },
    { id: 'control', name: '控制', color: '#e8834d' },
    { id: 'device_lock', name: '设备 · 智能锁', color: '#4aa3df' },
    { id: 'device_tens', name: '设备 · 电击器', color: '#8a6fd6' },
    { id: 'device_enema', name: '设备 · 灌肠机', color: '#3fa07f' },
    { id: 'device_vibe_a', name: '设备 · 跳蛋', color: '#d95f8f' },
    { id: 'device_vibe_b', name: '设备 · 榨精机', color: '#c9553f' },
    { id: 'operator', name: '运算 / 判断', color: '#5e9e57' },
    { id: 'value', name: '值 / 变量', color: '#7b8394' }
  ];
  GP.CAT_MAP = {};
  GP.CATS.forEach(function (c) { GP.CAT_MAP[c.id] = c; });

  /* ---------- 参数构造器 ---------- */
  function num(name, dflt) { return { name: name, type: 'number', default: dflt === undefined ? 0 : dflt }; }
  function en(name, dflt, options) { return { name: name, type: 'enum', default: dflt, options: options }; }
  function cond(name) { return { name: name, type: 'condition_block', default: null }; }
  function variable(name) { return { name: name, type: 'variable', default: '' }; }
  var FLAG = { name: 'FLAG', type: 'flag', default: true };

  /* ---------- 积木定义 ----------
   * kind:  hat(事件帽) | stack(普通语句) | cblock(带 body/else 的 C 形) | reporter(内联值/判断)
   * ret:   reporter 的返回类型 number | boolean
   * label: 文本模板，@NAME 为参数槽位
   */
  GP.DEFS = [];
  function def(o) { GP.DEFS.push(o); return o; }

  /* ===== 事件 ===== */
  def({ op: 'when_start', cat: 'event', kind: 'hat', label: '当 @FLAG 被点击', inputs: [FLAG] });
  def({ op: 'when_true', cat: 'event', kind: 'hat', label: '当 @COND 为真', inputs: [cond('COND')] });

  /* ===== 控制 ===== */
  def({ op: 'wait_seconds', cat: 'control', kind: 'stack', label: '等待 @N @UNIT', inputs: [num('N', 1), en('UNIT', '秒', ['秒', '分', '时'])] });
  def({ op: 'wait_until', cat: 'control', kind: 'stack', label: '等待到 @COND 为真', inputs: [cond('COND')] });
  def({ op: 'if_then', cat: 'control', kind: 'cblock', label: '如果 @COND 为真', inputs: [cond('COND')] });
  def({ op: 'if_then_else', cat: 'control', kind: 'cblock', label: '如果 @COND 为真', inputs: [cond('COND')], els: true });
  def({ op: 'repeat_forever', cat: 'control', kind: 'cblock', label: '重复执行', inputs: [] });
  def({ op: 'repeat_times', cat: 'control', kind: 'cblock', label: '重复执行 @N 次', inputs: [num('N', 10)] });
  def({ op: 'break_loop', cat: 'control', kind: 'stack', label: '退出循环', inputs: [] });

  /* ===== 设备 · 智能锁 ===== */
  def({ op: 'lock_set', cat: 'device_lock', kind: 'stack', label: '智能锁 @ID @STATE', inputs: [num('ID', 1), en('STATE', '开锁', ['开锁', '闭锁'])] });

  /* ===== 设备 · 电击器 ===== */
  def({
    op: 'tens_channel_set', cat: 'device_tens', kind: 'stack', label: '将电击器 @ID 通道 @CH 强度设为 @N',
    inputs: [num('ID', 1), en('CH', 'A', ['A', 'B']), num('N', 0)]
  });
  def({ op: 'tens_all_off', cat: 'device_tens', kind: 'stack', label: '电击器 @ID 全部关闭', inputs: [num('ID', 1)] });

  /* ===== 设备 · 灌肠机 ===== */
  def({ op: 'enema_expand', cat: 'device_enema', kind: 'stack', label: '灌肠机 @ID 膨胀/缩小到 @N 厘米', inputs: [num('ID', 1), num('N', 0)] });
  def({ op: 'enema_pause', cat: 'device_enema', kind: 'stack', label: '灌肠机 @ID 暂停', inputs: [num('ID', 1)] });
  def({ op: 'enema_run', cat: 'device_enema', kind: 'stack', label: '灌肠机 @ID 灌肠', inputs: [num('ID', 1)] });

  /* ===== 设备 · 跳蛋 ===== */
  def({ op: 'vibe_a_intensity', cat: 'device_vibe_a', kind: 'stack', label: '将跳蛋 @ID 强度设为 @N', inputs: [num('ID', 1), num('N', 0)] });
  def({ op: 'vibe_a_frequency', cat: 'device_vibe_a', kind: 'stack', label: '将跳蛋 @ID 频率设为 @N', inputs: [num('ID', 1), num('N', 0)] });

  /* ===== 设备 · 榨精机 ===== */
  def({ op: 'vibe_b_intensity', cat: 'device_vibe_b', kind: 'stack', label: '将榨精机 @ID 强度设为 @N', inputs: [num('ID', 1), num('N', 0)] });
  def({ op: 'vibe_b_frequency', cat: 'device_vibe_b', kind: 'stack', label: '将榨精机 @ID 频率设为 @N', inputs: [num('ID', 1), num('N', 0)] });

  /* ===== 运算（返回 number） ===== */
  var A0 = num('A', 0), B0 = num('B', 0);
  def({ op: 'op_add', cat: 'operator', kind: 'reporter', ret: 'number', label: '@A + @B', inputs: [A0, B0] });
  def({ op: 'op_sub', cat: 'operator', kind: 'reporter', ret: 'number', label: '@A - @B', inputs: [A0, B0] });
  def({ op: 'op_mul', cat: 'operator', kind: 'reporter', ret: 'number', label: '@A × @B', inputs: [A0, B0] });
  def({ op: 'op_div', cat: 'operator', kind: 'reporter', ret: 'number', label: '@A ÷ @B', inputs: [num('A', 0), num('B', 1)] });
  def({ op: 'op_random', cat: 'operator', kind: 'reporter', ret: 'number', label: '在 @A 到 @B 之间的随机整数', inputs: [num('A', 0), num('B', 100)] });
  def({
    op: 'op_math', cat: 'operator', kind: 'reporter', ret: 'number', label: '对 @A 取 @FN',
    inputs: [num('A', 0), en('FN', '取整', ['绝对值', '取整', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log'])]
  });

  /* ===== 判断（返回 boolean） ===== */
  def({ op: 'logic_and', cat: 'operator', kind: 'reporter', ret: 'boolean', label: '@A 且 @B', inputs: [cond('A'), cond('B')] });
  def({ op: 'logic_or', cat: 'operator', kind: 'reporter', ret: 'boolean', label: '@A 或 @B', inputs: [cond('A'), cond('B')] });
  def({ op: 'logic_not', cat: 'operator', kind: 'reporter', ret: 'boolean', label: '@A 不成立', inputs: [cond('A')] });
  def({ op: 'cmp_eq', cat: 'operator', kind: 'reporter', ret: 'boolean', label: '@A = @B', inputs: [A0, B0] });
  def({ op: 'cmp_gt', cat: 'operator', kind: 'reporter', ret: 'boolean', label: '@A > @B', inputs: [A0, B0] });
  def({ op: 'cmp_lt', cat: 'operator', kind: 'reporter', ret: 'boolean', label: '@A < @B', inputs: [A0, B0] });
  def({ op: 'cmp_ge', cat: 'operator', kind: 'reporter', ret: 'boolean', label: '@A ≥ @B', inputs: [A0, B0] });
  def({ op: 'cmp_le', cat: 'operator', kind: 'reporter', ret: 'boolean', label: '@A ≤ @B', inputs: [A0, B0] });

  /* ===== 值 / 变量 ===== */
  def({ op: 'val_time', cat: 'value', kind: 'reporter', ret: 'number', label: '当前时间 @UNIT', inputs: [en('UNIT', '秒', ['年', '月', '日', '时', '分', '秒'])] });
  def({ op: 'var_define', cat: 'value', kind: 'stack', label: '设置自定义变量 @NAME', inputs: [variable('NAME')] });
  def({ op: 'var_set', cat: 'value', kind: 'stack', label: '将变量 @NAME 修改为 @VALUE', inputs: [variable('NAME'), num('VALUE', 0)] });
  def({ op: 'var_add', cat: 'value', kind: 'stack', label: '将变量 @NAME 增加 @VALUE', inputs: [variable('NAME'), num('VALUE', 0)] });

  /* ===== 设备状态值 ===== */
  def({ op: 'lock_state', cat: 'value', kind: 'reporter', ret: 'number', label: '智能锁 @ID 的状态（开锁0/闭锁1）', inputs: [num('ID', 1)] });
  def({ op: 'tens_omega', cat: 'value', kind: 'reporter', ret: 'number', label: '电击器 @ID 的角速度', inputs: [num('ID', 1)] });
  def({ op: 'tens_alpha', cat: 'value', kind: 'reporter', ret: 'number', label: '电击器 @ID 的加速度', inputs: [num('ID', 1)] });
  def({ op: 'tens_angle', cat: 'value', kind: 'reporter', ret: 'number', label: '电击器 @ID 的角度', inputs: [num('ID', 1)] });

  /* ---------- 索引 ---------- */
  GP.DEF_MAP = {};
  GP.DEFS.forEach(function (d) { GP.DEF_MAP[d.op] = d; });
  GP.getDef = function (op) { return GP.DEF_MAP[op] || null; };
  GP.defsByCat = function (cat) { return GP.DEFS.filter(function (d) { return d.cat === cat; }); };

  /* 模板拆分为 文本 / @参数 片段 */
  GP.splitLabel = function (label) { return label.split(/(@[A-Z_]+)/).filter(function (s) { return s !== ''; }); };

  GP.isReporter = function (op) { var d = GP.getDef(op); return !!d && d.kind === 'reporter'; };
  GP.isCBlock = function (op) { var d = GP.getDef(op); return !!d && d.kind === 'cblock'; };
  GP.isHat = function (op) { var d = GP.getDef(op); return !!d && d.kind === 'hat'; };

  /* 槽位是否接受某积木 */
  GP.canAccept = function (inputDef, block) {
    if (!inputDef || !block) return false;
    var d = GP.getDef(block.op);
    if (!d || d.kind !== 'reporter') return false;
    if (inputDef.type === 'condition_block') return d.ret === 'boolean';
    if (inputDef.type === 'number') return d.ret === 'number';
    return false;
  };
})(typeof window !== 'undefined' ? window : globalThis);
