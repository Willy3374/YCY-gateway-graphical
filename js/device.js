/* device.js — 右侧连接状态栏
 * 当前为占位实现：固定显示「未连接到设备」。
 * 后续接入 rk3308 网关时，只需调用 GPDevice.setState(...) / setDevices(...)，
 * 或在 GPDevice.init({ probe: fn }) 里传入探活函数（返回 Promise）。
 */
(function (root) {
  'use strict';

  var STATES = {
    disconnected: { label: '离线', badge: '离线', title: '未连接到设备', sub: '等待网关连接' },
    connecting:   { label: '连接中', badge: '连接中', title: '正在连接…', sub: '正在探测网关' },
    connected:    { label: '在线', badge: '在线', title: '已连接', sub: '' },
    error:        { label: '异常', badge: '异常', title: '连接异常', sub: '请检查网关与网络' }
  };

  var els = {};
  var current = 'disconnected';
  var currentSub = '';
  var probe = null;
  var pollTimer = null;
  var origTitle = null;

  function $(id) { return document.getElementById(id); }

  function render() {
    var cfg = STATES[current] || STATES.disconnected;
    if (els.badge) {
      els.badge.textContent = cfg.badge;
      els.badge.dataset.state = current;
    }
    if (els.status) els.status.dataset.state = current;
    if (els.title) els.title.textContent = currentSub || cfg.title;
    if (els.sub) {
      var sub = cfg.sub;
      els.sub.textContent = sub;
      els.sub.style.display = sub ? '' : 'none';
    }
    if (document.title) {
      // 标签页标题同步连接态，便于多标签时一眼看出
      if (!origTitle) origTitle = document.title.replace(/^●\s*/, '');
      document.title = (current === 'connected' ? '' : '● ') + origTitle;
    }
  }

  function setState(state, subText) {
    current = STATES[state] ? state : 'disconnected';
    currentSub = subText || '';
    render();
  }

  function setDevices(list) {
    if (!els.list) return;
    var items = (list || []).filter(Boolean);
    if (!items.length) {
      els.list.innerHTML = '<li class="device-empty">暂无设备</li>';
      return;
    }
    els.list.innerHTML = items.map(function (d) {
      var name = escapeHtml(d.name || d.id || '未知设备');
      var meta = escapeHtml(d.meta || d.type || '');
      return '<li class="device-item">' +
        '<span class="device-item-dot" data-online="' + (d.online ? '1' : '0') + '"></span>' +
        '<span class="device-item-main"><b>' + name + '</b>' +
        (meta ? '<small>' + meta + '</small>' : '') + '</span>' +
        '</li>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 探活：传了 probe 才轮询，否则保持占位 */
  function probeOnce() {
    if (typeof probe !== 'function') return Promise.resolve();
    return Promise.resolve()
      .then(probe)
      .then(function (res) {
        if (res && res.connected) {
          setState('connected', res.title || '');
          setDevices(res.devices || []);
        } else {
          setState('disconnected');
          setDevices([]);
        }
      })
      .catch(function () {
        setState('error');
        setDevices([]);
      });
  }

  /* 刷新按钮只绑一次：probe 是模块级变量，处理函数读到的始终是最新值。
   * 否则每次 init 都会再叠一个监听，点一下会触发多轮探活。
   */
  var refreshBound = false;

  function onRefreshClick() {
    if (typeof probe !== 'function') {
      if (root.GPWorkspace && root.GPWorkspace.toast) root.GPWorkspace.toast('未连接到设备');
      return;
    }
    setState('connecting');
    probeOnce();
  }

  function init(opts) {
    opts = opts || {};
    els.badge = $('device-badge');
    els.status = $('device-status');
    els.title = $('device-status-title');
    els.sub = $('device-status-sub');
    els.list = $('device-list');

    probe = opts.probe || null;
    setState('disconnected');
    setDevices([]);

    var btn = $('btn-device-refresh');
    if (btn && !refreshBound) {
      btn.addEventListener('click', onRefreshClick);
      refreshBound = true;
    }

    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (typeof probe === 'function' && opts.pollMs) {
      probeOnce();
      pollTimer = setInterval(probeOnce, opts.pollMs);
    }
    return api;
  }

  var api = {
    init: init,
    setState: setState,
    setDevices: setDevices,
    getState: function () { return current; },
    STATES: STATES
  };

  root.GPDevice = api;
})(typeof window !== 'undefined' ? window : globalThis);
