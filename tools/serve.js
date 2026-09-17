/* serve.js — 零依赖静态服务器 + 保存接口
 * 静态：提供 index.html 同目录下的站点资源
 * 保存：POST /api/save  { name, content } → 写入 index.html 同目录（默认 saves/ 子目录可配）
 * 用法: node tools/serve.js [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || process.env.PORT || 4317);

/* 产物目录：与 index.html 同级，便于 RK3308 网关直接读取 */
const OUT_DIR = process.env.GP_OUT_DIR ? path.resolve(process.env.GP_OUT_DIR) : root;
const MAX_BODY = 4 * 1024 * 1024; // 4MB 上限，防止异常大包

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'content-type': type || 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(body);
}

function json(res, code, obj) { send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8'); }

/* 文件名清洗：去掉路径分隔符、控制字符、.. 与保留名，只允许安全字符 */
function safeName(raw) {
  let s = String(raw == null ? '' : raw);
  s = s.replace(/\0/g, '');
  s = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '');
  s = s.replace(/\.\.+/g, '.');
  s = s.replace(/^[.\s]+/, '');
  s = s.trim();
  if (s && !/\.json$/i.test(s)) s += '.json';
  if (!s || s === '.json') return '';
  // Windows 保留名
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(s)) return '';
  return s.slice(0, 128);
}

function handleSave(req, res) {
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) {
      json(res, 413, { ok: false, error: '内容过大（上限 4MB）' });
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (e) {
      return json(res, 400, { ok: false, error: '请求体不是合法 JSON' });
    }
    const name = safeName(payload && payload.name);
    if (!name) return json(res, 400, { ok: false, error: '文件名不合法' });
    if (typeof payload.content !== 'string' || !payload.content.trim()) {
      return json(res, 400, { ok: false, error: '内容为空' });
    }

    const target = path.join(OUT_DIR, name);
    // 双保险：解析后必须仍在输出目录内
    if (path.dirname(path.resolve(target)) !== path.resolve(OUT_DIR)) {
      return json(res, 403, { ok: false, error: '目标路径越界' });
    }

    fs.writeFile(target, payload.content, 'utf8', (err) => {
      if (err) return json(res, 500, { ok: false, error: err.message });
      const rel = path.relative(root, target).split(path.sep).join('/');
      console.log('[save] ' + rel + '  (' + Buffer.byteLength(payload.content, 'utf8') + ' bytes)');
      json(res, 200, { ok: true, name: name, path: rel });
    });
  });
}

http.createServer((req, res) => {
  const rawUrl = req.url || '/';
  const urlPath = decodeURIComponent(rawUrl.split('?')[0]);

  /* ---- 保存接口 ---- */
  if (urlPath === '/api/save') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: '请使用 POST' });
    return handleSave(req, res);
  }

  /* ---- 已保存产物列表（便于页面/网关查看） ---- */
  if (urlPath === '/api/list' && req.method === 'GET') {
    fs.readdir(OUT_DIR, (err, files) => {
      if (err) return json(res, 500, { ok: false, error: err.message });
      const items = files.filter((f) => /\.json$/i.test(f)).map((f) => {
        let size = 0, mtime = 0;
        try { const st = fs.statSync(path.join(OUT_DIR, f)); size = st.size; mtime = st.mtimeMs; } catch (e) {}
        return { name: f, size: size, mtime: mtime };
      }).sort((a, b) => b.mtime - a.mtime);
      json(res, 200, { ok: true, items: items });
    });
    return;
  }

  /* ---- 静态资源 ---- */
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { ok: false, error: '不支持的请求方法' });
  }
  const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (file !== root && !file.startsWith(root + path.sep)) {
    return send(res, 403, 'forbidden', 'text/plain; charset=utf-8');
  }
  fs.stat(file, (err, st) => {
    if (err || st.isDirectory()) return send(res, 404, '404', 'text/plain; charset=utf-8');
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, () => {
  console.log('graphical editor on http://127.0.0.1:' + port);
  console.log('保存目录: ' + OUT_DIR);
});
