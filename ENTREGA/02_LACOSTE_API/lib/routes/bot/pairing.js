/**
 * Pareamento bot via CÓDIGO (não QR) — partilha código entre bot e app.
 * POST /api/bot/pairing/set     { numero, codigo, sessao }  (bot token)
 * POST /api/bot/pairing/request { numero }                 (bot token) — marca pedido
 * POST /api/app/pairing/pedir   { numero, androidId }      (app token ou android id)
 * POST /api/app/pairing/codigo  { numero?, androidId? }    — app consulta código
 */
const fs = require('fs');
const path = require('path');
const { json, body } = require('../../common');

const STORE = path.join(process.cwd(), 'data', 'pairing_codes.json');

function botOk(req) {
  return String(req.headers['x-bot-token'] || '') === String(process.env.LACOSTE_BOT_TOKEN || '');
}

function ensure() {
  const dir = path.dirname(STORE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE)) fs.writeFileSync(STORE, '{}');
}

function load() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function save(d) {
  ensure();
  fs.writeFileSync(STORE, JSON.stringify(d, null, 2));
}

function normNum(n) {
  let s = String(n || '').replace(/\D/g, '');
  if (s.startsWith('0')) s = '258' + s.slice(1);
  if (!s.startsWith('258') && s.length >= 9) s = '258' + s;
  return s;
}

/** Bot grava o código gerado */
module.exports.set = async (req, res) => {
  if (!botOk(req)) return json(res, 403, { ok: false, message: 'Bot não autorizado.' });
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Método não permitido.' });
  try {
    const b = await body(req);
    const numero = normNum(b.numero);
    const codigo = String(b.codigo || '').trim();
    const sessao = String(b.sessao || '').trim();
    if (!numero || !codigo) return json(res, 400, { ok: false, message: 'numero e codigo obrigatórios.' });
    const all = load();
    const entry = {
      numero,
      codigo,
      sessao,
      androidId: b.androidId ? String(b.androidId) : (all[numero]?.androidId || null),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min
    };
    all[numero] = entry;
    if (entry.androidId) all['aid:' + entry.androidId] = entry;
    all['last'] = entry;
    save(all);
    return json(res, 200, { ok: true, ...entry });
  } catch (e) {
    return json(res, 500, { ok: false, message: e.message });
  }
};

/** App pede: regista número + androidId; o bot pode ler pedidos pendentes */
module.exports.pedir = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Método não permitido.' });
  try {
    const b = await body(req);
    const numero = normNum(b.numero);
    const androidId = String(b.androidId || '').trim();
    if (!numero) return json(res, 400, { ok: false, message: 'numero obrigatório (258...).' });
    const all = load();
    const entry = {
      numero,
      androidId: androidId || null,
      codigo: all[numero]?.codigo || null,
      sessao: all[numero]?.sessao || null,
      pedidoApp: true,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    };
    // se já havia código fresco, mantém
    if (all[numero]?.codigo && all[numero]?.expiresAt && new Date(all[numero].expiresAt) > new Date()) {
      entry.codigo = all[numero].codigo;
      entry.sessao = all[numero].sessao;
    }
    all[numero] = entry;
    if (androidId) all['aid:' + androidId] = entry;
    all['pending:' + numero] = { numero, androidId, at: entry.updatedAt };
    save(all);
    return json(res, 200, {
      ok: true,
      message: entry.codigo
        ? 'Código já disponível.'
        : 'Pedido registado. Use .conectar no bot com este número ou aguarde o código.',
      numero,
      codigo: entry.codigo || null,
      sessao: entry.sessao || null
    });
  } catch (e) {
    return json(res, 500, { ok: false, message: e.message });
  }
};

/** App ou bot consulta o código */
module.exports.codigo = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') return json(res, 405, { ok: false, message: 'Método não permitido.' });
  try {
    let numero = '';
    let androidId = '';
    if (req.method === 'POST') {
      const b = await body(req);
      numero = normNum(b.numero);
      androidId = String(b.androidId || '').trim();
    } else {
      const u = new URL(req.url || '', 'http://localhost');
      numero = normNum(u.searchParams.get('numero'));
      androidId = String(u.searchParams.get('androidId') || '').trim();
    }
    const all = load();
    let entry = null;
    if (numero && all[numero]) entry = all[numero];
    else if (androidId && all['aid:' + androidId]) entry = all['aid:' + androidId];
    else if (all['last']) entry = all['last'];
    if (!entry || !entry.codigo) {
      return json(res, 200, { ok: true, disponivel: false, message: 'Ainda sem código. Peça .conectar no bot ou aguarde.' });
    }
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      return json(res, 200, { ok: true, disponivel: false, message: 'Código expirado. Gere outro com .conectar.' });
    }
    return json(res, 200, {
      ok: true,
      disponivel: true,
      numero: entry.numero,
      codigo: entry.codigo,
      sessao: entry.sessao || null,
      updatedAt: entry.updatedAt
    });
  } catch (e) {
    return json(res, 500, { ok: false, message: e.message });
  }
};

module.exports.listarPendentes = async (req, res) => {
  if (!botOk(req)) return json(res, 403, { ok: false, message: 'Bot não autorizado.' });
  try {
    const all = load();
    const pend = Object.keys(all)
      .filter((k) => k.startsWith('pending:'))
      .map((k) => all[k]);
    return json(res, 200, { ok: true, pendentes: pend });
  } catch (e) {
    return json(res, 500, { ok: false, message: e.message });
  }
};
