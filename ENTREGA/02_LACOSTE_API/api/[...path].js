const routes = {
  '/init': async (req,res) => {
    if(req.query.key!=='lacoste123')
      return res.status(401).json({error:'key'});

    try {
      const {runMigrations}=require('../lib/migrate');
      const result=await runMigrations();
      return res.json(result);
    } catch(e) {
      console.error(e);
      return res.status(500).json({
        ok:false,
        message:e.message
      });
    }
  },

  '/db-test': async (req,res) => {
    try {
      const { query } = require('../lib/db');
      const url = String(process.env.TURSO_DATABASE_URL || '');
      const token = String(process.env.TURSO_AUTH_TOKEN || '');
      const r = await query(`SELECT 1 AS ok`);
      return res.json({
        ok: true,
        database: url.replace(/^libsql:\/\//, '').replace(/https:\/\//, '').replace(/\/$/, '') ,
        token_configurado: !!token,
        teste_sql: r.rows
      });
    } catch(e) {
      console.error('DB TEST ERROR:', e);
      return res.status(500).json({ok:false,erro:e.message});
    }
  },

  '/setup': require('../lib/routes/setup'),
  '/admin/health': require('../lib/routes/admin/health'),
  '/admin/authorized': require('../lib/routes/admin/authorized'),
  '/admin/devices': require('../lib/routes/admin/devices'),
  '/admin/group-devices': require('../lib/routes/admin/groupDevices'),
  '/admin/group-devices/associate': require('../lib/routes/admin/groupDevicesAssociate'),
  '/admin/group-devices/remove': require('../lib/routes/admin/groupDevicesRemove'),
  '/admin/licenses': require('../lib/routes/admin/licenses'),
  '/admin/orders': require('../lib/routes/admin/orders'),
  '/admin/lcverification': require('../lib/routes/admin/lcverification'),

  '/autosistema/dispositivo/heartbeat': require('../lib/routes/autosistema/dispositivo/heartbeat'),
  '/autosistema/dispositivo/registar': require('../lib/routes/autosistema/dispositivo/registar'),
  '/autosistema/dispositivo/status': require('../lib/routes/autosistema/dispositivo/status'),
  '/autosistema/dispositivo/push': require('../lib/routes/autosistema/dispositivo/push'),

  '/autosistema/pedido/concluir': require('../lib/routes/autosistema/pedido/concluir'),
  '/autosistema/pedido/falhou': require('../lib/routes/autosistema/pedido/falhou'),
  '/autosistema/sms/pedido': require('../lib/routes/autosistema/sms/pedido'),
  '/autosistema/sms/status': require('../lib/routes/autosistema/sms/status'),
  '/autosistema/pedidos/dispositivo': require('../lib/routes/autosistema/pedidos/dispositivo'),

  '/bot/authorized': require('../lib/routes/bot/authorized'),
  '/bot/pedido/criar': require('../lib/routes/bot/pedido/criar'),
  '/bot/pedido/status': require('../lib/routes/bot/pedido/status'),
  '/bot/pedidos/fila': require('../lib/routes/bot/pedidosFila'),
  '/bot/pedido/cancelar': require('../lib/routes/bot/pedido/cancelar'),

  '/bot/dispositivos/listar': require('../lib/routes/bot/dispositivo').listar,
  '/bot/dispositivo/associar': require('../lib/routes/bot/dispositivo').associar,
  '/bot/dispositivo/desassociar': require('../lib/routes/bot/dispositivo').desassociar,
  '/bot/dispositivo/comando': require('../lib/routes/bot/dispositivoComando').criar,
  '/bot/dispositivo/comando/status': require('../lib/routes/bot/dispositivoComando').status,
  '/autosistema/dispositivo/command-result': require('../lib/routes/autosistema/dispositivo/commandResult').handler,


  '/bot/licencas/listar': require('../lib/routes/bot/licencas').listar,
  '/bot/licenca/aprovar': require('../lib/routes/bot/licencas').aprovar,
  '/bot/licenca/rejeitar': require('../lib/routes/bot/licencas').rejeitar,
  '/bot/pairing/set': require('../lib/routes/bot/pairing').set,
  '/bot/pairing/codigo': require('../lib/routes/bot/pairing').codigo,
  '/bot/pairing/pendentes': require('../lib/routes/bot/pairing').listarPendentes,
  '/app/pairing/pedir': require('../lib/routes/bot/pairing').pedir,
  '/app/pairing/codigo': require('../lib/routes/bot/pairing').codigo,

  '/bot/grupos/dispositivos': require('../lib/routes/bot/grupos'),
  '/bot/grupo/config': require('../lib/routes/bot/grupoConfig'),
  '/bot/grupo/dispositivo/associar': require('../lib/routes/bot/grupo').handler,
  '/bot/grupo/dispositivo/status': require('../lib/routes/bot/grupo').status,
  '/bot/grupo/dispositivo/remover': require('../lib/routes/bot/grupo').remove,

  '/licenca/approve': require('../lib/routes/licenca/approve'),
  '/licenca/reject': require('../lib/routes/licenca/reject'),
  '/licenca/request': require('../lib/routes/licenca/request'),
  '/licenca/status': require('../lib/routes/licenca/status'),

  '/orders/create': require('../lib/routes/orders/create'),
  '/orders/status': require('../lib/routes/orders/status'),

  '/lcverification/config': require('../lib/routes/lcverification/config'),
  '/lcverification/device': require('../lib/routes/lcverification/device'),
  '/lcverification/finance': require('../lib/routes/lcverification/finance').handler,
  '/lcverification/heartbeat': require('../lib/routes/lcverification/heartbeat'),
  '/lcverification/pending': require('../lib/routes/lcverification/pending'),
  '/lcverification/sms': require('../lib/routes/lcverification/sms'),
  '/lcverification/status': require('../lib/routes/lcverification/status'),
  '/lcverification/expire': require('../lib/routes/lcverification/expire'),
  '/lcverification/associar': require('../lib/routes/lcverification/associar'),

  '/autosistema/verificacao/registar': require('../lib/routes/lcverification/registar'),
  '/autosistema/verificacao/pagamento': require('../lib/routes/lcverification/sms')
};

module.exports = async (req,res) => {
  let p=(req.url||'').split('?')[0];

  if(p.startsWith('/api/'))
    p=p.substring(4);

  if(!p.startsWith('/'))
    p='/'+p;

  if(p.length>1)
    p=p.replace(/\/+$/,'');

  const h=routes[p];

  if(!h)
    return res.status(404).json({
      ok:false,
      route:p
    });

  try {
    return await h(req,res);
  } catch(e) {
    console.error('ROUTE ERROR:',p,e);

    return res.status(500).json({
      ok:false,
      message:e.message
    });
  }
};
