const {sql}=require('../../db');
const {json,body,adminOk}=require('../../common');

module.exports=async(req,res)=>{
  if(!adminOk(req)) return json(res,403,{ok:false,message:'Não autorizado.'});
  if(req.method!=='POST') return json(res,405,{ok:false,message:'Método não permitido.'});
  try{
    const b=await body(req);
    const groupId=String(b.groupId||'').trim();
    const androidId=String(b.androidId||'').trim();
    if(!groupId || !groupId.endsWith('@g.us')) return json(res,400,{ok:false,message:'ID do grupo WhatsApp inválido. Deve terminar em @g.us.'});
    if(!androidId) return json(res,400,{ok:false,message:'Android ID obrigatório.'});

    const d=(await sql`
      SELECT android_id,model,status,slot,license_key,license_expires_at,fcm_token,last_seen,device_role,
             (license_key IS NOT NULL AND license_key <> '' AND (license_expires_at IS NULL OR license_expires_at > NOW())) AS license_valid
      FROM devices
      WHERE android_id=${androidId}
      LIMIT 1
    `).rows[0];

    if(!d) return json(res,404,{ok:false,message:'Dispositivo não encontrado. Abra/registe o APK primeiro.'});
    if(String(d.device_role||'transfer')==='verification') return json(res,400,{ok:false,message:'Este Android ID pertence ao LC Verification, não ao Lacoste Auto.'});

    const podeAssociar = d.status==='active' || d.license_valid === true;
    if(!podeAssociar){
      return json(res,400,{
        ok:false,
        message:'Dispositivo não está ativo ou licença expirada.',
        detail:{status:d.status,license_key:d.license_key||null,license_expires_at:d.license_expires_at||null}
      });
    }

    if(d.status!=='active' && d.license_valid){
      await sql`UPDATE devices SET status='active' WHERE android_id=${androidId}`;
      d.status='active';
    }

    await sql`
      INSERT INTO bot_group_devices(group_id,android_id,active,updated_at)
      VALUES(${groupId},${androidId},TRUE,NOW())
      ON CONFLICT(group_id) DO UPDATE SET android_id=EXCLUDED.android_id,active=TRUE,updated_at=NOW()
    `;

    return json(res,200,{ok:true,message:'Grupo associado ao dispositivo.',groupId,device:{...d,fcmConfigured:!!(d.fcm_token&&d.fcm_token.trim())}});
  }catch(e){
    console.error(e);
    return json(res,500,{ok:false,message:e.message});
  }
};
