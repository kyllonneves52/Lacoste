const {sql}=require('../../../db');const {json,body}=require('../../../common');
module.exports=async(req,res)=>{try{
 const aid=String(req.headers['x-android-id']||'');const tok=String(req.headers['x-app-token']||'');
 const d=(await sql`SELECT * FROM devices WHERE android_id=${aid} LIMIT 1`).rows[0];
 if(!d||tok!==d.token||d.status!=='active'||(d.license_expires_at&&new Date(d.license_expires_at)<=new Date()))return json(res,403,{ok:false,message:'Não autorizado'});
 const b=await body(req);
 const q=await sql`UPDATE orders SET status='failed',fail_reason=${String(b.motivo||'Erro')} WHERE id=${String(b.pedidoId)} AND status='pending' AND device_android_id=${aid} RETURNING id`;
 return json(res,200,{ok:true,atualizado:!!q.rows[0]});
}catch(e){return json(res,500,{ok:false,message:e.message})}};
