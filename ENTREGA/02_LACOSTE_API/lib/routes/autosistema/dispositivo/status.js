const {sql}=require('../../../db');
const {json}=require('../../../common');
module.exports=async(req,res)=>{
  try{
    const aid=String(req.query.androidId||'');
    if(!aid) return json(res,400,{ok:false,message:'Android ID obrigatório.'});
    const q=await sql`SELECT status,license_expires_at,license_key,slot,model,last_seen,(fcm_token IS NOT NULL AND fcm_token<>'') AS push_configurado FROM devices WHERE android_id=${aid} LIMIT 1`;
    if(!q.rows[0]) return json(res,200,{ok:true,status:'nao_registado'});
    const d=q.rows[0];
    let s=d.status;
    if(d.license_expires_at&&new Date(d.license_expires_at)<=new Date()&&s==='active'){
      s='expired';
      await sql`UPDATE devices SET status='expired' WHERE android_id=${aid}`;
    }
    return json(res,200,{ok:true,status:s,expiresAt:d.license_expires_at,licenseKey:d.license_key||'',slot:d.slot||null,model:d.model||'',lastSeen:d.last_seen||null,pushConfigurado:!!d.push_configurado});
  }catch(e){return json(res,500,{ok:false,message:e.message})}
};
