const {sql}=require('../../db');
const {json,id,body}=require('../../common');

const MAX_DISPOSITIVOS_POR_ALUGUEL = 20;

module.exports=async(req,res)=>{
  if(req.method!=='POST') return json(res,405,{ok:false,message:'Método não permitido'});
  try {
    const b=await body(req);
    const key=String(b.licenseKey||'').trim().toUpperCase();
    const aid=String(b.androidId||'').trim();
    const model=String(b.model||'').trim();
    const deviceRole=String(b.deviceRole||'auto').toLowerCase()==='verification'?'verification':'auto';
    if(!key||!aid) return json(res,400,{ok:false,message:'Chave e Android ID são obrigatórios.'});

    const existing=await sql`SELECT * FROM license_requests WHERE license_key=${key} AND android_id=${aid} ORDER BY requested_at DESC LIMIT 1`;
    const current=existing.rows[0];
    if(current && current.status==='approved' && current.expires_at && new Date(current.expires_at)>new Date()) {
      return json(res,200,{ok:true,status:'approved',requestId:current.id,expiresAt:current.expires_at,deviceToken:current.device_token,slot:await slotFor(key,aid)});
    }

    const activeCount=(await sql`
      SELECT COUNT(*)::int AS n
      FROM devices
      WHERE license_key=${key}
        AND status='active'
        AND license_expires_at IS NOT NULL
        AND license_expires_at>NOW()
    `).rows[0]?.n || 0;

    const pendingCount=(await sql`
      SELECT COUNT(*)::int AS n
      FROM license_requests
      WHERE license_key=${key} AND status='pending'
    `).rows[0]?.n || 0;

    const alreadyDevice=(await sql`
      SELECT android_id,status FROM devices WHERE license_key=${key} AND android_id=${aid} LIMIT 1
    `).rows[0];

    if(!alreadyDevice && activeCount + pendingCount >= MAX_DISPOSITIVOS_POR_ALUGUEL) {
      return json(res,409,{ok:false,message:`Este aluguel já atingiu o limite de ${MAX_DISPOSITIVOS_POR_ALUGUEL} dispositivos.`});
    }

    const rid=id('LIC');
    await sql`INSERT INTO license_requests(id,license_key,android_id,model,status,device_role) VALUES(${rid},${key},${aid},${model},'pending',${deviceRole})`;
    // Ao re-pedir (mesmo android_id com outra chave ou reativação), limpar slot/token
    // para evitar UNIQUE(license_key, slot) quando o slot antigo já está ocupado na nova chave.
    await sql`
      INSERT INTO devices(android_id,model,status,license_request_id,license_key,slot,token,device_token,license_expires_at)
      VALUES(${aid},${model},'pending',${rid},${key},NULL,NULL,NULL,NULL)
      ON CONFLICT(android_id) DO UPDATE SET
        model=EXCLUDED.model,
        status='pending',
        license_request_id=EXCLUDED.license_request_id,
        license_key=EXCLUDED.license_key,
        slot=NULL,
        token=NULL,
        device_token=NULL,
        license_expires_at=NULL
    `;

    return json(res,200,{ok:true,status:'pending',requestId:rid,slot:await nextSlot(key,aid),message:'Pedido enviado para aprovação.'});
  } catch(e) {
    console.error(e);
    return json(res,500,{ok:false,message:e.message});
  }
};

async function slotFor(key,aid){
  const q=await sql`SELECT slot FROM devices WHERE license_key=${key} AND android_id=${aid} LIMIT 1`;
  return q.rows[0]?.slot || null;
}

async function nextSlot(key,aid){
  const own=(await sql`SELECT slot FROM devices WHERE license_key=${key} AND android_id=${aid} LIMIT 1`).rows[0];
  const q=await sql`
    SELECT slot FROM devices
    WHERE license_key=${key}
      AND android_id<>${aid}
      AND slot IS NOT NULL
      AND status='active'
      AND (license_expires_at IS NULL OR license_expires_at>NOW())
    ORDER BY slot`;
  const used=new Set(q.rows.map(r=>Number(r.slot)).filter(x=>Number.isInteger(x)&&x>=1&&x<=MAX_DISPOSITIVOS_POR_ALUGUEL));
  if(own && Number.isInteger(Number(own.slot)) && Number(own.slot)>=1 && Number(own.slot)<=MAX_DISPOSITIVOS_POR_ALUGUEL && !used.has(Number(own.slot))) return Number(own.slot);
  for(let i=1;i<=MAX_DISPOSITIVOS_POR_ALUGUEL;i++) if(!used.has(i)) return i;
  return null;
}
