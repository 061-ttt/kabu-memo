// 端末保存版を GitHub Pages と同じくサブパス（/kabu-memo/）で配信する静的サーバー
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.LOCAL_PORT || 4317);
const ROOT = join(process.cwd(), 'dist-local');
const BASE = '/kabu-memo/';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/health') return res.end('ok');
  if (url.pathname === '/kabu-memo') {
    res.writeHead(301, { location: BASE });
    return res.end();
  }
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(404);
    return res.end('not found');
  }
  let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html';
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`local build on ${PORT}${BASE}`));
