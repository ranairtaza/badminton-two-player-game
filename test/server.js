// ========================================================
// FEATHERLINE - LIGHTWEIGHT STATIC TEST SERVER
// Native Node 24 zero-dependency HTTP server
// ========================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

export function createStaticServer(rootDir = ROOT_DIR) {
  return http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname === '/') {
      pathname = '/index.html';
    }

    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(rootDir, safePath);

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`404 Not Found: ${pathname}`);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      });

      fs.createReadStream(filePath).pipe(res);
    });
  });
}

export async function startServer(port = 3000, rootDir = ROOT_DIR) {
  const server = createStaticServer(rootDir);
  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        server,
        port: actualPort,
        url: `http://127.0.0.1:${actualPort}`,
        close: () => new Promise((res) => server.close(res))
      });
    });
    server.on('error', reject);
  });
}

// Standalone execution: node test/server.js
if (process.argv[1] === __filename) {
  const port = parseInt(process.env.PORT || '3000', 10);
  startServer(port).then(({ url }) => {
    console.log(`FeatherLine Static Server running at: ${url}`);
  }).catch((err) => {
    console.error('Server failed to start:', err);
    process.exit(1);
  });
}
