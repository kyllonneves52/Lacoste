const { json, body } = require('../../../common');
const db = require('../../../dbHelpers');

/** POST /api/autosistema/dispositivo/command-result
 *  Headers: X-App-Token or body.token
 *  body: { commandId, ok, result, message }
 */
module.exports.handler = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Método não permitido.' });
  try {
    const b = await body(req);
    const commandId = String(b.commandId || '').trim();
    const androidId = String(b.androidId || req.headers['x-android-id'] || '').trim();
    if (!commandId) return json(res, 400, { ok: false, message: 'commandId obrigatório.' });

    const status = b.ok === false || b.success === false ? 'failed' : 'completed';
    const resultText = String(b.result || b.message || b.output || '').slice(0, 2000);

    await db.run(
      `UPDATE device_commands SET status = ?, result = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, resultText, commandId]
    );

    return json(res, 200, { ok: true, commandId, status });
  } catch (e) {
    return json(res, 500, { ok: false, message: e.message });
  }
};
