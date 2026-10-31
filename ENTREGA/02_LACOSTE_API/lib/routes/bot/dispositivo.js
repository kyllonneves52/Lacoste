const {sql}=require('../../db');
const {json,body}=require('../../common');
const MAX=20;

function botOk(req){
  return String(req.headers['x-bot-token']||'')===String(process.env.LACOSTE_BOT_TOKEN||'');
}

module.exports={
 listar:async(req,res)=>{
  if(!botOk(req)) return json(res,403,{ok:false,message:'Bot não autorizado.'});
  try{
    const b=await body(req);
    const key=String(b.licenseKey||'').trim().toUpperCase();

    const q=key
      ? await sql`
          SELECT d.android_id,d.model,d.status,d.slot,d.license_key,
                 d.license_expires_at,d.last_seen,
                 (d.fcm_token IS NOT NULL AND d.fcm_token<>'') AS push_configurado
          FROM devices d
          WHERE d.license_key=${key}
          ORDER BY d.slot NULLS LAST,d.last_seen DESC NULLS LAST`
      : await sql`
          SELECT d.android_id,d.model,d.status,d.slot,d.license_key,
                 d.license_expires_at,d.last_seen,
                 (d.fcm_token IS NOT NULL AND d.fcm_token<>'') AS push_configurado
          FROM devices d
          ORDER BY
            CASE WHEN d.status='active' THEN 0
                 WHEN d.status='pending' THEN 1
                 ELSE 2 END,
            d.slot NULLS LAST,
            d.last_seen DESC NULLS LAST
          LIMIT 500`;

    return json(res,200,{ok:true,limite:MAX,dispositivos:q.rows});
  }catch(e){
    return json(res,500,{ok:false,message:e.message});
  }
 },

 associar:async(req,res)=>{
  if(!botOk(req))return json(res,403,{ok:false,message:'Bot não autorizado.'});
  try{
    const b=await body(req);
    const pedidoId=String(b.pedidoId||'');
    const aid=String(b.androidId||'');
    if(!pedidoId||!aid)return json(res,400,{ok:false,message:'pedidoId e androidId obrigatórios.'});
    const d=(await sql`SELECT android_id,status,license_key,slot,license_expires_at FROM devices WHERE android_id=${aid} LIMIT 1`).rows[0];
    if(!d)return json(res,404,{ok:false,message:'Dispositivo não encontrado.'});
    if(d.status!=='active'||(d.license_expires_at&&new Date(d.license_expires_at)<=new Date()))return json(res,400,{ok:false,message:'Dispositivo não está ativo.'});
    const q=await sql`UPDATE orders SET device_android_id=${aid} WHERE id=${pedidoId} AND status='pending' RETURNING id`;
    if(!q.rows[0])return json(res,404,{ok:false,message:'Pedido não encontrado ou já processado.'});
    return json(res,200,{ok:true,pedidoId,androidId:aid,slot:d.slot,licenseKey:d.license_key});
  }catch(e){return json(res,500,{ok:false,message:e.message})}
 },

 desassociar:async(req,res)=>{
  if(!botOk(req))return json(res,403,{ok:false,message:'Bot não autorizado.'});
  try{
    const b=await body(req);const pedidoId=String(b.pedidoId||'');
    if(!pedidoId)return json(res,400,{ok:false,message:'pedidoId obrigatório.'});
    const q=await sql`UPDATE orders SET device_android_id=NULL WHERE id=${pedidoId} AND status='pending' RETURNING id`;
    return json(res,200,{ok:!!q.rows[0]});
  }catch(e){return json(res,500,{ok:false,message:e.message})}
 }
};
