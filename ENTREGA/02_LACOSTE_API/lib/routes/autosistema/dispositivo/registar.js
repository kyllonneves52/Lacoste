const {sql}=require('../../../db');
const {json,body}=require('../../../common');

module.exports=async(req,res)=>{
  if(req.method!=='POST') return json(res,405,{ok:false});
  try{
    const b=await body(req);
    const aid=String(b.androidId||'').trim();
    const fcmToken=String(b.fcmToken||'').trim();
    if(!aid) return json(res,400,{ok:false,message:'Android ID obrigatório'});
    const q=await sql`SELECT * FROM devices WHERE android_id=${aid} LIMIT 1`;
    if(!q.rows[0]){
      await sql`INSERT INTO devices(android_id,model,status,fcm_token,fcm_updated_at,last_seen) VALUES(${aid},${String(b.modelo||'')},'pending',${fcmToken||null},${fcmToken?new Date():null},NOW())`;
      return json(res,200,{ok:true,status:'pending',slot:null});
    }
    const d=q.rows[0];
    if(fcmToken) {
      await sql`UPDATE devices SET fcm_token=${fcmToken},fcm_updated_at=NOW(),last_seen=NOW(),model=COALESCE(NULLIF(${String(b.modelo||'')},''),model) WHERE android_id=${aid}`;
    } else {
      await sql`UPDATE devices SET last_seen=NOW(),model=COALESCE(NULLIF(${String(b.modelo||'')},''),model) WHERE android_id=${aid}`;
    }
    if(d.license_expires_at && new Date(d.license_expires_at)<=new Date() && d.status==='active'){
      await sql`UPDATE devices SET status='expired' WHERE android_id=${aid}`;
      d.status='expired';
    }
    return json(res,200,{ok:true,status:d.status,token:d.token||'',slot:d.slot||null,expiresAt:d.license_expires_at||null,licenseKey:d.license_key||'',fcmConfigured:!!(d.fcm_token||fcmToken)});
  }catch(e){return json(res,500,{ok:false,message:e.message})}
};
