import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './server/db.js';
import { createApp } from './server/app.js';

// Local development: load variables from a .env file if there is one (Hostinger sets them in hPanel).
try { process.loadEnvFile(); } catch { /* no .env file */ }

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = resolve(root, 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
};

async function serveStatic(req, res, pathname) {
  let file = resolve(dist, '.' + normalize('/' + decodeURIComponent(pathname)));
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
  let info = await stat(file).catch(() => null);
  if (!info || info.isDirectory()) { file = join(dist, 'index.html'); info = await stat(file).catch(() => null); }
  if (!info) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('The site has not been built yet. Run "npm run build" first.');
  }
  const ext = extname(file);
  const hashed = file.includes(`${join(dist, 'assets')}`);
  const data = await readFile(file);
  res.writeHead(200, {
    ...SECURITY,
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}

// No top-level await: Hostinger loads this file with require(), which rejects async modules.
async function main() {
  const db = await createDb();
  const handle = createApp(db);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
      if (await handle(req, res, url)) return;
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      await serveStatic(req, res, url.pathname);
    } catch (e) {
      console.error('HTTP request error:', { method: req.method, url: req.url, message: e?.message, stack: e?.stack });
      if (!res.headersSent) {
        const isPlanner = String(req.url || '').split('?')[0] === '/api/ai/event-plan';
        if (isPlanner) {
          const body = JSON.stringify({
            error: 'planner_unavailable',
            message: 'The planner hit an unexpected server condition. Please retry.'
          });
          res.writeHead(503, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Length': Buffer.byteLength(body),
          });
          return res.end(body);
        }
        res.writeHead(500, { 'Content-Type': 'text/plain' });
      }
      res.end('Server error');
    }
  });

  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => console.log(`DJ Request Live listening on ${port} (${db.driver})`));
}

main().catch((e) => { console.error(e); process.exit(1); });
