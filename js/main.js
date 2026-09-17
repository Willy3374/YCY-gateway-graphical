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
   * 目前为占位：未连接时弹「未连接到网关」，连接后弹已下发提示。
   * 接入网关时把 send() 里的 TODO 换成真实下发接口即可。
   */
  function openStartDialog() {
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

  /* ---------- 执行：生成 → 弹命名窗 → 确认后保存 ---------- */
  function run() {
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

  function showOutput(text, warnings, spec) {
    outEl.textContent = text;
    renderInfo(warnings, spec);
    overlay.classList.add('open');
  }

  function renderInfo(warnings, spec) {
    var items = (warnings || []).slice();
    items.push('入口 ' + spec.program.length + ' 条 · 变量 ' + Object.keys(spec.variables).length + ' 个');
    warnEl.innerHTML = items.map(function (t) { return '<li>' + t + '</li>'; }).join('');
  }

  /* ---------- 校验 ---------- */
  function validate() {
    var res;
    try {
      res = GP.toSpec(ws.state);
    } catch (err) {
      window.GPWorkspace.toast('校验失败: ' + err.message);
      return;
    }
    var msgs = ['✔ 结构合法，可导出 JSON'];
    if (!res.spec.program.length) msgs.push('⚠ 画布为空');
    var bad = res.spec.program.filter(function (n) { return !GP.isHat(n.opcode); });
    if (bad.length) msgs.push('⚠ 有 ' + bad.length + ' 条顶层链没有以事件积木开头');
    if (res.warnings.length) msgs.push('⚠ ' + res.warnings.length + ' 处占位/缺省已自动填充（见输出面板）');
    window.GPWorkspace.toast(msgs[0]);
    msgs.forEach(function (m) { console.log('[validate]', m); });
    lastSpec = res;
    showOutput(JSON.stringify(res.spec, null, 2), res.warnings, res.spec);
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
