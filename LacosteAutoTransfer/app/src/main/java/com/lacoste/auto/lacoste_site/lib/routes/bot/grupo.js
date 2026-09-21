const {sql}=require('../../db');
const {json,body}=require('../../common');

function botOk(req){
  return String(req.headers['x-bot-token']||'')===String(process.env.LACOSTE_BOT_TOKEN||'');
}

async function getDevice(aid){
  return (await sql`
    SELECT android_id, token, status, license_key, slot, license_expires_at, fcm_token, device_role,
           (license_key IS NOT NULL AND license_key <> '' AND (license_expires_at IS NULL OR license_expires_at > NOW())) AS license_valid
    FROM devices
    WHERE android_id=${aid}
    LIMIT 1
  `).rows[0];
}

async function handler(req,res){
  if(!botOk(req)) return json(res,403,{ok:false,message:'Bot não autorizado.'});
  if(req.method!=='POST') return json(res,405,{ok:false});
  try{
    const b=await body(req);
    const groupId=String(b.groupId||'').trim();
    const androidId=String(b.androidId||'').trim();
    if(!groupId || !groupId.endsWith('@g.us')) return json(res,400,{ok:false,message:'groupId inválido.'});
    if(!androidId) return json(res,400,{ok:false,message:'androidId obrigatório.'});

    const d=await getDevice(androidId);
    if(!d) return json(res,404,{ok:false,message:'Dispositivo não encontrado.'});
    if(String(d.device_role||'transfer')==='verification') return json(res,400,{ok:false,message:'Este Android ID pertence ao LC Verification, não ao Lacoste Auto.'});

    // Aceita se status=active OU se tem licença válida (chave + data ok)
    const podeAssociar = d.status==='active' || d.license_valid === true;

    if(!podeAssociar){
      return json(res,400,{
        ok:false,
        message:'Dispositivo não está ativo ou licença expirada.',
        detail:{
          status:d.status,
          license_key:d.license_key||null,
          license_expires_at:d.license_expires_at||null,
          license_valid:!!d.license_valid
        }
      });
    }

    // Se tem licença válida mas status ficou errado (pending/expired), reativa
    if(d.status!=='active' && d.license_valid){
      await sql`UPDATE devices SET status='active' WHERE android_id=${androidId}`;
      d.status='active';
    }

    await sql`
      INSERT INTO bot_group_devices(group_id,android_id,active,updated_at)
      VALUES(${groupId},${androidId},TRUE,NOW())
      ON CONFLICT(group_id) DO UPDATE SET android_id=EXCLUDED.android_id,active=TRUE,updated_at=NOW()
    `;

    return json(res,200,{ok:true,groupId,androidId,slot:d.slot,status:d.status});
  }catch(e){
    return json(res,500,{ok:false,message:e.message});
  }
}

async function status(req,res){
  if(!botOk(req)) return json(res,403,{ok:false,message:'Bot não autorizado.'});
  if(req.method!=='POST') return json(res,405,{ok:false});
  try{
    const b=await body(req);
    const groupId=String(b.groupId||'').trim();
    if(!groupId) return json(res,400,{ok:false,message:'groupId obrigatório.'});
    const q=await sql`
      SELECT g.group_id,g.android_id,g.active,d.model,d.status,d.slot,d.license_expires_at,d.last_seen,
             (d.fcm_token IS NOT NULL AND d.fcm_token<>'') AS push_configurado
      FROM bot_group_devices g
      JOIN devices d ON d.android_id=g.android_id
      WHERE g.group_id=${groupId}
      LIMIT 1`;
    if(!q.rows[0]) return json(res,200,{ok:true,registado:false});
    return json(res,200,{ok:true,registado:true,grupo:q.rows[0]});
  }catch(e){
    return json(res,500,{ok:false,message:e.message});
  }
}

async function remove(req,res){
  if(!botOk(req)) return json(res,403,{ok:false,message:'Bot não autorizado.'});
  if(req.method!=='POST') return json(res,405,{ok:false});
  try{
    const b=await body(req);
    const groupId=String(b.groupId||'').trim();
    if(!groupId) return json(res,400,{ok:false,message:'groupId obrigatório.'});
    await sql`UPDATE bot_group_devices SET active=FALSE,updated_at=NOW() WHERE group_id=${groupId}`;
    return json(res,200,{ok:true});
  }catch(e){
    return json(res,500,{ok:false,message:e.message});
  }
}

module.exports={handler,status,remove};
