const { json, body } = require('../../common');
const db = require('../../dbHelpers');

async function authDevice(req, b) {
  const token = String(req.headers['x-app-token'] || req.headers['x-device-token'] || b.token || '').trim();
  const deviceId = String(req.headers['x-android-id'] || b.deviceId || b.androidId || '').trim();
  if (!token && !deviceId) return null;
  // LC verification devices may live in lcverification tables; accept token match loosely
  try {
    if (token) {
      const row = await db.get(`SELECT * FROM devices WHERE token = ? LIMIT 1`, [token]).catch(() => null);
      if (row) return row;
    }
  } catch (_) {}
  return { android_id: deviceId || 'lc', token };
}

/** POST /api/lcverification/finance
 *  actions: dashboard | savePackage | listPackages
 */
module.exports.handler = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Método não permitido.' });
  try {
    const b = await body(req);
    const action = String(b.action || 'dashboard').trim();
    await authDevice(req, b);

    if (action === 'savePackage') {
      const mb = Number(b.mb || b.quantidadeMb || 0);
      const profitMt = Number(String(b.profitMt || b.lucroMt || '0').replace(',', '.'));
      if (!mb || profitMt < 0) return json(res, 400, { ok: false, message: 'mb e profitMt obrigatórios.' });
      await db.run(
        `INSERT INTO profit_packages (mb, profit_mt, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(mb) DO UPDATE SET profit_mt = excluded.profit_mt, updated_at = CURRENT_TIMESTAMP`,
        [mb, profitMt]
      );
      return json(res, 200, { ok: true, message: `Pacote ${mb}MB → ${profitMt} MT guardado.`, mb, profitMt });
    }

    if (action === 'listPackages') {
      const rows = await db.all(`SELECT mb, profit_mt AS profitMt, updated_at FROM profit_packages ORDER BY mb`);
      return json(res, 200, { ok: true, packages: rows || [] });
    }

    // dashboard
    const packages = await db.all(`SELECT mb, profit_mt AS profitMt FROM profit_packages ORDER BY mb`).catch(() => []);
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = await db.get(
      `SELECT COALESCE(SUM(profit_mt),0) AS total, COUNT(*) AS n FROM profit_entries WHERE day = ?`,
      [today]
    ).catch(() => ({ total: 0, n: 0 }));
    const last30 = await db.all(
      `SELECT day, SUM(profit_mt) AS total FROM profit_entries
       WHERE day >= date('now', '-30 days') GROUP BY day ORDER BY day`
    ).catch(() => []);
    const recent = await db.all(
      `SELECT order_id, mb, profit_mt, day, created_at FROM profit_entries ORDER BY created_at DESC LIMIT 20`
    ).catch(() => []);
    const week = await db.all(
      `SELECT day, SUM(profit_mt) AS total FROM profit_entries
       WHERE day >= date('now', '-7 days') GROUP BY day ORDER BY day`
    ).catch(() => []);

    return json(res, 200, {
      ok: true,
      summary: {
        hojeMt: Number(todayRow?.total || 0),
        hojePedidos: Number(todayRow?.n || 0),
        packages: packages || []
      },
      chart30: (last30 || []).map((r) => ({ day: r.day, total: Number(r.total || 0) })),
      chart7: (week || []).map((r) => ({ day: r.day, total: Number(r.total || 0) })),
      history: recent || [],
      message: 'Dashboard financeiro'
    });
  } catch (e) {
    return json(res, 500, { ok: false, message: e.message });
  }
};
