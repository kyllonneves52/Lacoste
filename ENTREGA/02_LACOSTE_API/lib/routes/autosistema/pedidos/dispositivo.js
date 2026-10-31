const {sql}=require('../../../db');
const {json}=require('../../../common');
module.exports=async(req,res)=>{
  try{
    const aid=String(req.headers['x-android-id']||'');
    const appToken=String(req.headers['x-app-token']||'');
    const d=(await sql`SELECT * FROM devices WHERE android_id=${aid} LIMIT 1`).rows[0];
    if(!d||!appToken||appToken!==d.token||d.status!=='active'||(d.license_expires_at&&new Date(d.license_expires_at)<=new Date())){
      return json(res,403,{ok:false,message:'Dispositivo não autorizado.'});
    }
    const q=await sql`
      SELECT o.*, pv.status AS verification_status
      FROM orders o
      LEFT JOIN payment_verifications pv ON pv.order_id=o.id
      WHERE o.status='pending' AND o.device_android_id=${aid}
        AND (pv.id IS NULL OR pv.status='verified')
      ORDER BY o.created_at ASC LIMIT 10
    `;
    return json(res,200,{ok:true,pedidos:q.rows.map(o=>({
      pedidoId:o.id,tipo:o.type,numero:o.number,quantidadeMB:o.quantity_mb,valorMT:o.value_mt,
      paymentId:o.payment_id,paymentDate:o.payment_date,paymentTime:o.payment_time,testMode:o.test_mode, paymentVerified:(!o.verification_status || o.verification_status==='verified')
    }))});
  }catch(e){return json(res,500,{ok:false,message:e.message})}
};
