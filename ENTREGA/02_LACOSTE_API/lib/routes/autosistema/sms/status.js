const {sql}=require('../../../db');const {json}=require('../../../common');
module.exports=async(req,res)=>{try{
 const aid=String(req.headers['x-android-id']||'').trim(),tok=String(req.headers['x-app-token']||'').trim(),pid=String(req.query?.pedidoId||'').trim();
 const d=(await sql`SELECT android_id,token,status,license_expires_at FROM devices WHERE android_id=${aid} LIMIT 1`).rows[0];
 if(!d||!tok||tok!==d.token||d.status!=='active'||(d.license_expires_at&&new Date(d.license_expires_at)<=new Date()))return json(res,403,{ok:false,message:'Dispositivo não autorizado.'});
 if(!pid)return json(res,200,{ok:true,status:'connected',androidId:aid,message:'Dispositivo autorizado e rota SMS acessível.'});
 await sql`UPDATE payment_verifications SET status='expired',failure_reason='Nenhum SMS válido recebido dentro de 10 minutos.',updated_at=NOW() WHERE status='pending' AND expires_at<=NOW() AND order_id IN (SELECT id FROM orders WHERE device_android_id=${aid} AND source IN ('sms','lc_verification'))`;
 await sql`UPDATE orders SET status='failed',fail_reason='Pagamento não verificado dentro de 10 minutos.' WHERE status='waiting_verification' AND device_android_id=${aid} AND source IN ('sms','lc_verification') AND id IN (SELECT order_id FROM payment_verifications WHERE status='expired')`;
 const o=(await sql`SELECT id,status,fail_reason,number,quantity_mb,payment_id FROM orders WHERE (id=${pid} OR parent_order_id=${pid}) AND device_android_id=${aid} AND source IN ('sms','lc_verification') ORDER BY part_number ASC LIMIT 1`).rows[0];
 if(!o)return json(res,404,{ok:false,message:'Pedido não encontrado.'});
 const rows=(await sql`SELECT status,fail_reason FROM orders WHERE (id=${pid} OR parent_order_id=${pid}) AND device_android_id=${aid}`).rows;
 const status=rows.some(x=>x.status==='failed')?'failed':rows.length&&rows.every(x=>x.status==='completed')?'completed':rows.some(x=>x.status==='waiting_verification')?'waiting_verification':rows.some(x=>x.status==='pending')?'pending':o.status;
 return json(res,200,{ok:true,pedidoId:pid,status,motivo:rows.find(x=>x.fail_reason)?.fail_reason||o.fail_reason||'',numero:o.number,quantidadeMB:o.quantity_mb,referencia:o.payment_id});
}catch(e){console.error(e);return json(res,500,{ok:false,message:e.message});}};
