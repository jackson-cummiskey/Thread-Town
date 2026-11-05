// Tiny static server for local preview. No dependencies.
// Run: node serve.js  (then open http://localhost:4173)
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = process.env.PORT || 4173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

http.createServer((req, res) => {
  // Dev helper: POST /snap?name=x with a data URL body saves snaps/x.jpg (used for headless visual checks).
  if (req.method === 'POST' && req.url.startsWith('/snap')) {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', () => {
      const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'snap').replace(/[^a-z0-9_-]/gi, '');
      const m = body.match(/^data:image\/(png|jpeg);base64,(.*)$/s);
      if (!m) { res.writeHead(400); return res.end('bad body'); }
      fs.mkdirSync(path.join(root, 'snaps'), { recursive: true });
      const file = path.join(root, 'snaps', name + (m[1] === 'png' ? '.png' : '.jpg'));
      fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(file);
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`Thread Town at http://localhost:${port}`));
