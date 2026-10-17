/* A small web server for the tests: serves this folder's parent (the Lumen site).
   With { fake: true } the AI engine file is swapped for tests/fake-webllm.js, and the real one is served at /__real/web-llm/index.js. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const ENGINE = '/vendor/web-llm-0.2.85/index.js';

export function startServer({ fake = true, port = 0 } = {}) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    let file = path.join(ROOT, p);
    if (fake && p === ENGINE) file = path.join(ROOT, 'tests/fake-webllm.js');
    if (p === '/__real/web-llm/index.js') file = path.join(ROOT, ENGINE);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(r => server.close(r)) })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startServer({ fake: process.argv.includes('--fake'), port: Number(process.env.PORT || 8000) });
  console.log('Lumen test server at ' + s.url);
}
