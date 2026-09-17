/* theme.js — 外观模式：跟随系统 / 浅色 / 深色
 * 模式存 localStorage('gp-theme')，实际主题写到 <html data-theme="dark|light">
 * （index.html 头部内联脚本已提前设置，避免首屏闪烁）。
 */
(function () {
  'use strict';

  var KEY = 'gp-theme';
  var MODES = ['system', 'light', 'dark'];
  var LABEL = { system: '跟随系统', light: '浅色', dark: '深色' };
  var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return MODES.indexOf(v) >= 0 ? v : 'system';
    } catch (e) { return 'system'; }
  }

  function effective(mode) {
    if (mode === 'dark') return 'dark';
    if (mode === 'light') return 'light';
    return (mql && mql.matches) ? 'dark' : 'light';
  }

  function apply(mode) {
    var root = document.documentElement;
    var eff = effective(mode);
    root.setAttribute('data-theme', eff);
    root.setAttribute('data-theme-mode', mode);

    var sw = document.getElementById('theme-switch');
    if (sw) {
      Array.prototype.forEach.call(sw.querySelectorAll('button[data-mode]'), function (b) {
        var on = b.dataset.mode === mode;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    var tag = document.getElementById('theme-label');
    if (tag) tag.textContent = LABEL[eff];
    return eff;
  }

  function set(mode) {
    if (MODES.indexOf(mode) < 0) mode = 'system';
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    return apply(mode);
  }

  /* 系统主题变化：仅在「跟随系统」时实时切换 */
  function onSystemChange() { if (stored() === 'system') apply('system'); }
  if (mql) {
    if (mql.addEventListener) mql.addEventListener('change', onSystemChange);
    else if (mql.addListener) mql.addListener(onSystemChange);
  }

  /* 多标签页同步 */
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) apply(stored());
  });

  document.addEventListener('DOMContentLoaded', function () {
    var sw = document.getElementById('theme-switch');
    if (sw) {
      sw.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button[data-mode]') : null;
        if (b) set(b.dataset.mode);
      });
    }
    apply(stored());
  });

  window.GPTheme = { get: stored, set: set, apply: apply, effective: effective };
})();
