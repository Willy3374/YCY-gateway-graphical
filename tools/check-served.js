/* check-served.js — 校验服务器实际返回的页面包含本轮改动 */
const BASE = process.env.GP_BASE || 'http://127.0.0.1:4317';

(async () => {
  let bad = 0;
  const check = (name, ok) => {
    if (!ok) bad++;
    console.log((ok ? 'OK   ' : 'MISS ') + name);
  };

  const r = await fetch(BASE + '/');
  const h = await r.text();
  console.log('GET /  ' + r.status + '  ' + h.length + ' bytes');
  check('顶部菜单已无「执行」字样', h.indexOf('执行') < 0);
  check('包含「生成 ▶」按钮', h.indexOf('生成 ▶') >= 0);
  check('包含「开始」按钮', h.indexOf('id="btn-start"') >= 0);
  check('「开始」在「生成」右侧', h.indexOf('id="btn-start"') > h.indexOf('id="btn-run"'));
  check('开始弹窗含「未连接到网关」占位', h.indexOf('未连接到网关') >= 0);
  check('开始弹窗容器存在', h.indexOf('id="start-overlay"') >= 0);

  const j = await fetch(BASE + '/js/main.js');
  const t = await j.text();
  console.log('GET /js/main.js  ' + j.status + '  ' + t.length + ' bytes');
  check('main.js 含 openStartDialog', t.indexOf('openStartDialog') >= 0);
  check('main.js 绑定了 btn-start', t.indexOf("'btn-start'") >= 0);

  const d = await fetch(BASE + '/css/style.css');
  const c = await d.text();
  check('style.css 含 .btn.go 样式', c.indexOf('.btn.go') >= 0);

  console.log(bad ? '\n' + bad + ' 项不符' : '\n全部符合');
  if (bad) process.exitCode = 1;
})();
