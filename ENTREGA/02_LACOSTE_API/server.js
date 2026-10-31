const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const apiHandler = require('./api/[...path].js');

// Bot-Hosting injeta SERVER_PORT. Hyze/outros usam PORT. Fallback 8080.
const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function addHeaders(res) {
  // The Android apps and the bot call this API from different origins.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, X-Admin-Password, X-Bot-Token, X-Android-Id, X-App-Token, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
}

function adaptRequest(req, parsed) {
  req.query = Object.fromEntries(parsed.searchParams.entries());
  return req;
}

function adaptResponse(res) {
  // Keep the small Vercel-compatible interface used by the existing route files.
  if (!res.status) {
    res.status = function (code) {
      res.statusCode = code;
      return res;
    };
  }
  if (!res.json) {
    res.json = function (data) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(data));
    };
  }
  return res;
}

async function serveStatic(req, res, pathname) {
  let file;

  if (pathname === '/' || pathname === '') file = 'index.html';
  else if (pathname === '/admin') file = 'admin.html';
  else if (pathname === '/guia') file = 'guia.html';
  else if (pathname === '/sms') file = 'sms.html';
  else file = pathname.replace(/^\/+/, '');

  // Never allow ../ to escape the project directory.
  const safe = path.normalize(file);
  if (safe.startsWith('..') || path.isAbsolute(safe)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }

  const full = path.join(ROOT, safe);

  try {
    const stat = await fs.promises.stat(full);
    if (!stat.isFile()) throw new Error('not file');

    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(full).pipe(res);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  }
}

const server = http.createServer(async (req, res) => {
  addHeaders(res);
  adaptResponse(res);

  const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // Simple public health endpoint for the hosting panel.
  if (pathname === '/health' || pathname === '/api/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({
      ok: true,
      service: 'LACOSTE AUTO API',
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString()
    }));
  }

  try {
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      adaptRequest(req, parsed);
      return await apiHandler(req, res);
    }

    return await serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[SERVER ERROR]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, message: err.message }));
    } else {
      res.end();
    }
  }
});

server.on('clientError', (err, socket) => {
  console.error('[CLIENT ERROR]', err.message);
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

const required = ['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','ADMIN_PASSWORD','LACOSTE_BOT_TOKEN','API_TOKEN','LICENSE_TOKEN','FIREBASE_PROJECT_ID','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) console.warn('[CONFIG] Variáveis ausentes:', missing.join(', '));

server.listen(PORT, HOST, () => {
  console.log(`LACOSTE AUTO API running on http://${HOST}:${PORT}`);
  console.log(`Public port: ${PORT}`);
});

function shutdown(signal) {
  console.log(`[SERVER] ${signal} recebido. Encerrando...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
