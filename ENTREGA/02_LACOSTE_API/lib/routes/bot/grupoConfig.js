const {sql}=require('../../db');
const {json,body,normalizePaymentProvider}=require('../../common');

function botOk(req){
  return String(req.headers['x-bot-token']||'')===String(process.env.LACOSTE_BOT_TOKEN||'');
}

module.exports=async(req,res)=>{
  if(!botOk(req)) return json(res,403,{ok:false,message:'Bot não autorizado.'});
  if(req.method!=='POST') return json(res,405,{ok:false});
  try{
    const b=await body(req);
    const g=String(b.groupId||'').trim();
    if(!g.endsWith('@g.us')) return json(res,400,{ok:false,message:'groupId inválido.'});
    const explicitlyOff = b.smsVerificationActive === false || String(b.smsProvider||b.mode||b.provider||'').toLowerCase() === 'off';
    const m=explicitlyOff ? 'off' : normalizePaymentProvider(b.smsProvider||b.mode||b.provider||'todos');
    const en=!explicitlyOff && (b.smsVerificationActive===true || m!=='off');
    let v=String(b.verificationDeviceId||'').trim()||null;
    if(!v){
      const aid=String(b.androidId||'').trim();
      if(aid){
        const d=(await sql`SELECT id FROM verification_devices WHERE mb_android_id=${aid} AND status='active' LIMIT 1`).rows[0];
        if(d) v=d.id;
      }
      if(!v){
        const linked=(await sql`SELECT g.android_id FROM bot_group_devices g WHERE g.group_id=${g} AND g.active=TRUE LIMIT 1`).rows[0];
        if(linked){
          const d=(await sql`SELECT id FROM verification_devices WHERE mb_android_id=${linked.android_id} AND status='active' LIMIT 1`).rows[0];
          if(d) v=d.id;
        }
      }
    }
    await sql`
      INSERT INTO payment_verification_configs(group_id,mode,verification_enabled,verification_device_id,updated_at)
      VALUES(${g},${m},${en && m!=='off'},${v},NOW())
      ON CONFLICT(group_id) DO UPDATE SET
        mode=EXCLUDED.mode,
        verification_enabled=EXCLUDED.verification_enabled,
        verification_device_id=COALESCE(EXCLUDED.verification_device_id,payment_verification_configs.verification_device_id),
        updated_at=NOW()
    `;
    return json(res,200,{ok:true,groupId:g,mode:m,verificationEnabled:en && m!=='off',verificationDeviceId:v});
  }catch(e){
    return json(res,500,{ok:false,message:e.message});
  }
};
