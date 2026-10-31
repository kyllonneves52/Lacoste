const {runMigrations}=require('../lib/migrate');
module.exports=async(req,res)=>{
  if(req.query.key!=='lacoste123') return res.status(401).json({error:'sem key'});
  try{return res.json(await runMigrations());}
  catch(e){console.error(e);return res.status(500).json({ok:false,error:e.message});}
};
