const crypto=require('crypto');
const {sql}=require('../../db');
const {json,body,id}=require('../../common');

module.exports=async(req,res)=>{
  if(req.method!=='POST')return json(res,405,{ok:false});
  try{
    const b=await body(req);
    const androidId=String(b.androidId||b.deviceId||'').trim();
    const fcm=String(b.fcmToken||'')||null;
    const token=String(req.headers['x-app-token']||b.token||'').trim();
    if(!androidId)return json(res,400,{ok:false,message:'androidId obrigatório.'});

    let old=(await sql`SELECT * FROM verification_devices WHERE device_id=${androidId} OR id=${androidId} LIMIT 1`).rows[0];
    const did=old?.id||id('LCV');
    const tok=old?.token||token||crypto.randomBytes(32).toString('hex');

    await sql`
      INSERT INTO verification_devices(id,platform,device_id,token,fcm_token,status,last_seen,updated_at)
      VALUES(${did},'android',${androidId},${tok},${fcm},'active',NOW(),NOW())
      ON CONFLICT(platform,device_id) DO UPDATE SET
        fcm_token=COALESCE(${fcm},verification_devices.fcm_token),
        status='active',
        last_seen=NOW(),
        updated_at=NOW()
    `;

    return json(res,200,{ok:true,deviceId:did,verificationToken:tok,status:'active'});
  }catch(e){
    console.error(e);
    return json(res,500,{ok:false,message:e.message});
  }
};
