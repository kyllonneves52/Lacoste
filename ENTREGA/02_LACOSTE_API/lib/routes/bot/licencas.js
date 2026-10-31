const {sql}=require('../../db');
const {json,body}=require('../../common');

function botOk(req){
  return String(req.headers['x-bot-token']||'') === String(process.env.LACOSTE_BOT_TOKEN||'');
}

module.exports.listar=async(req,res)=>{
  if(!botOk(req)) return json(res,403,{ok:false,message:'Bot não autorizado.'});
  if(req.method!=='POST') return json(res,405,{ok:false,message:'Método não permitido.'});
  try{
    const q=await sql`
      SELECT l.id,l.license_key,l.android_id,l.model,l.status,l.days,
             l.requested_at,l.approved_at,l.expires_at,l.rejection_reason,
             d.slot,d.status AS device_status,d.last_seen
      FROM license_requests l
      LEFT JOIN devices d ON d.android_id=l.android_id
      ORDER BY
        CASE WHEN l.status='pending' THEN 0 ELSE 1 END,
        l.requested_at DESC
      LIMIT 200`;
    return json(res,200,{ok:true,licenses:q.rows});
  }catch(e){
    return json(res,500,{ok:false,message:e.message});
  }
};

module.exports.aprovar=async(req,res)=>{
  if(!botOk(req)) return json(res,403,{ok:false,message:'Bot não autorizado.'});
  if(req.method!=='POST') return json(res,405,{ok:false,message:'Método não permitido.'});
  try{
    const b=await body(req);
    const requestId=String(b.requestId||'').trim();
    const days=Math.max(1,Math.min(3650,Number(b.days||30)));
    if(!requestId)return json(res,400,{ok:false,message:'requestId obrigatório.'});
    if(!Number.isFinite(days))return json(res,400,{ok:false,message:'Dias inválidos.'});
    // Aceita id exacto, prefixo do id, license_key ou android_id (painel vs bot)
    let r=(await sql`SELECT * FROM license_requests WHERE id=${requestId} LIMIT 1`).rows[0];
    if(!r){
      r=(await sql`SELECT * FROM license_requests WHERE id::text ILIKE ${requestId+'%'} ORDER BY requested_at DESC LIMIT 1`).rows[0];
    }
    if(!r){
      r=(await sql`SELECT * FROM license_requests WHERE license_key=${requestId} AND status='pending' ORDER BY requested_at DESC LIMIT 1`).rows[0];
    }
    if(!r){
      r=(await sql`SELECT * FROM license_requests WHERE android_id=${requestId} AND status='pending' ORDER BY requested_at DESC LIMIT 1`).rows[0];
    }
    if(!r)return json(res,404,{ok:false,message:'Pedido de licença não encontrado. Use .licencas e copie o ID exacto do pedido.'});
    if(r.status==='approved')return json(res,409,{ok:false,message:'Este pedido já foi aprovado.'});
    if(r.status==='rejected')return json(res,409,{ok:false,message:'Este pedido já foi rejeitado.'});
    const crypto=require('crypto');
    const t=crypto.randomBytes(24).toString('hex');
    const expires=new Date(Date.now()+days*86400000);
    const role=String(r.device_role||'auto').toLowerCase();
    if(role==='verification'){
      const active=(await sql`SELECT COUNT(*)::int AS n FROM verification_devices WHERE license_key=${r.license_key} AND status='active'`).rows[0]?.n||0;
      if(Number(active)>=1)return json(res,409,{ok:false,message:'Este aluguel já possui um LC Verification ativo.'});
      await sql`UPDATE license_requests SET status='approved',days=${days},approved_at=NOW(),expires_at=${expires.toISOString()},device_token=${t},rejection_reason=NULL WHERE id=${r.id}`;
      const did=`LC-${r.android_id}`;
      await sql`INSERT INTO verification_devices(id,platform,device_id,token,status,license_key,last_seen,updated_at) VALUES(${did},'android',${r.android_id},${t},'active',${r.license_key},NOW(),NOW()) ON CONFLICT(platform,device_id) DO UPDATE SET token=${t},status='active',license_key=${r.license_key},last_seen=NOW(),updated_at=NOW()`;
      return json(res,200,{ok:true,status:'approved',requestId:r.id,days,expiresAt:expires.toISOString(),deviceToken:t,slot:null,deviceRole:'verification'});
    }
    const used=(await sql`SELECT COUNT(*)::int AS n FROM devices WHERE license_key=${r.license_key} AND status='active' AND android_id<>${r.android_id} AND license_expires_at IS NOT NULL AND license_expires_at>NOW()`).rows[0]?.n||0;
    if(Number(used)>=2)return json(res,409,{ok:false,message:'Este aluguel já possui 2 dispositivos Lacoste Auto ativos.'});
    // Slots ocupados apenas por outros dispositivos realmente ativos e com licença válida.
    // Registos antigos/expirados não devem bloquear a vaga 1 nem empurrar este aparelho para a 2.
    const slotRows=await sql`
      SELECT android_id,slot
      FROM devices
      WHERE license_key=${r.license_key}
        AND android_id<>${r.android_id}
        AND slot IS NOT NULL
        AND status='active'
        AND (license_expires_at IS NULL OR license_expires_at>NOW())
      ORDER BY slot
    `;
    const slots=new Set(slotRows.rows.map(x=>Number(x.slot)).filter(x=>x===1||x===2));
    const own=(await sql`SELECT slot FROM devices WHERE android_id=${r.android_id} AND license_key=${r.license_key} LIMIT 1`).rows[0];
    let slot=(own && [1,2].includes(Number(own.slot)) && !slots.has(Number(own.slot))) ? Number(own.slot) : null;
    if(!slot) for(let i=1;i<=2;i++) if(!slots.has(i)){slot=i;break;}
    if(!slot)return json(res,409,{ok:false,message:'Não há vaga de dispositivo Lacoste Auto neste aluguel.'});
    await sql`UPDATE license_requests SET status='approved',days=${days},approved_at=NOW(),expires_at=${expires.toISOString()},device_token=${t},rejection_reason=NULL WHERE id=${r.id}`;
    await sql`UPDATE devices SET status='active',token=${t},device_token=${t},license_expires_at=${expires.toISOString()},license_request_id=${r.id},license_key=${r.license_key},slot=${slot},device_role='transfer' WHERE android_id=${r.android_id}`;
    return json(res,200,{ok:true,status:'approved',requestId:r.id,days,expiresAt:expires.toISOString(),deviceToken:t,slot,deviceRole:'auto'});
  }catch(e){console.error(e);return json(res,500,{ok:false,message:e.message});}
};

module.exports.rejeitar=async(req,res)=>{
  if(!botOk(req)) return json(res,403,{ok:false,message:'Bot não autorizado.'});
  if(req.method!=='POST') return json(res,405,{ok:false,message:'Método não permitido.'});

  try{
    const b=await body(req);
    const requestId=String(b.requestId||'').trim();
    const reason=String(b.reason||'Rejeitado pelo gestor').trim();
    if(!requestId) return json(res,400,{ok:false,message:'requestId obrigatório.'});

    const q=await sql`
      UPDATE license_requests
      SET status='rejected',rejection_reason=${reason}
      WHERE id=${requestId} AND status='pending'
      RETURNING id`;

    if(!q.rows[0]) return json(res,404,{ok:false,message:'Pedido não encontrado ou já processado.'});
    return json(res,200,{ok:true,status:'rejected',requestId,reason});
  }catch(e){
    return json(res,500,{ok:false,message:e.message});
  }
};
