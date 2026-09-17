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
    rootList.forEach(function (b) {
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
})(typeof window !== 'undefined' ? window : globalThis);
