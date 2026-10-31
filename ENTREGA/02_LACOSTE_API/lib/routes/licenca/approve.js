const {sql}=require('../../db');
const {json,adminOk,body,token}=require('../../common');

const MAX_DISPOSITIVOS_POR_ALUGUEL=20;

module.exports=async(req,res)=>{
  if(req.method!=='POST'||!adminOk(req)) return json(res,403,{ok:false,message:'Não autorizado.'});
  try{
    const b=await body(req);
    const days=Math.max(1,Math.min(3650,Number(b.days||30)));
    const q=await sql`SELECT * FROM license_requests WHERE id=${String(b.requestId)} LIMIT 1`;
    const r=q.rows[0];
    if(!r) return json(res,404,{ok:false,message:'Pedido não encontrado.'});

    const used=(await sql`
      SELECT COUNT(*)::int AS n FROM devices
      WHERE license_key=${r.license_key}
        AND status='active'
        AND android_id<>${r.android_id}
        AND license_expires_at IS NOT NULL
        AND license_expires_at>NOW()
    `).rows[0]?.n || 0;
    if(used>=MAX_DISPOSITIVOS_POR_ALUGUEL) {
      return json(res,409,{ok:false,message:`Este aluguel já possui ${MAX_DISPOSITIVOS_POR_ALUGUEL} dispositivos ativos.`});
    }

    const slotRow=await sql`
      SELECT slot FROM devices
      WHERE license_key=${r.license_key} AND slot IS NOT NULL
      ORDER BY slot
    `;
    const slots=new Set(slotRow.rows.map(x=>Number(x.slot)));
    let slot=null;
    for(let i=1;i<=MAX_DISPOSITIVOS_POR_ALUGUEL;i++){if(!slots.has(i)){slot=i;break;}}
    if(!slot) return json(res,409,{ok:false,message:'Não há vaga de dispositivo neste aluguel.'});

    const t=token();
    const expires=new Date(Date.now()+days*86400000);
    await sql`
      UPDATE license_requests SET
        status='approved',days=${days},approved_at=NOW(),expires_at=${expires.toISOString()},
        device_token=${t},rejection_reason=NULL
      WHERE id=${r.id}
    `;
    await sql`
      UPDATE devices SET
        status='active',token=${t},device_token=${t},license_expires_at=${expires.toISOString()},
        license_request_id=${r.id},license_key=${r.license_key},slot=${slot}
      WHERE android_id=${r.android_id}
    `;

    return json(res,200,{ok:true,status:'approved',requestId:r.id,days,expiresAt:expires.toISOString(),deviceToken:t,slot});
  }catch(e){
    console.error(e);
    return json(res,500,{ok:false,message:e.message});
  }
};
