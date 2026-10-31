const {sql}=require('../../db');
const {json,body}=require('../../common');

module.exports=async(req,res)=>{
  if(req.method!=='POST')return json(res,405,{ok:false,message:'Método não permitido.'});
  try{
    const b=await body(req);
    const deviceId=String(b.deviceId||b.androidId||req.headers['x-verification-device']||'').trim();
    const tok=String(b.token||req.headers['x-app-token']||req.headers['x-verification-token']||'').trim();
    const mbAndroidId=String(b.mbAndroidId||b.androidIdMb||b.linkedAndroidId||'').trim();
    const fcm=String(b.fcmToken||'').trim()||null;
    if(!deviceId||!mbAndroidId)return json(res,400,{ok:false,message:'deviceId do SMS e androidId do mainMB são obrigatórios.'});

    const mb=(await sql`SELECT android_id,status FROM devices WHERE android_id=${mbAndroidId} LIMIT 1`).rows[0];
    if(!mb)return json(res,404,{ok:false,message:'Android ID do mainMB não encontrado. Abre primeiro o app de MB nesse telemóvel.'});

    let vd=null;
    if(tok){
      vd=(await sql`SELECT * FROM verification_devices WHERE (id=${deviceId} OR device_id=${deviceId}) AND token=${tok} LIMIT 1`).rows[0];
    }
    if(!vd){
      vd=(await sql`SELECT * FROM verification_devices WHERE device_id=${deviceId} OR id=${deviceId} LIMIT 1`).rows[0];
    }
    if(!vd)return json(res,403,{ok:false,message:'Dispositivo SMS ainda não registado. Activa a licença no mainSMS primeiro.'});

    await sql`
      UPDATE verification_devices
      SET mb_android_id=${mbAndroidId},
          fcm_token=COALESCE(${fcm},fcm_token),
          status='active',
          last_seen=NOW(),
          updated_at=NOW()
      WHERE id=${vd.id}
    `;

    const grupos=(await sql`SELECT group_id FROM bot_group_devices WHERE android_id=${mbAndroidId} AND active=TRUE`).rows;
    for(const g of grupos){
      const cfg=(await sql`SELECT mode,verification_enabled FROM payment_verification_configs WHERE group_id=${g.group_id} LIMIT 1`).rows[0];
      const mode=cfg?.mode||'todos';
      const en=cfg?cfg.verification_enabled:true;
      await sql`
        INSERT INTO payment_verification_configs(group_id,mode,verification_enabled,verification_device_id,updated_at)
        VALUES(${g.group_id},${mode},${en},${vd.id},NOW())
        ON CONFLICT(group_id) DO UPDATE SET
          verification_device_id=EXCLUDED.verification_device_id,
          updated_at=NOW()
      `;
    }

    return json(res,200,{
      ok:true,
      verificationDeviceId:vd.id,
      mbAndroidId,
      gruposAssociados:grupos.map(x=>x.group_id),
      message:'mainSMS associado ao mainMB. Os grupos deste Android ID passam a verificar SMS neste telemóvel.'
    });
  }catch(e){
    console.error(e);
    return json(res,500,{ok:false,message:e.message});
  }
};
