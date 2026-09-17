/* engine.js — 图形工程状态 → 自定义逻辑 JSON
 * 输出结构:
 *   { version, program: [ {opcode,id,inputs,body,else,next} ], variables }
 * 规则:
 *   - 嵌套容器用 body / else，线性顺序用 next
 *   - 条件 / 运算 / 值积木作为 inputs 的内联对象嵌入（带 opcode / inputs / returns）
 *   - 所有 opcode 均来自积木库，未定义的 opcode 直接报错
 */
(function (root) {
  'use strict';
  var GP = (root.GP = root.GP || {});

  function isBlockNode(v) { return !!v && typeof v === 'object' && typeof v.op === 'string'; }

  GP.toSpec = function (state) {
    var warnings = [];
    var phSeq = 0;

    function inputDef(def, name) {
      var list = (def && def.inputs) || [];
      for (var i = 0; i < list.length; i++) { if (list[i].name === name) return list[i]; }
      return null;
    }

    function emitValue(b) {
      var def = GP.getDef(b.op);
      var o = { opcode: b.op, id: b.uid };
      var inputs = inputsOf(b, def);
      if (Object.keys(inputs).length) o.inputs = inputs;
      if (def.ret) o.returns = def.ret;
      return o;
    }

    function valueOf(b, def, inp) {
      var v = b.fields ? b.fields[inp.name] : undefined;
      if (isBlockNode(v)) return emitValue(v);
      if (inp.type === 'condition_block') {
        warnings.push('积木 ' + b.uid + ' (' + def.op + ') 的条件槽为空，已用占位条件 0 = 0 填充');
        return { opcode: 'cmp_eq', id: 'blk_ph_' + (++phSeq), inputs: { A: 0, B: 0 }, returns: 'boolean' };
      }
      if (v === undefined || v === null || v === '') return inp.default;
      if (inp.type === 'number') {
        var n = Number(v);
        return isNaN(n) ? inp.default : n;
      }
      return v;
    }

    function inputsOf(b, def) {
      var inputs = {};
      (def.inputs || []).forEach(function (inp) {
        if (inp.type === 'flag') return; // 纯界面参数，不进入 JSON
        if (inp.type === 'variable') {
          var name = b.fields ? b.fields[inp.name] : '';
          if (name === undefined || name === null || name === '') {
            warnings.push('积木 ' + b.uid + ' (' + def.op + ') 未填写变量名');
            name = inp.default || '';
          }
          inputs[inp.name] = name;
          return;
        }
        inputs[inp.name] = valueOf(b, def, inp);
      });
      return inputs;
    }

    function emitStatement(b) {
      var def = GP.getDef(b.op);
      if (!def) throw new Error('未知 opcode: ' + b.op);
      var o = { opcode: b.op, id: b.uid };
      var inputs = inputsOf(b, def);
      if (Object.keys(inputs).length) o.inputs = inputs;
      if (def.kind === 'cblock') {
        var body = (b.children && b.children.body) || [];
        var els = (b.children && b.children.else) || [];
        o.body = emitList(body);
        if (def.els) o.else = emitList(els);
      }
      return o;
    }

    /* body / else 用数组表达顺序（与输出格式样例一致） */
    function emitList(list) { return list.map(emitStatement); }

    /* 顶层链用 next 串联 */
    function emitChain(list) {
      var head = null;
      for (var i = list.length - 1; i >= 0; i--) {
        var o = emitStatement(list[i]);
        if (head) o.next = head;
        head = o;
      }
      return head;
    }

    var rootList = state.root || [];
    var groups = [];
    /* 自由摆放：顶层块可放画布任意位置，JSON 链序按 pos 稳定排序（y 优先、其次 x），
     * 与视觉位置一致；无 pos 的块保持拖入顺序排在后面。 */
    var ordered = rootList
      .map(function (b, i) { return { b: b, i: i }; })
      .sort(function (p, q) {
        var pp = p.b.pos, qp = q.b.pos;
        if (pp && qp) {
          if (pp.y !== qp.y) return pp.y - qp.y;
          if (pp.x !== qp.x) return pp.x - qp.x;
        }
        if (pp) return -1;
        if (qp) return 1;
        return p.i - q.i;
      })
      .map(function (w) { return w.b; });
    ordered.forEach(function (b) {
      if (!GP.getDef(b.op)) throw new Error('未知 opcode: ' + b.op);
      if (GP.isHat(b.op) || groups.length === 0) groups.push([b]);
      else groups[groups.length - 1].push(b);
    });
    if (rootList.length && !GP.isHat(rootList[0].op)) {
      warnings.push('顶层第一块不是事件积木（建议以「当开始被点击」开头）');
    }

    var program = groups.map(emitChain);

    var variables = {};
    (state.variables || []).forEach(function (name) { if (name) variables[name] = 0; });

    return { spec: { version: '1.0', program: program, variables: variables }, warnings: warnings };
  };

  /* ---------- 校验 ----------
   * 返回 { ok, errors: [{ code, msg }] }；全部中文、可定位（含积木 uid / opcode）。
   * 规则：
   *   a. 至少 1 个事件积木（when_start / when_true）
   *   b. 事件积木总数 <= 2（任意组合）
   *   c. 顶层只能是事件积木，其余语句必须接入某个事件任务
   *   d. when_true 的条件槽必须已填判断积木（非空 / 非占位）
   *   e. 运算 / 判断（reporter）不能单独作为语句
   *   f. 事件积木不能嵌进 body / else
   *   g. 槽位类型匹配（条件槽收 boolean，数值槽收 number）、opcode 必须在积木库内
   *   h. 数学合理性：除数非 0；ln/log 参数 > 0；asin/acos 参数在 [-1,1]；tan 不取 90°+k·180°
   */
  GP.validate = function (state) {
    var errors = [];
    function err(code, msg) { errors.push({ code: code, msg: msg }); }
    function isBlockVal(v) { return !!v && typeof v === 'object' && typeof v.op === 'string'; }

    /* h. 数学合理性：只检查字面量参数（嵌套积木的值运行期才知道，不在此判） */
    function checkMath(op, fields, uid) {
      var A = fields.A, B = fields.B;
      if (op === 'op_div' && typeof B === 'number' && B === 0) {
        err('math_div_zero', '除法积木 ' + uid + '（op_div）的除数为 0，请修改除数');
      }
      if (op !== 'op_math' || typeof A !== 'number') return;
      var fn = fields.FN;
      if ((fn === 'ln' || fn === 'log') && A <= 0) {
        err('math_log_domain', '运算积木 ' + uid + '（op_math）：' + fn + '(' + A + ') 超出定义域，要求参数 > 0');
      }
      if ((fn === 'asin' || fn === 'acos') && (A < -1 || A > 1)) {
        err('math_asin_domain', '运算积木 ' + uid + '（op_math）：' + fn + '(' + A + ') 超出定义域，要求参数在 -1 到 1 之间');
      }
      if (fn === 'tan') {
        var r = ((A % 180) + 180) % 180;
        if (r === 90) err('math_tan_domain', '运算积木 ' + uid + '（op_math）：tan(' + A + ') 无定义（' + A + '° + k·180° 处 tan 发散）');
      }
    }

    /* d / g. 槽位：条件槽必须已填且收 boolean；数值槽内联积木必须收 number */
    function checkInputs(b, def) {
      (def.inputs || []).forEach(function (inp) {
        var v = b.fields ? b.fields[inp.name] : undefined;
        var inline = isBlockVal(v);
        if (inp.type === 'condition_block') {
          if (!inline) {
            err('cond_missing', '积木 ' + b.uid + '（' + def.op + '）的条件槽为空，请拖入判断积木到条件插槽');
          } else {
            var d2 = GP.getDef(v.op);
            if (!d2 || d2.kind !== 'reporter' || d2.ret !== 'boolean') {
              err('slot_type', '积木 ' + b.uid + '（' + def.op + '）的条件槽需要返回“真/假”的判断积木');
            }
          }
        } else if (inp.type === 'number' && inline) {
          var d3 = GP.getDef(v.op);
          if (!d3 || d3.kind !== 'reporter' || d3.ret !== 'number') {
            err('slot_type', '积木 ' + b.uid + '（' + def.op + '）的数值槽 ' + inp.name + ' 需要返回数字的运算/值积木');
          }
        }
      });
    }

    function walkValue(b) {
      var def = GP.getDef(b.op);
      if (!def) { err('unknown_op', '未知积木类型：' + b.op + '（' + b.uid + '）'); return; }
      checkInputs(b, def);
      checkMath(b.op, b.fields || {}, b.uid);
      Object.keys(b.fields || {}).forEach(function (k) {
        if (isBlockVal(b.fields[k])) walkValue(b.fields[k]);
      });
    }

    function walkStatement(b, nested) {
      var def = GP.getDef(b.op);
      if (!def) { err('unknown_op', '未知积木类型：' + b.op + '（' + b.uid + '）'); return; }
      if (def.kind === 'reporter') {
        err('reporter_statement', '运算/判断积木 ' + b.uid + '（' + b.op + '）不能单独作为语句，请拖到积木的输入插槽中');
      }
      if (def.kind === 'hat' && nested) {
        err('hat_nested', '事件积木 ' + b.uid + '（' + b.op + '）只能放在顶层，不能放进其他积木内部');
      }
      checkInputs(b, def);
      checkMath(b.op, b.fields || {}, b.uid);
      (b.children.body || []).forEach(function (c) { walkStatement(c, true); });
      (b.children.else || []).forEach(function (c) { walkStatement(c, true); });
      Object.keys(b.fields || {}).forEach(function (k) {
        if (isBlockVal(b.fields[k])) walkValue(b.fields[k]);
      });
    }

    var root = (state && state.root) || [];

    /* a / b. 事件积木数量：至少 1，最多 2 */
    var hats = root.filter(function (b) {
      var d = GP.getDef(b.op);
      return d && d.kind === 'hat';
    });
    if (!hats.length) {
      err('no_event', '缺少事件积木：请至少放置 1 个「当开始被点击」或「当条件为真」');
    } else if (hats.length > 2) {
      err('too_many_events', '事件积木共 ' + hats.length + ' 个：最多允许 2 个（当开始被点击 / 当条件为真可任意组合）');
    }

    /* c. 事件之前的顶层积木 = 未接入任何事件任务 */
    var seenHat = false;
    root.forEach(function (b) {
      var d = GP.getDef(b.op);
      if (d && d.kind === 'hat') { seenHat = true; return; }
      if (!seenHat) {
        err('orphan_top', '积木 ' + b.uid + '（' + b.op + '）位于事件积木之前，未接入任何事件任务');
      }
    });

    root.forEach(function (b) { walkStatement(b, false); });

    return { ok: errors.length === 0, errors: errors };
  };
})(typeof window !== 'undefined' ? window : globalThis);
