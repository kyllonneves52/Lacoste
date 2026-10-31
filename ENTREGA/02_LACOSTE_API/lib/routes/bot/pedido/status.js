const { sql } = require('../../../db');
const { json, body } = require('../../../common');

module.exports = async (req, res) => {
  if (String(req.headers['x-bot-token'] || '') !== String(process.env.LACOSTE_BOT_TOKEN || '')) {
    return json(res, 403, { ok: false, message: 'Bot não autorizado.' });
  }
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, message: 'Método não permitido.' });
  }

  try {
    const b = await body(req);
    const pedidoId = String(b.pedidoId || '');
    const groupId = String(b.groupId || '');
    if (!pedidoId) return json(res, 400, { ok: false, message: 'pedidoId obrigatório.' });

    await sql`UPDATE payment_verifications SET status='expired',failure_reason='Nenhum SMS válido recebido dentro de 10 minutos.',updated_at=NOW() WHERE status='pending' AND expires_at<=NOW()`;
    await sql`UPDATE orders SET status='failed',fail_reason='Pagamento não verificado dentro de 10 minutos. O SMS de recebimento com o mesmo ID não chegou a tempo.' WHERE status='waiting_verification' AND id IN (SELECT order_id FROM payment_verifications WHERE status='expired')`;

    const q = await sql`
      SELECT *
      FROM orders
      WHERE
        (id = ${pedidoId} OR parent_order_id = ${pedidoId})
        AND bot_group_id = ${groupId}
      ORDER BY part_number ASC
    `;

    if (!q.rows.length) {
      return json(res, 404, { ok: false, message: 'Pedido não encontrado.' });
    }

    const rows = q.rows;
    const total = rows.length;
    const done = rows.filter(x => x.status === 'completed').length;
    const failed = rows.find(x => x.status === 'failed');
    const cancelled = rows.find(x => x.status === 'cancelled');
    const waiting = rows.find(x => x.status === 'waiting_verification');

    let status = 'pending';
    if (failed) status = 'failed';
    else if (cancelled) status = 'cancelled';
    else if (done === total) status = 'completed';
    else if (waiting) status = 'waiting_verification';

    const o = rows[0];
    const quantidadeMB = rows.reduce((totalMB, x) => totalMB + Number(x.quantity_mb || 0), 0);
    let motivo = '';
    if (failed) motivo = failed.fail_reason || 'Pedido não concluído.';
    else if (cancelled) motivo = 'Pedido cancelado.';
    else if (waiting) motivo = 'Aguardando SMS de recebimento (30s).';

    return json(res, 200, {
      ok: true,
      pedido: {
        pedidoId,
        tipo: o.type,
        numero: o.number,
        quantidadeMB,
        valorMT: o.value_mt,
        status,
        motivo,
        erro: motivo,
        partesTotal: total,
        partesConcluidas: done,
        groupId: o.bot_group_id
      }
    });
  } catch (e) {
    console.error('ERRO STATUS PEDIDO:', e);
    return json(res, 500, { ok: false, message: e.message });
  }
};
