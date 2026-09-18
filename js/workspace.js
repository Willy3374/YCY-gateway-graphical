/* workspace.js — 画布状态、渲染、拖拽交互 */
(function (root) {
  'use strict';
  var GP = (root.GP = root.GP || {});

  var state = { root: [], variables: [], seq: 0 };
  var registry = {};   // uid -> { block, container }
  var dragInfo = null; // { fromPalette, op } | { fromPalette:false, uid }
  var rootEl, paletteEl;
  var hoverEl = null;

  /* ---------- 构造 ---------- */
  function uid() { state.seq += 1; return 'blk_' + state.seq; }

  function newBlock(op) {
    var def = GP.getDef(op);
    if (!def) throw new Error('未知 opcode: ' + op);
    var b = { uid: uid(), op: op, fields: {}, children: { body: [], else: [] } };
    (def.inputs || []).forEach(function (inp) {
      b.fields[inp.name] = inp.type === 'condition_block' ? null : inp.default;
    });
    return b;
  }

  function inputDefOf(def, name) {
    var l = (def && def.inputs) || [];
    for (var i = 0; i < l.length; i++) { if (l[i].name === name) return l[i]; }
    return null;
  }

  function forget(b) {
    delete registry[b.uid];
    if (b.fields) {
      Object.keys(b.fields).forEach(function (k) {
        var v = b.fields[k];
        if (v && typeof v === 'object' && v.op) forget(v);
      });
    }
    (b.children.body || []).forEach(forget);
    (b.children.else || []).forEach(forget);
  }

  function isBlockNode(v) { return !!v && typeof v === 'object' && typeof v.op === 'string'; }

  /* ---------- 渲染 ---------- */
  function register(block, container) { registry[block.uid] = { block: block, container: container }; }

  var rootBlockEls = {}; // uid -> 顶层块 DOM，渲染后统一应用自由摆放定位

  function renderRoot() {
    registry = {};
    rootBlockEls = {};
    rootEl.innerHTML = '';
    var frag = document.createDocumentFragment();
    state.root.forEach(function (b) { frag.appendChild(renderBlock(b, { kind: 'list', list: state.root })); });
    rootEl.appendChild(frag);
    /* 自由摆放：拖到画布任意位置（像素级） */
    state.root.forEach(function (b) {
      var el = rootBlockEls[b.uid];
      if (el) applyFreePos(el, b);
    });
    if (!state.root.length) {
      var hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = '把左侧积木拖到这里开始编程（建议以「当开始被点击」开头）';
      rootEl.appendChild(hint);
    }
    var counter = document.getElementById('blk-count');
    if (counter) counter.textContent = String(Object.keys(registry).length);
  }

  /* 顶层自由摆放：有 pos 的块绝对定位到画布任意位置，无 pos 的保持流式堆叠 */
  function applyFreePos(el, b) {
    if (!b || !b.pos) return;
    el.style.position = 'absolute';
    el.style.left = (typeof b.pos.x === 'number' && isFinite(b.pos.x) ? b.pos.x : 0) + 'px';
    el.style.top = (typeof b.pos.y === 'number' && isFinite(b.pos.y) ? b.pos.y : 0) + 'px';
    el.style.margin = '0';
    el.style.zIndex = '1';
  }

  function renderBlock(b, container) {
    var def = GP.getDef(b.op);
    if (!def) return document.createTextNode('');
    if (container) register(b, container);

    var el = document.createElement('div');
    el.className = 'blk ' + (def.kind === 'reporter' ? 'reporter' : 'statement') + ' cat-' + def.cat;
    el.dataset.uid = b.uid;
    if (container && container.kind === 'list' && container.list === state.root) rootBlockEls[b.uid] = el;
    if (def.kind === 'hat') el.classList.add('hat');
    if (def.kind === 'cblock') el.classList.add('cblock');
    if (container) el.draggable = true; // 画布/插槽内的积木可拖动

    var head = document.createElement('div');
    head.className = 'blk-head';

    GP.splitLabel(def.label).forEach(function (seg) {
      if (seg.charAt(0) !== '@') {
        var t = document.createElement('span');
        t.className = 'txt';
        t.textContent = seg;
        head.appendChild(t);
        return;
      }
      head.appendChild(renderSlot(b, def, inputDefOf(def, seg.slice(1))));
    });

    if (!container) {
      var grab = document.createElement('span');
      grab.className = 'grab';
      grab.textContent = '⠿';
      head.insertBefore(grab, head.firstChild);
    } else {
      var del = document.createElement('button');
      del.className = 'blk-del';
      del.type = 'button';
      del.title = '删除积木';
      del.textContent = '✕';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        if (registry[b.uid]) detach(registry[b.uid]);
        refreshVarList();
        renderRoot();
      });
      head.appendChild(del);
    }

    el.appendChild(head);

    if (def.kind === 'cblock') {
      el.appendChild(renderList(b, 'body'));
      if (def.els) {
        var mid = document.createElement('div');
        mid.className = 'else-label';
        mid.textContent = '否则';
        el.appendChild(mid);
        el.appendChild(renderList(b, 'else'));
      }
    }
    return el;
  }

  function renderList(parentBlock, side) {
    var list = document.createElement('div');
    list.className = 'list';
    list.dataset.owner = parentBlock.uid;
    list.dataset.side = side;
    var arr = parentBlock.children[side] || (parentBlock.children[side] = []);
    arr.forEach(function (child) {
      list.appendChild(renderBlock(child, { kind: 'list', list: arr }));
    });
    if (!arr.length) {
      var hint = document.createElement('div');
      hint.className = 'list-hint';
      hint.textContent = side === 'else' ? '否则执行…' : '放入积木';
      list.appendChild(hint);
    }
    return list;
  }

  function renderSlot(b, def, inp) {
    if (!inp) return document.createTextNode('');
    var slot = document.createElement('span');
    slot.className = 'slot';
    slot.dataset.uid = b.uid;
    slot.dataset.name = inp.name;
    slot.dataset.itype = inp.type;

    var v = b.fields[inp.name];

    if (inp.type === 'flag') {
      slot.classList.add('toggle-slot');
      var on = v !== false && v !== 'false';
      var t = document.createElement('span');
      t.className = 'toggle ' + (on ? 'on' : 'off');
      t.textContent = on ? '开始' : '未启用';
      t.addEventListener('click', function (e) {
        e.stopPropagation();
        b.fields[inp.name] = !(b.fields[inp.name] !== false && b.fields[inp.name] !== 'false');
        renderRoot();
      });
      slot.appendChild(t);
      return slot;
    }

    if (isBlockNode(v)) {
      slot.classList.add('filled');
      slot.appendChild(renderBlock(v, { kind: 'slot', parent: b, name: inp.name }));
      var rm = document.createElement('button');
      rm.className = 'slot-clear';
      rm.type = 'button';
      rm.title = '移除嵌套积木';
      rm.textContent = '✕';
      rm.addEventListener('click', function (e) {
        e.stopPropagation();
        forget(v);
        b.fields[inp.name] = inp.type === 'condition_block' ? null : inp.default;
        renderRoot();
      });
      slot.appendChild(rm);
      return slot;
    }

    if (inp.type === 'condition_block') {
      slot.classList.add('cond-slot');
      slot.textContent = '条件';
      return slot;
    }

    if (inp.type === 'enum') {
      var sel = document.createElement('select');
      (inp.options || []).forEach(function (o) {
        var op = document.createElement('option');
        op.value = o; op.textContent = o;
        if (String(v) === o) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      sel.addEventListener('change', function () { b.fields[inp.name] = sel.value; });
      freezeWhileEditing(sel);
      slot.appendChild(sel);
      return slot;
    }

    if (inp.type === 'variable') {
      var vi = document.createElement('input');
      vi.type = 'text';
      vi.className = 'var-input';
      vi.placeholder = '变量名';
      vi.value = (v === null || v === undefined) ? '' : String(v);
      vi.setAttribute('list', 'var-list');
      vi.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      vi.addEventListener('input', function () { b.fields[inp.name] = vi.value.trim(); refreshVarList(); });
      freezeWhileEditing(vi);
      slot.appendChild(vi);
      return slot;
    }

    var ni = document.createElement('input');
    ni.type = 'number';
    ni.className = 'num-input';
    ni.value = (v === null || v === undefined || v === '') ? inp.default : v;
    ni.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    ni.addEventListener('input', function () { b.fields[inp.name] = ni.value; });
    freezeWhileEditing(ni);
    slot.appendChild(ni);
    return slot;
  }

  /* 聚焦输入框时暂停整块拖动，避免无法框选文本 */
  function freezeWhileEditing(control) {
    control.addEventListener('focus', function () {
      var el = control.closest('.blk');
      if (el) el.draggable = false;
    });
    control.addEventListener('blur', function () {
      var el = control.closest('.blk');
      if (el) el.draggable = true;
    });
  }

  function refreshVarList() {
    var dl = document.getElementById('var-list');
    if (!dl) return;
    var seen = {};
    function walk(b) {
      var def = GP.getDef(b.op);
      if (!def) return;
      (def.inputs || []).forEach(function (inp) {
        var val = b.fields ? b.fields[inp.name] : null;
        if (inp.type === 'variable' && typeof val === 'string' && val) seen[val] = 1;
        if (isBlockNode(val)) walk(val);
      });
      (b.children.body || []).forEach(walk);
      (b.children.else || []).forEach(walk);
    }
    state.root.forEach(walk);
    state.variables = Object.keys(seen).sort();
    dl.innerHTML = state.variables.map(function (n) {
      return '<option value="' + n + '"></option>';
    }).join('');
  }

  /* ---------- 拖拽：命中判定 ---------- */
  function dragBlock() {
    if (!dragInfo) return null;
    if (dragInfo.fromPalette) {
      var d = GP.getDef(dragInfo.op);
      return { op: dragInfo.op, uid: '__palette__', fields: {}, children: {}, kind: d.kind, ret: d.ret };
    }
    var entry = registry[dragInfo.uid];
    return entry ? entry.block : null;
  }

  function detach(entry) {
    if (!entry || !entry.container) return;
    var c = entry.container;
    if (c.kind === 'list') {
      var i = c.list.indexOf(entry.block);
      if (i >= 0) c.list.splice(i, 1);
    } else if (c.kind === 'slot') {
      if (c.parent.fields[c.name] === entry.block) {
        var inp = inputDefOf(GP.getDef(c.parent.op), c.name);
        c.parent.fields[c.name] = inp && inp.type === 'condition_block' ? null : (inp ? inp.default : null);
        forget(entry.block);
      }
    }
  }

  function resolveTarget(e) {
    var dragging = dragBlock();
    if (!dragging) return null;
    var reporter = GP.isReporter(dragging.op);
    var t = e.target;

    if (reporter) {
      var slotEl = t.closest ? t.closest('.slot') : null;
      if (slotEl && rootEl.contains(slotEl) && !slotEl.classList.contains('filled') && slotEl.dataset.uid !== dragging.uid) {
        var owner = registry[slotEl.dataset.uid];
        var inp = owner && inputDefOf(GP.getDef(owner.block.op), slotEl.dataset.name);
        if (inp && !isBlockNode(owner.block.fields[inp.name]) && GP.canAccept(inp, dragging)) {
          return { kind: 'slot', slotEl: slotEl, owner: owner, input: inp };
        }
      }
      return null;
    }

    if (GP.isHat(dragging.op)) {
      if (!rootEl.contains(t)) return null;
      return { kind: 'list', listEl: rootEl, arr: state.root, top: true };
    }

    var listEl = t.closest ? t.closest('.list') : null;
    if (!listEl || !rootEl.contains(listEl)) {
      if (!rootEl.contains(t)) return null;
      listEl = null;
      return { kind: 'list', listEl: null, arr: state.root, top: true };
    }
    var ownerEntry = registry[listEl.dataset.owner];
    if (!ownerEntry) return null;
    if (ownerEntry.block.uid === dragging.uid) return null;
    var side = listEl.dataset.side;
    return { kind: 'list', listEl: listEl, arr: ownerEntry.block.children[side], top: false };
  }

  function inDraggedSubtree(node, uid) {
    if (!node) return false;
    if (node.uid === uid) return true;
    var hit = false;
    Object.keys(node.fields || {}).forEach(function (k) { if (isBlockNode(node.fields[k])) hit = hit || inDraggedSubtree(node.fields[k], uid); });
    (node.children.body || []).forEach(function (c) { hit = hit || inDraggedSubtree(c, uid); });
    (node.children.else || []).forEach(function (c) { hit = hit || inDraggedSubtree(c, uid); });
    return hit;
  }

  function clearHint() {
    if (hoverEl) hoverEl.classList.remove('drop-ok');
    hoverEl = null;
    rootEl.classList.remove('drop-ok');
    if (paletteEl) paletteEl.classList.remove('drop-delete');
    /* 清除吸附高亮 */
    if (rootBlockEls) {
      Object.keys(rootBlockEls).forEach(function (uid) {
        var el = rootBlockEls[uid];
        if (el && el.classList) el.classList.remove('snap-target');
      });
    }
  }

  function handleDragOver(e) {
    if (!dragInfo) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragInfo.fromPalette ? 'copy' : 'move';
    /* 画布积木拖到工具箱上方：高亮提示释放即删除 */
    if (!dragInfo.fromPalette && isOverPalette(e)) {
      clearHint();
      if (paletteEl) paletteEl.classList.add('drop-delete');
      return;
    }
    var tgt = resolveTarget(e);
    clearHint();
    if (!tgt) return;
    if (tgt.kind === 'slot') { tgt.slotEl.classList.add('drop-ok'); hoverEl = tgt.slotEl; }
    else if (tgt.listEl) { tgt.listEl.classList.add('drop-ok'); hoverEl = tgt.listEl; }
    else rootEl.classList.add('drop-ok');
    /* 顶层拖动：靠近某块底部 → 高亮该块，提示吸附 */
    if ((tgt.listEl === null || tgt.listEl === rootEl) && typeof e.clientX === 'number') {
      var snapHint = findSnapTarget(e.clientX, e.clientY);
      if (snapHint) {
        var snapEl = rootBlockEls[snapHint.uid];
        if (snapEl) snapEl.classList.add('snap-target');
      }
    }
  }

  /* 按各块的垂直中线决定插入下标：指针在某个块中线之上 → 插到它前面，
   * 否则插到最后。抽成纯函数便于在 tools/smoke.js 里直接断言。
   */
  function insertIndexFromMids(mids, clientY) {
    for (var i = 0; i < mids.length; i++) {
      if (clientY < mids[i]) return i;
    }
    return mids.length;
  }

  function blockElsIn(listEl) {
    if (!listEl || !listEl.children) return [];
    return Array.prototype.filter.call(listEl.children, function (el) {
      return el.classList && el.classList.contains('blk');
    });
  }

  /* 顶层画布的 list 元素就是 #canvas 本身（listEl === null），
   * 所以必须回退到 rootEl；否则取不到任何子块 → 恒插到第 0 位，顺序就反了。
   */
  function insertionIndex(listEl, clientY) {
    var kids = blockElsIn(listEl || rootEl);
    var mids = kids.map(function (el) {
      var r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    return { idx: insertIndexFromMids(mids, clientY), kids: kids };
  }

  /* ---------- 拖到某块底部附近 → 吸附到其正下方（并接入它的执行链） ----------
   * 指针落在某块底缘 SNAP_DIST 像素内且水平重叠 → 吸附：x 对齐该块，y 紧贴其底缘，
   * 并插入到该块之后（同一执行链）。拖到无块附近则自由摆放。
   */
  var SNAP_DIST = 14;

  function findSnapTarget(x, y) {
    var best = null, bestDist = SNAP_DIST;
    rootBlockEls && Object.keys(rootBlockEls).forEach(function (uid) {
      var el = rootBlockEls[uid];
      if (!el || !el.getBoundingClientRect) return;
      var r = el.getBoundingClientRect();
      var inX = x >= r.left - 8 && x <= r.right + 8;
      var d = Math.abs(y - r.bottom);
      if (inX && d < bestDist) { bestDist = d; best = { uid: uid, x: r.left, y: r.bottom }; }
    });
    return best;
  }

  function handleDrop(e) {
    if (!dragInfo) return null;
    var placedUidOut = null;
    var tgt = resolveTarget(e);
    if (!tgt) { clearHint(); return; }
    e.preventDefault();
    e.stopPropagation();
    clearHint();

    var dragging = dragBlock();
    if (tgt.kind === 'slot') {
      var block;
      if (dragInfo.fromPalette) block = newBlock(dragInfo.op);
      else {
        var entry = registry[dragInfo.uid];
        block = entry.block;
        var keep = block;
        detach(entry);
        block = keep;
      }
      tgt.owner.block.fields[tgt.input.name] = block;
      refreshVarList();
      renderRoot();
      finishDrag();
      return;
    }

    var ins = insertionIndex(tgt.listEl, e.clientY);
    /* 顶层自由摆放：记录相对画布的像素位置，落到画布任意位置；
     * 已摆放的块再次拖动 → pos 被新位置覆盖，实现自由移动。
     * 拖到某块底部附近 → 吸附到其正下方（对齐 x，紧贴底缘），并接入它的执行链。 */
    var freePos = null;
    var snapIdx = -1;
    if (tgt.listEl === null || tgt.listEl === rootEl) {
      var cr = rootEl.getBoundingClientRect();
      var px = Math.round(e.clientX - cr.left + (rootEl.scrollLeft || 0));
      var py = Math.round(e.clientY - cr.top + (rootEl.scrollTop || 0));
      var snap = (typeof e.clientX === 'number') ? findSnapTarget(e.clientX, e.clientY) : null;
      if (snap) {
        freePos = { x: Math.round(snap.x - cr.left + (rootEl.scrollLeft || 0)), y: Math.round(snap.y - cr.top + (rootEl.scrollTop || 0)) };
        snapIdx = indexOfUid(state.root, snap.uid); // 插到吸附块之后
      } else if (isFinite(px) && isFinite(py)) {
        freePos = { x: px, y: py };
      }
    }
    if (dragInfo.fromPalette) {
      var nb = newBlock(dragInfo.op);
      if (freePos) nb.pos = freePos;
      tgt.arr.splice(snapIdx >= 0 ? snapIdx + 1 : ins.idx, 0, nb);
      placedUidOut = nb.uid;
    } else {
      var entry2 = registry[dragInfo.uid];
      var b = entry2.block;
      var oldArr = null, oldIdx = -1;
      if (entry2.container && entry2.container.kind === 'list') {
        oldArr = entry2.container.list;
        oldIdx = oldArr.indexOf(b);
      }
      /* 不能把积木拖入自身内部：只针对嵌套列表（body/else）。
       * 顶层根列表（tgt.arr === state.root）放行 —— 已摆放的积木再次拖动换位（自由移动）。 */
      var isRootList = tgt.arr === state.root;
      if (!isRootList) {
        var ownerUid = tgt.listEl && tgt.listEl.dataset ? tgt.listEl.dataset.owner : null;
        var ownerEntry = ownerUid ? registry[ownerUid] : null;
        if (!ownerEntry || ownerEntry.block === b || inDraggedSubtree(b, ownerUid)) {
          finishDrag();
          return;
        }
      }
      detach(entry2);
      var idx = snapIdx >= 0 ? snapIdx + 1 : ins.idx;
      if (oldArr === tgt.arr && oldIdx >= 0 && oldIdx < idx) idx -= 1;
      if (freePos) b.pos = freePos;
      else delete b.pos;
      tgt.arr.splice(idx, 0, b);
      placedUidOut = b.uid;
    }
    refreshVarList();
    renderRoot();
    finishDrag();
    return placedUidOut;
  }

  function inListSubtree(block, arr) {
    var hit = false;
    (arr || []).forEach(function (n) { if (n === block || inDraggedSubtree(n, block.uid)) hit = true; });
    return hit;
  }

  /* 在顶层列表中查找某 uid 的下标（供吸附插入） */
  function indexOfUid(arr, uid) {
    for (var i = 0; i < (arr || []).length; i++) { if (arr[i].uid === uid) return i; }
    return -1;
  }

  function handleDragStart(e) {
    if (dragInfo) return; // 面板自处理
    var el = e.target.closest ? e.target.closest('.blk') : null;
    if (!el || !rootEl.contains(el)) return;
    var entry = registry[el.dataset.uid];
    if (!entry) return;
    dragInfo = { fromPalette: false, uid: entry.block.uid };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', entry.block.uid);
    document.body.classList.add('dragging');
  }

  function paletteDragStart(e, op) {
    dragInfo = { fromPalette: true, op: op };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', op);
    document.body.classList.add('dragging');
    e.stopPropagation();
  }

  /* ---------- 拖入左侧选择栏删除 ----------
   * 画布内的积木拖到工具箱（palette）上释放 → 删除该积木（含下级堆叠）。
   * 从工具箱拖出创建新积木不受影响（fromPalette 的拖拽不进入此分支）。
   */
  function deleteByUid(blockUid) {
    var entry = registry[blockUid];
    if (!entry) return false;
    var inp = entry.container && entry.container.kind === 'slot'
      ? inputDefOf(GP.getDef(entry.container.parent.op), entry.container.name) : null;
    if (inp && inp.type === 'condition_block') {
      forget(entry.block);
      entry.container.parent.fields[entry.container.name] = null;
    } else {
      detach(entry); // 列表内：splice 一并移除下级堆叠（下级堆叠是 children 数组，随父块一起离开 state.root）
    }
    // 删除后：刷新变量表、重渲染画布，并触发校验（main.js 里的 onWorkspaceChange）
    refreshVarList();
    renderRoot();
    notifyChange();
    return true;
  }

  /* 状态变化通知：供 main.js 触发校验刷新 */
  var changeListeners = [];
  function notifyChange() {
    changeListeners.slice().forEach(function (fn) { fn(); });
  }

  function isOverPalette(e) {
    if (!paletteEl) return false;
    var t = e.target;
    if (!t || !t.closest) return false;
    var hit = t.closest('.palette');
    return !!hit && (paletteEl === hit || paletteEl.contains(hit));
  }

  function finishDrag() {
    dragInfo = null;
    document.body.classList.remove('dragging');
    clearHint();
    hideSnapRing();
  }

  /* ---------- 积木放置动效 ----------
   * 拖拽倾斜、跟随指针的吸附光圈、落下回弹、落点光环/波纹、连接反馈、确认浮层。
   * 只动 transform/opacity/box-shadow，60fps；prefers-reduced-motion 下全量降级。
   */
  var ringEl = null;

  function ensureRing() {
    if (ringEl || typeof document.createElement !== 'function') return ringEl;
    ringEl = document.createElement('div');
    ringEl.id = 'snap-ring';
    if (document.body && document.body.appendChild) document.body.appendChild(ringEl);
    return ringEl;
  }

  function moveRing(x, y) {
    var r = ensureRing();
    if (!r || !r.style) return;
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    if (r._classes) r._classes.add('on');
  }

  function setRingHot(hot) {
    var r = ensureRing();
    if (!r || !r._classes) return;
    if (hot) r._classes.add('hot'); else r._classes.delete('hot');
  }

  function hideSnapRing() {
    if (!ringEl || !ringEl._classes) return;
    ringEl._classes.delete('on');
    ringEl._classes.delete('hot');
  }

  /* 拖拽经过时：积木轻微倾斜 + 光圈跟随指针；靠近吸附目标时光圈变蓝变大 */
  function handleDragMove(e) {
    if (!dragInfo || typeof e.clientX !== 'number') return;
    moveRing(e.clientX, e.clientY);
    var near = (typeof findSnapTarget === 'function') ? findSnapTarget(e.clientX, e.clientY) : null;
    setRingHot(!!near);
    var dragged = dragInfo.fromPalette ? null : (registry[dragInfo.uid] && registry[dragInfo.uid].el);
    if (dragged && dragged._classes && !dragged._classes.has('drag-tilt')) dragged._classes.add('drag-tilt');
  }

  function clearDragVisuals(draggedEl) {
    if (draggedEl && draggedEl._classes) draggedEl._classes.delete('drag-tilt');
    hideSnapRing();
  }

  /* 放置瞬间：下沉回弹 + 落点光环/波纹 + 绿色确认光晕 + 轻量文字浮层；
   * 连接到已有积木时槽位/列表额外闪蓝色连线光效。 */
  function playPlaceEffects(el, x, y, note, connectedTarget) {
    if (!el || typeof document.createElement !== 'function') return;
    if (el._classes) {
      el._classes.add('drop-land');
      setTimeout(function () { if (el._classes) el._classes.delete('drop-land'); }, 900);
    }
    var canvasRect = rootEl && rootEl.getBoundingClientRect ? rootEl.getBoundingClientRect() : { left: 0, top: 0 };
    var lx = x - canvasRect.left, ly = y - canvasRect.top;
    if (rootEl && rootEl.appendChild) {
      var ripple = document.createElement('div');
      ripple.className = 'drop-ripple';
      ripple.style.left = lx + 'px';
      ripple.style.top = ly + 'px';
      rootEl.appendChild(ripple);
      setTimeout(function () { if (ripple.parentNode && ripple.parentNode.removeChild) ripple.parentNode.removeChild(ripple); }, 700);
    }
    if (note) {
      var n = document.createElement('div');
      n.className = 'place-note';
      n.textContent = note;
      n.style.left = lx + 'px';
      n.style.top = ly + 'px';
      if (rootEl && rootEl.appendChild) rootEl.appendChild(n);
      setTimeout(function () { if (n.parentNode && n.parentNode.removeChild) n.parentNode.removeChild(n); }, 950);
    }
    if (connectedTarget && connectedTarget._classes) {
      connectedTarget._classes.add('connect-flash');
      setTimeout(function () { if (connectedTarget._classes) connectedTarget._classes.delete('connect-flash'); }, 600);
    }
  }

  /* ---------- 导入 / 导出辅助 ---------- */
  function loadSpec(spec) {
    if (!spec || !Array.isArray(spec.program)) throw new Error('program 字段必须是数组');
    state.root = [];
    state.seq = 0;
    var seenVars = Object.keys(spec.variables || {});
    /* program 的每一项都是一条以事件积木开头的 next 链，
     * 展平成 state.root 的线序（事件积木自然分隔出多条链）。
     */
    spec.program.forEach(function (node) { importChain(node, state.root); });
    refreshVarList();
    seenVars.forEach(function (v) { if (state.variables.indexOf(v) < 0) state.variables.push(v); });
    renderRoot();
  }

  /* 沿 next 链展开成数组；带环保护，避免恶意/损坏的 JSON 卡死页面 */
  function importChain(node, out) {
    var guard = 0;
    var cur = node;
    while (cur) {
      if (++guard > MAX_IMPORT_DEPTH) throw new Error('next 链过深或存在环，已停止导入');
      out.push(importNode(cur));
      cur = cur.next;
    }
    return out;
  }

  var MAX_IMPORT_DEPTH = 5000;

  function importNode(node) {
    if (!node || typeof node.opcode !== 'string') throw new Error('节点缺少 opcode');
    var def = GP.getDef(node.opcode);
    if (!def) throw new Error('未知 opcode: ' + node.opcode);
    var b = { uid: uid(), op: node.opcode, fields: {}, children: { body: [], else: [] } };
    (def.inputs || []).forEach(function (inp) {
      var v = node.inputs ? node.inputs[inp.name] : undefined;
      /* 内联的条件/运算/值积木：原样递归还原（保留其自身的 inputs 嵌套） */
      if (v && typeof v === 'object' && typeof v.opcode === 'string') b.fields[inp.name] = importNode(v);
      else b.fields[inp.name] = v === undefined ? (inp.type === 'condition_block' ? null : inp.default) : v;
    });
    importChainArray(node.body, b.children.body);
    importChainArray(node.else, b.children.else);
    return b;
  }

  function importChainArray(src, out) {
    (src || []).forEach(function (n) { importChain(n, out); });
  }

  /* ---------- 面板：事件积木数量上限 ----------
   * 顶层事件块只允许 when_start / when_true，总数最多 2（任意组合）。
   * 超限时阻止从工具箱拖出 / 双击追加，并给出中文提示。
   */
  var MAX_EVENT_BLOCKS = 2;
  var EVENT_LIMIT_MSG = '事件积木最多 2 个（当开始被点击 / 当条件为真可任意组合），请先删除一个再添加';

  function countHats() {
    var n = 0;
    function isHat(b) { var d = GP.getDef(b.op); return !!d && d.kind === 'hat'; }
    function walk(arr) {
      (arr || []).forEach(function (b) {
        if (isHat(b)) n++;
        (b.children.body || []).forEach(function (c) { if (isHat(c)) n++; });
        (b.children.else || []).forEach(function (c) { if (isHat(c)) n++; });
      });
    }
    walk(state.root);
    return n;
  }

  function hatLimitReached() { return countHats() >= MAX_EVENT_BLOCKS; }

  /* ---------- 面板：四分页 ----------
   * 事件 / 控制 / 设备 / 值·变量。41 个 opcode 全部可达，页内保留二级分组标题。
   * 分页与校验、生成逻辑解耦：只影响面板渲染，不碰 state / toSpec / JSON。
   */
  var PAL_PAGES = [
    {
      id: 'event', name: '事件', cats: ['event'],
      hint: '事件积木 1-2 个，各开一条执行链；拖到画布任意位置'
    },
    {
      id: 'control', name: '控制', cats: ['control'],
      hint: '等待、循环、条件分支与退出循环'
    },
    {
      id: 'device', name: '设备', cats: ['device_lock', 'device_tens', 'device_enema', 'device_vibe_a', 'device_vibe_b'],
      hint: '蓝牙外设指令：智能锁 / 电击器 / 灌肠机 / 跳蛋 / 榨精机'
    },
    {
      id: 'operator', name: '运算', cats: ['operator'],
      hint: '数学运算与比较判断，返回数字或真假'
    },
    {
      id: 'value', name: '值/变量', cats: ['value'],
      hint: '变量、当前时间与设备状态读取'
    }
  ];
  var PAL_PAGE_KEY = 'gp-palette-page';

  function storedPage() {
    try {
      var v = localStorage.getItem(PAL_PAGE_KEY);
      for (var i = 0; i < PAL_PAGES.length; i++) { if (PAL_PAGES[i].id === v) return v; }
    } catch (e) { /* localStorage 不可用：静默降级为默认页 */ }
    return PAL_PAGES[0].id;
  }

  function savePage(id) {
    try { localStorage.setItem(PAL_PAGE_KEY, id); } catch (e) { /* 静默降级 */ }
  }

  var currentPage = null;

  function makePaletteBlock(def) {
    var el = renderBlock(newBlock(def.op), null);
    el.classList.add('palette-blk');
    el.draggable = true;
    el.title = def.op + ' — 拖到画布，或双击追加';
    el.addEventListener('dragstart', function (e) {
      if (GP.isHat(def.op) && hatLimitReached()) {
        toast(EVENT_LIMIT_MSG);
        e.preventDefault();
        finishDrag();
        return;
      }
      paletteDragStart(e, def.op);
    });
    el.addEventListener('dragend', finishDrag);
    el.addEventListener('dblclick', function () { addToRoot(def.op); });
    return el;
  }

  function renderPaletteTabs(tabsEl) {
    tabsEl.innerHTML = '';
    PAL_PAGES.forEach(function (page) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pal-tab' + (page.id === currentPage ? ' active' : '');
      b.dataset.page = page.id;
      b.setAttribute('aria-selected', page.id === currentPage ? 'true' : 'false');
      b.textContent = page.name;
      b.title = page.hint;
      b.addEventListener('click', function () { switchPage(page.id); });
      tabsEl.appendChild(b);
    });
  }

  /* 每页独立容器：切换分页只切 hidden 类，积木始终可达（页面内独立滚动） */
  function renderPalettePage(page) {
    var bodyEl = document.createElement('div');
    bodyEl.className = 'pal-body' + (page.id === currentPage ? '' : ' hidden');
    bodyEl.dataset.page = page.id;
    page.cats.forEach(function (catId) {
      var defs = GP.defsByCat(catId);
      if (!defs.length) return;
      var group = document.createElement('div');
      group.className = 'pal-group';
      var h = document.createElement('div');
      h.className = 'pal-title cat-' + catId;
      h.textContent = GP.CAT_MAP[catId] ? GP.CAT_MAP[catId].name : catId;
      group.appendChild(h);
      defs.forEach(function (def) { group.appendChild(makePaletteBlock(def)); });
      bodyEl.appendChild(group);
    });
    var hint = document.createElement('div');
    hint.className = 'pal-hint';
    hint.textContent = page.hint;
    bodyEl.appendChild(hint);
    return bodyEl;
  }

  function switchPage(id) {
    if (id === currentPage) return; // 切换分页本身不触发任何删除/重建
    currentPage = id;
    savePage(id);
    renderPaletteTabs(paletteTabsEl);
    var kids = paletteBodyEl ? paletteBodyEl.children : [];
    Array.prototype.forEach.call(kids, function (body) {
      body.classList.toggle('hidden', body.dataset.page !== id);
    });
  }

  var paletteTabsEl = null, paletteBodyEl = null;

  function renderPalette() {
    currentPage = storedPage();
    paletteEl.innerHTML = '';
    paletteTabsEl = document.createElement('div');
    paletteTabsEl.className = 'pal-tabs';
    paletteTabsEl.setAttribute('role', 'tablist');
    paletteEl.appendChild(paletteTabsEl);
    paletteBodyEl = document.createElement('div');
    paletteBodyEl.className = 'pal-pages';
    paletteEl.appendChild(paletteBodyEl);
    renderPaletteTabs(paletteTabsEl);
    PAL_PAGES.forEach(function (p) { paletteBodyEl.appendChild(renderPalettePage(p)); });
  }

  function addToRoot(op) {
    var b = newBlock(op);
    if (GP.isReporter(op)) {
      toast('运算/判断积木需要拖到插槽中');
      return;
    }
    if (GP.isHat(op) && hatLimitReached()) {
      toast(EVENT_LIMIT_MSG);
      return;
    }
    state.root.push(b);
    refreshVarList();
    renderRoot();
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t.__timer);
    t.__timer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  /* ---------- 初始化 ---------- */
  function init(opts) {
    rootEl = opts.rootEl;
    paletteEl = opts.paletteEl;
    renderPalette();
    renderRoot();

    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragover', function (e) {
      if (!dragInfo) return;
      handleDragMove(e); // 光圈跟随指针 + 拖拽倾斜 + 预吸附状态
      if (rootEl.contains(e.target) || e.target === rootEl) handleDragOver(e);
      else if (!dragInfo.fromPalette && isOverPalette(e)) {
        /* 拖到工具箱上方：允许 drop，高亮提示删除 */
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        handleDragOver(e);
      }
      else { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; }
    });
    document.addEventListener('drop', function (e) {
      if (!dragInfo) return;
      /* 画布积木拖到工具箱上释放 → 删除该积木（含下级堆叠） */
      if (!dragInfo.fromPalette && isOverPalette(e)) {
        e.preventDefault();
        var removed = deleteByUid(dragInfo.uid);
        if (removed) toast('已删除积木（含其下级堆叠）');
        finishDrag();
        return;
      }
      if (!rootEl.contains(e.target) && e.target !== rootEl) { e.preventDefault(); finishDrag(); return; }
      /* 记录释放坐标，供放置动效（回弹/光环/浮层）定位 */
      var dropX = e.clientX, dropY = e.clientY;
      var snapUid = null;
      if (typeof findSnapTarget === 'function') {
        var st = findSnapTarget(dropX, dropY);
        if (st) snapUid = st.uid;
      }
      var placedUid = handleDrop(e);
      /* 放置完成：找到新位置的元素，播放动效 */
      var placedEl = (placedUid && rootBlockEls[placedUid]) ? rootBlockEls[placedUid] : null;
      if (placedEl) {
        var connected = null;
        if (snapUid && snapUid !== placedUid && rootBlockEls[snapUid]) connected = rootBlockEls[snapUid];
        playPlaceEffects(placedEl, dropX, dropY, connected ? '已连接' : '已放置', connected);
      }
    });
    document.addEventListener('dragend', finishDrag);

    return {
      state: state,
      render: function () { refreshVarList(); renderRoot(); notifyChange(); },
      clear: function () { state.root = []; state.seq = 0; renderRoot(); notifyChange(); },
      loadSpec: loadSpec,
      addToRoot: addToRoot,
      onChange: function (fn) { if (typeof fn === 'function') changeListeners.push(fn); }
    };
  }

  root.GPWorkspace = {
    init: init,
    newBlock: newBlock,
    toast: toast,
    /* 供自检使用：插入位置只依赖「各块中线 + 指针 Y」，不依赖 DOM */
    insertIndexFromMids: insertIndexFromMids,
    /* 供自检使用：纯数据转换，不触 DOM */
    importSpec: function (spec) {
      var out = [];
      (spec.program || []).forEach(function (n) { importChain(n, out); });
      return out;
    },
    /* 供自检使用：事件积木数量上限与删除 */
    hatLimitReached: function () { return hatLimitReached(); },
    countHats: countHats,
    deleteByUid: function (uid) { return deleteByUid(uid); },
    MAX_EVENT_BLOCKS: MAX_EVENT_BLOCKS
  };
})(typeof window !== 'undefined' ? window : globalThis);
