const {sql}=require('../../db');
const {json}=require('../../common');

function botOk(req){
  return String(req.headers['x-bot-token']||'') === String(process.env.LACOSTE_BOT_TOKEN||'');
}

module.exports=async(req,res)=>{
  if(!botOk(req)) return json(res,403,{ok:false,message:'Bot não autorizado.'});
  if(req.method!=='POST') return json(res,405,{ok:false,message:'Método não permitido.'});
  try{
    const q=await sql`
      SELECT g.group_id,g.android_id,g.active,g.updated_at,
             d.model,d.status,d.slot,d.license_key,d.license_expires_at,
             d.last_seen,
             (d.fcm_token IS NOT NULL AND d.fcm_token<>'') AS push_configurado
      FROM bot_group_devices g
      JOIN devices d ON d.android_id=g.android_id
      WHERE g.active=TRUE
      ORDER BY g.updated_at DESC
      LIMIT 500`;
    return json(res,200,{ok:true,groups:q.rows});
  }catch(e){
    return json(res,500,{ok:false,message:e.message});
  }
};
