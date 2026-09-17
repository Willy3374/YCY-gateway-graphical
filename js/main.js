/* main.js — 页面装配：工具栏、命名保存、JSON 输出、示例与校验 */
(function () {
  'use strict';
  var GP = window.GP;
  var ws = null;
  var outEl, overlay, warnEl, saveOverlay, nameInput, startOverlay;
  var lastSpec = null;   // 最近一次生成的结果，供保存使用

  function $(id) { return document.getElementById(id); }

  function boot() {
    ws = window.GPWorkspace.init({ rootEl: $('canvas'), paletteEl: $('palette') });
    outEl = $('json-out');
    overlay = $('overlay');
    warnEl = $('warnings');
    saveOverlay = $('save-overlay');
    nameInput = $('save-name');

    $('btn-run').addEventListener('click', run);
    $('btn-clear').addEventListener('click', function () {
      ws.clear();
      window.GPWorkspace.toast('已清空画布');
    });
    $('btn-copy').addEventListener('click', copyJSON);
    $('btn-download').addEventListener('click', downloadJSON);
    $('btn-close').addEventListener('click', function () { overlay.classList.remove('open'); });
    $('btn-example').addEventListener('click', loadExample);
    $('btn-validate').addEventListener('click', validate);
    $('file-in').addEventListener('change', onFile);
    $('btn-save-ok').addEventListener('click', confirmSave);
    $('btn-save-cancel').addEventListener('click', function () { saveOverlay.classList.remove('open'); });
    startOverlay = $('start-overlay');
    $('btn-start').addEventListener('click', openStartDialog);
    $('btn-start-close').addEventListener('click', function () { startOverlay.classList.remove('open'); });
    startOverlay.addEventListener('click', function (e) {
      if (e.target === startOverlay) startOverlay.classList.remove('open');
    });
    initDevice();
    /* 画布变化后自动静默校验（拖拽删除 / 新增 / 清空后同步刷新提示） */
    ws.onChange(function () { runValidation(true); });
    nameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); confirmSave(); }
    });
    bindTheme();

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.classList.remove('open');
    });
    saveOverlay.addEventListener('click', function (e) {
      if (e.target === saveOverlay) saveOverlay.classList.remove('open');
    });
  }

  /* ---------- 「开始」：下发程序到网关
   * 校验失败时阻止下发并提示；未连接时弹「未连接到网关」。
   */
  function openStartDialog() {
    var check = runValidation(false);
    if (!check.ok) return; // 校验失败：阻止下发
    var state = window.GPDevice ? window.GPDevice.getState() : 'disconnected';
    var notice = $('start-notice');
    var text = $('start-notice-text');
    var hint = $('start-hint');

    var MAP = {
      disconnected: ['未连接到网关', '请先在右侧确认连接状态，连接后即可下发程序。'],
      connecting: ['正在连接网关…', '连接完成后可再次点击「开始」。'],
      error: ['网关连接异常', '请检查网关与网络后重试。'],
      connected: ['已连接到网关', '程序将下发到已连接的设备。']
    };
    var item = MAP[state] || MAP.disconnected;
    text.textContent = item[0];
    hint.textContent = item[1];
    notice.dataset.state = state;
    startOverlay.classList.add('open');
  }

  /* ---------- 右侧连接状态栏 ----------
   * 目前为占位：没有 probe 时固定显示「未连接到设备」。
   * 接入网关时传入 probe（返回 { connected, devices, title }）并设置轮询间隔即可。
   */
  function initDevice() {
    if (!window.GPDevice) return;
    window.GPDevice.init({
      // probe: null,   // 预留：后续接入 rk3308 网关探活
      // pollMs: 5000
    });
  }

  /* ---------- 外观切换提示（实际主题应用由 js/theme.js 负责） ---------- */
  function bindTheme() {
    var sw = $('theme-switch');
    if (!sw || !window.GPTheme) return;
    sw.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-mode]') : null;
      if (!b) return;
      var mode = b.dataset.mode;
      var eff = mode === 'system'
        ? ('跟随系统 · 当前' + (window.GPTheme.effective('system') === 'dark' ? '深色' : '浅色'))
        : (mode === 'dark' ? '深色外观' : '浅色外观');
      window.GPWorkspace.toast('外观：' + eff);
    });
  }

  /* ---------- 命名：默认 = 当前时间（年月日时分） ---------- */
  function defaultName(d) {
    d = d || new Date();
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + p2(d.getHours()) + p2(d.getMinutes());
  }

  /* ---------- 执行：校验 → 生成 → 弹命名窗 → 确认后保存 ----------
   * 校验失败时阻止生成并给出可定位的中文提示。
   */
  function run() {
    var check = runValidation(false);
    if (!check.ok) return; // 校验失败：阻止生成
    var res;
    try {
      res = GP.toSpec(ws.state);
    } catch (err) {
      window.GPWorkspace.toast('生成失败: ' + err.message);
      return;
    }
    lastSpec = res;
    openSaveDialog();
  }

  function openSaveDialog() {
    var now = new Date();
    var name = defaultName(now);
    nameInput.value = name;
    $('save-hint').textContent = '保存到网关 · ' + name + '.json';
    saveOverlay.classList.add('open');
    setTimeout(function () { nameInput.focus(); nameInput.select(); }, 30);
  }

  function confirmSave() {
    var raw = (nameInput.value || '').trim() || defaultName();
    var safe = sanitizeName(raw);
    if (!safe) {
      window.GPWorkspace.toast('文件名不合法，请换一个');
      return;
    }
    if (!lastSpec) { window.GPWorkspace.toast('没有可保存的内容，请先执行'); return; }

    var text = JSON.stringify(lastSpec.spec, null, 2);
    saveOverlay.classList.remove('open');
    showOutput(text, lastSpec.warnings, lastSpec.spec);

    // 落盘：优先写服务器（真实写入 index.html 同目录）
    saveFile(safe + '.json', text).then(function (res) {
      if (res.mode === 'server') {
        window.GPWorkspace.toast('已保存到同目录：' + res.name);
      } else if (res.mode === 'picker') {
        window.GPWorkspace.toast('已保存：' + (res.name || safe + '.json'));
      } else if (res.mode === 'download') {
        window.GPWorkspace.toast('已下载 ' + safe + '.json（当前环境不支持直接写入同目录）');
      }
    }).catch(function (err) {
      // 服务器写入失败 → 退回下载，保证用户拿到文件
      downloadText(safe + '.json', text);
      window.GPWorkspace.toast('写入同目录失败（' + err.message + '），已改为下载');
    });
  }

  /* 只保留安全字符，去掉路径分隔符与 .. ，防止越权写入 */
  function sanitizeName(name) {
    var s = String(name).replace(/[\\/:*?"<>|]/g, '').replace(/\.\.+/g, '.').replace(/^\.+/, '').trim();
    s = s.replace(/\.json$/i, '');
    if (!s) return '';
    return s.slice(0, 120);
  }

  function saveFile(filename, text) {
    // 1) 本地服务器接口：真正写入 index.html 同目录（部署到网关后同样可用）
    return fetch('/api/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: filename, content: text })
    }).then(function (r) {
      if (r.ok) {
        return r.json().then(function (j) { return { mode: 'server', name: j.name, path: j.path }; });
      }
      // 服务器明确报错（如文件名非法）→ 抛出让上层提示
      return r.json().catch(function () { return {}; }).then(function (j) {
        throw new Error(j.error || ('HTTP ' + r.status));
      });
    }, function () {
      // fetch 本身失败（file:// 打开、无服务器）→ 走浏览器兜底
      return browserFallback(filename, text);
    });
  }

  function browserFallback(filename, text) {
    if (window.showSaveFilePicker) {
      return window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
      }).then(function (handle) {
        return handle.createWritable().then(function (w) {
          return w.write(text).then(function () { return w.close(); });
        }).then(function () { return { mode: 'picker', name: handle.name }; });
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return { mode: 'picker', name: '' };
        downloadText(filename, text);
        return { mode: 'download', name: filename };
      });
    }
    downloadText(filename, text);
    return Promise.resolve({ mode: 'download', name: filename });
  }

  function downloadText(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- 错误弹层：校验未通过时不生成 JSON，只展示红色错误信息 ---------- */
  function showErrorPanel(errors) {
    var items = (errors || []).map(function (e) { return e.msg; });
    if (!items.length) items.push('未知校验错误');
    renderErrors(items);
    overlay.classList.add('open');
  }

  function renderErrors(errors) {
    var head = overlay.querySelector('.modal-title');
    if (head) {
      head.dataset.state = 'error';
      var title = head.textContent || '校验未通过';
      if (title.indexOf('校验未通过') < 0) head.textContent = '校验未通过';
    }
    warnEl.innerHTML = errors.map(function (t) {
      return '<li class="err-item">✘ ' + t + '</li>';
    }).join('');
    outEl.textContent = ''; // 不生成 JSON
    var copyBtn = $('btn-copy'), dlBtn = $('btn-download');
    if (copyBtn) copyBtn.disabled = true;
    if (dlBtn) dlBtn.disabled = true;
  }

  function showOutput(text, warnings, spec) {
    var head = overlay.querySelector('.modal-title');
    if (head) head.dataset.state = 'ok';
    var copyBtn = $('btn-copy'), dlBtn = $('btn-download');
    if (copyBtn) copyBtn.disabled = false;
    if (dlBtn) dlBtn.disabled = false;
    outEl.textContent = text;
    renderInfo(warnings, spec);
    overlay.classList.add('open');
  }

  function renderInfo(warnings, spec) {
    var items = (warnings || []).slice();
    items.push('入口 ' + spec.program.length + ' 条 · 变量 ' + Object.keys(spec.variables).length + ' 个');
    warnEl.innerHTML = items.map(function (t) { return '<li>' + t + '</li>'; }).join('');
  }

  /* ---------- 校验 ----------
   * 必要校验全部通过才允许生成 / 开始；失败时 toast 首个错误并展示全部错误。
   * 校验规则见 js/engine.js 的 GP.validate（事件数量 / 顶层孤立 / 条件非空 /
   * 槽位类型 / opcode 合法 / 数学定义域）。
   */
  function runValidation(silent) {
    if (!window.GP || typeof window.GP.validate !== 'function') return { ok: true, errors: [] };
    var res = window.GP.validate(ws.state);
    if (!res.ok && !silent) {
      var first = res.errors[0];
      window.GPWorkspace.toast('校验未通过：' + (first ? first.msg : '未知错误'));
      console.log('[validate] 共 ' + res.errors.length + ' 个错误：');
      res.errors.forEach(function (e) { console.log('  - [' + e.code + '] ' + e.msg); });
    }
    return res;
  }

  /* ---------- 校验 ---------- */
  function validate() {
    var res = runValidation(false);
    /* 校验未通过：不生成 JSON，只弹出红色错误信息 */
    if (!res.ok) {
      showErrorPanel(res.errors);
      return;
    }
    var spec;
    try {
      spec = GP.toSpec(ws.state);
    } catch (err) {
      window.GPWorkspace.toast('校验失败: ' + err.message);
      return;
    }
    lastSpec = spec;
    showOutput(JSON.stringify(spec.spec, null, 2), spec.warnings, spec.spec);
  }

  function copyJSON() {
    var text = outEl.textContent || '';
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { window.GPWorkspace.toast('JSON 已复制'); },
        function () { window.GPWorkspace.toast('复制失败，请手动选择'); }
      );
    } else {
      var r = document.createRange();
      r.selectNodeContents(outEl);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('copy');
      window.GPWorkspace.toast('JSON 已复制');
    }
  }

  function downloadJSON() {
    var text = outEl.textContent || '';
    if (!text) return;
    var name = sanitizeName(nameInput && nameInput.value ? nameInput.value : defaultName()) || defaultName();
    downloadText(name + '.json', text);
    window.GPWorkspace.toast('已下载 ' + name + '.json');
  }

  function onFile(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        ws.loadSpec(JSON.parse(fr.result));
        window.GPWorkspace.toast('已加载 ' + f.name);
      } catch (err) {
        window.GPWorkspace.toast('加载失败: ' + err.message);
      }
    };
    fr.readAsText(f);
    e.target.value = '';
  }

  /* ---------- 载入示例 ---------- */
  function loadExample() {
    var ex = GP.getExample();
    try {
      ws.loadSpec(JSON.parse(JSON.stringify(ex.spec)));
      window.GPWorkspace.toast('已载入示例：' + ex.name);
    } catch (err) {
      window.GPWorkspace.toast('示例载入失败: ' + err.message);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
