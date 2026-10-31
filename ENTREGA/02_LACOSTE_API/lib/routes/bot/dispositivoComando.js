const { json, body } = require('../../common');
const db = require('../../dbHelpers');
const push = require('../../push');

function botOk(req) {
  return String(req.headers['x-bot-token'] || '') === String(process.env.LACOSTE_BOT_TOKEN || '');
}

/** POST /api/bot/dispositivo/comando  { groupId?, androidId?, comando, sim? } */
module.exports.criar = async (req, res) => {
  if (!botOk(req)) return json(res, 403, { ok: false, message: 'Bot não autorizado.' });
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Método não permitido.' });
  try {
    const b = await body(req);
    const comando = String(b.comando || b.command || '').toLowerCase().trim();
    if (!['libertar', 'resetar', 'limites', 'consultar'].includes(comando)) {
      return json(res, 400, { ok: false, message: 'Comando inválido. Use: libertar|resetar|limites|consultar' });
    }
    let androidId = String(b.androidId || '').trim();
    const groupId = String(b.groupId || b.grupoId || '').trim();
    const sim = b.sim != null ? Number(b.sim) : null;

    if (!androidId && groupId) {
      const row = await db.get(
        `SELECT android_id FROM bot_group_devices WHERE group_id = ? AND active = TRUE LIMIT 1`,
        [groupId]
      );
      if (row) androidId = row.android_id;
    }
    if (!androidId) return json(res, 400, { ok: false, message: 'androidId ou groupId com dispositivo associado obrigatório.' });

    const device = await db.get(
      `SELECT android_id, fcm_token, token FROM devices WHERE android_id = ?
       UNION SELECT android_id, fcm_token, token FROM dispositivos WHERE android_id = ? LIMIT 1`,
      [androidId, androidId]
    ).catch(() => null);

    // fallback single table
    const dev = device || (await db.get(`SELECT android_id, fcm_token, token FROM devices WHERE android_id = ?`, [androidId]).catch(() => null));

    const id = 'cmd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await db.run(
      `INSERT INTO device_commands (id, android_id, command, sim, status, group_id, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)`,
      [id, androidId, comando, sim, groupId || null]
    );

    let pushOk = false, pushDetalhe = null;
    if (dev && dev.fcm_token) {
      try {
        // notifyDevice(fcmToken, data) — API real do push.js
        pushDetalhe = await push.notifyDevice(dev.fcm_token, {
          type: 'DEVICE_COMMAND',
          commandId: id,
          comando,
          command: comando,
          sim: sim != null ? String(sim) : '',
          androidId
        });
        pushOk = !!(pushDetalhe && pushDetalhe.sent);
      } catch (e) {
        pushDetalhe = { ok: false, message: e.message };
      }
    }

    return json(res, 200, {
      ok: true,
      commandId: id,
      androidId,
      comando,
      pushEnviado: pushOk,
      pushDetalhe,
      message: pushOk ? 'Comando enviado ao dispositivo.' : 'Comando criado; push pode não ter sido entregue (sem FCM).'
    });
  } catch (e) {
    return json(res, 500, { ok: false, message: e.message });
  }
};

/** POST /api/bot/dispositivo/comando/status { commandId } */
module.exports.status = async (req, res) => {
  if (!botOk(req)) return json(res, 403, { ok: false, message: 'Bot não autorizado.' });
  try {
    const b = req.method === 'POST' ? await body(req) : {};
    const commandId = String(b.commandId || b.id || '').trim();
    if (!commandId) return json(res, 400, { ok: false, message: 'commandId obrigatório.' });
    const row = await db.get(`SELECT * FROM device_commands WHERE id = ?`, [commandId]);
    if (!row) return json(res, 404, { ok: false, message: 'Comando não encontrado.' });
    return json(res, 200, { ok: true, command: row });
  } catch (e) {
    return json(res, 500, { ok: false, message: e.message });
  }
};
