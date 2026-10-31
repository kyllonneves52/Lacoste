'use strict';
const { sql } = require('../../../db');
const { json, body } = require('../../../common');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Método não permitido.' });
  try {
    const b = await body(req);
    const aid = String(b.androidId || req.headers['x-android-id'] || '').trim();
    const supplied = String(req.headers['x-app-token'] || b.deviceToken || '').trim();
    if (!aid) return json(res, 400, { ok: false, message: 'Android ID obrigatório.' });

    const d = (await sql`SELECT token,status,license_expires_at FROM devices WHERE android_id=${aid} LIMIT 1`).rows[0];
    if (!d) return json(res, 404, { ok: false, message: 'Dispositivo não registado. Faça a associação novamente.' });
    // Não aceita heartbeat sem autenticação quando o dispositivo tem token de app.
    if (d.token && supplied !== d.token) {
      return json(res, 403, { ok: false, message: supplied ? 'Token do dispositivo inválido.' : 'Token do dispositivo ausente no heartbeat.' });
    }

    let status = String(d.status || 'pending');
    if (d.license_expires_at && new Date(d.license_expires_at) <= new Date() && status === 'active') status = 'expired';
    const sim = Number(b.simAtivo || 0);
    const simSafe = Number.isFinite(sim) ? sim : 0;
    const comm = b.toggleAtivo === true || String(b.toggleAtivo).toLowerCase() === 'true';

    const updated = await sql`UPDATE devices SET last_seen=NOW(),sim_active=${simSafe},communication_active=${comm},status=${status} WHERE android_id=${aid}`;
    return json(res, 200, { ok: true, status, androidId: aid, lastSeenUpdated: true, serverTime: new Date().toISOString() });
  } catch (e) {
    console.error('DEVICE HEARTBEAT ERROR:', e?.message || e);
    return json(res, 500, { ok: false, message: 'Falha ao atualizar heartbeat.', detail: String(e?.message || e) });
  }
};
