const {sql}=require('../../db');
const {json,body,adminOk}=require('../../common');
module.exports=async(req,res)=>{
  if(!adminOk(req)) return json(res,403,{ok:false,message:'Não autorizado.'});
  if(req.method!=='POST') return json(res,405,{ok:false,message:'Método não permitido.'});
  try{
    const b=await body(req); const groupId=String(b.groupId||'').trim();
    if(!groupId)return json(res,400,{ok:false,message:'groupId obrigatório.'});
    await sql`UPDATE bot_group_devices SET active=FALSE,updated_at=NOW() WHERE group_id=${groupId}`;
    return json(res,200,{ok:true,message:'Associação removida.'});
  }catch(e){return json(res,500,{ok:false,message:e.message})}
};
