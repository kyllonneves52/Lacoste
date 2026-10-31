const {sql}=require('../../../db');
const {json,body}=require('../../../common');
module.exports=async(req,res)=>{try{
 if(req.method!=='POST')return json(res,405,{ok:false});
 const b=await body(req);const aid=String(req.headers['x-android-id']||b.androidId||'').trim();const tok=String(req.headers['x-app-token']||b.deviceToken||'').trim();const fcm=String(b.fcmToken||'').trim();
 if(!aid||!tok||!fcm)return json(res,400,{ok:false,message:'androidId, deviceToken e fcmToken obrigatórios.'});
 const d=(await sql`SELECT token,status,license_expires_at FROM devices WHERE android_id=${aid} LIMIT 1`).rows[0];
 if(!d||d.token!==tok)return json(res,403,{ok:false,message:'Dispositivo não autorizado.'});
 if(d.status!=='active'||(d.license_expires_at&&new Date(d.license_expires_at)<=new Date()))return json(res,403,{ok:false,message:'Dispositivo não está ativo.'});
 await sql`UPDATE devices SET fcm_token=${fcm},fcm_updated_at=NOW(),last_seen=NOW() WHERE android_id=${aid}`;
 return json(res,200,{ok:true,androidId:aid});
}catch(e){return json(res,500,{ok:false,message:e.message});}};
