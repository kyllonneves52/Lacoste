const {sql}=require('../../db');
const {json,adminOk}=require('../../common');
module.exports=async(req,res)=>{
  if(!adminOk(req))return json(res,403,{ok:false,message:'Não autorizado.'});
  try{
    const q=await sql`
      SELECT l.id,l.license_key,l.android_id,l.model,l.status,l.days,l.requested_at,l.approved_at,l.expires_at,l.rejection_reason,
             d.slot,d.status AS device_status,d.last_seen
      FROM license_requests l
      LEFT JOIN devices d ON d.android_id=l.android_id
      ORDER BY l.requested_at DESC LIMIT 200`;
    return json(res,200,{ok:true,licenses:q.rows});
  }catch(e){return json(res,500,{ok:false,message:e.message})}
};
