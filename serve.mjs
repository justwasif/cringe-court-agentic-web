/**
 * Minimal static server for local development.
 *
 * It exists only because the runtime uses ES modules and fetch, which need a real
 * HTTP origin. Production hosting is any static host that can set the CORS
 * headers in `_headers`.
 *
 * It deliberately sets the same CORS headers as production so that cross-origin
 * peer loading can be tested locally against 127.0.0.1 instead of a deployed host.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '127.0.0.1';
const ROOT = resolve(process.env.ROOT ?? '.');

/** Files that must be readable cross-origin, per the spec's hosting rule. */
const CORS_PATHS = new Set([
  '/agent-manifest.json',
  '/cringecourt.network.json',
  '/links.json',
  '/agent-mcp.json',
  '/.well-known/nsdeploy.json',
  '/.well-known/nsdeploy-agent.json',
]);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

/** Resolve a URL path to a file inside ROOT, refusing traversal. */
function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = join(ROOT, rel);
  return full.startsWith(ROOT) ? full : null;
}

const server = createServer(async (req, res) => {
  const urlPath = req.url ?? '/';
  let filePath = safePath(urlPath);

  if (!filePath) {
    res.writeHead(400).end('Bad path');
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    // Fall through to the read attempt, which will 404 properly.
  }

  try {
    const body = await readFile(filePath);
    const headers = {
      'content-type': TYPES[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    };

    // Same CORS policy as production, so a local peer test is meaningful.
    if (CORS_PATHS.has(urlPath.split('?')[0])) {
      headers['access-control-allow-origin'] = '*';
    }

    // The sandbox worker must run under a restrictive CSP.
    if (urlPath.startsWith('/runtime/sandbox-worker.js')) {
      headers['content-security-policy'] =
        "default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'";
    }

    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`CringeCourt serving ${ROOT} at http://${HOST}:${PORT}/`);
});
