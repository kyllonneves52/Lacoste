const {sql}=require('../../../db');const {json,body,id}=require('../../../common');const {notifyDevice}=require('../../../push');
const LIMITE=10240;
module.exports=async(req,res)=>{if(req.method!=='POST')return json(res,405,{ok:false,message:'Método não permitido.'});try{
 if(String(req.headers['x-bot-token']||'')!==String(process.env.LACOSTE_BOT_TOKEN||''))return json(res,403,{ok:false,message:'Bot não autorizado.'});
 const b=await body(req);const numero=String(b.numero||'').replace(/\D/g,'');const tipo=String(b.tipo||'megas').toLowerCase();const mb=Number(b.quantidadeMB||0);const groupId=String(b.groupId||'').trim();
 if(!/^8[4-7]\d{7}$/.test(numero)||!groupId.endsWith('@g.us')||(tipo!=='credito'&&(!Number.isFinite(mb)||mb<=0)))return json(res,400,{ok:false,message:'Dados inválidos.'});
 const g=(await sql`SELECT g.android_id,d.status,d.license_expires_at,d.fcm_token FROM bot_group_devices g JOIN devices d ON d.android_id=g.android_id WHERE g.group_id=${groupId} AND g.active=TRUE LIMIT 1`).rows[0];
 if(!g)return json(res,400,{ok:false,message:'Este grupo não tem dispositivo associado.'});
 if(g.status!=='active'||(g.license_expires_at&&new Date(g.license_expires_at)<=new Date()))return json(res,400,{ok:false,message:'Dispositivo inativo ou licença expirada.'});
 const parent=id('PED'); const partes=tipo==='megas'?Math.ceil(mb/LIMITE):1; let restante=mb;
 const cfg=(await sql`SELECT mode,verification_enabled,verification_device_id FROM payment_verification_configs WHERE group_id=${groupId} LIMIT 1`).rows[0];
 const requestedVerification = b.smsVerificationActive === false ? false : (b.smsVerificationActive === true ? true : null);
 const verificar=String(b.modoPagamento||'').toLowerCase()!=='manual' && (requestedVerification===false ? false : requestedVerification===true ? true : !!cfg?.verification_enabled && ['voda','emola','todos'].includes(String(cfg.mode||'')));
 const paymentRef=String(b.pagamentoId||b.paymentId||'').trim();
 const paymentAmount=Number(b.valorPagamento??b.valorMT??0);
 if(verificar && (!paymentRef || !Number.isFinite(paymentAmount) || paymentAmount<=0)) return json(res,400,{ok:false,message:'Comprovativo sem referência/ID ou valor válido.'});
 if(verificar && !cfg.verification_device_id) return json(res,409,{ok:false,message:'LC Verification está ativo, mas nenhum dispositivo de verificação foi associado ao grupo.'});
 let verifier=null;
 if(verificar){ verifier=(await sql`SELECT id,status,fcm_token,apns_token FROM verification_devices WHERE id=${cfg.verification_device_id} LIMIT 1`).rows[0]; if(!verifier||verifier.status!=='active') return json(res,409,{ok:false,message:'Dispositivo LC Verification não está ativo.'}); }
 for(let i=1;i<=partes;i++){const q=tipo==='megas'?Math.min(restante,LIMITE):0; if(tipo==='megas')restante-=q; const oid=partes===1?parent:`${parent}-P${i}`;
 await sql`INSERT INTO orders(id,type,number,quantity_mb,value_mt,payment_id,payment_date,payment_time,test_mode,status,device_android_id,bot_group_id,source,parent_order_id,part_number,total_parts) VALUES(${oid},${tipo==='credito'?'credito':'megas'},${numero},${q},${tipo==='credito'?Number(b.valorMT||b.valorPagamento||0):Number(b.valorPagamento||b.valorMT||0)||null},${String(b.pagamentoId||b.paymentId||'')},${String(b.pagamentoDate||b.paymentDate||'')},${String(b.pagamentoTime||b.paymentTime||'')},${String(b.modoPagamento||'')==='manual'},${verificar?'waiting_verification':'pending'},${g.android_id},${groupId},${String(b.origem||'bot')},${partes>1?parent:null},${i},${partes})`;
 if(verificar){ await sql`INSERT INTO payment_verifications(id,order_id,group_id,reference,expected_provider,provider,operator,expected_payment_id,amount_mt,expected_amount,expected_date,expected_time,status,expires_at,verification_device_id) VALUES(${id('VER')},${oid},${groupId},${paymentRef},${(['voda','vodacom','mpesa'].includes(String(cfg.mode||'').toLowerCase())?'voda':(['emola','movitel'].includes(String(cfg.mode||'').toLowerCase())?'emola':'todos'))},${(['voda','vodacom','mpesa'].includes(String(cfg.mode||'').toLowerCase())?'voda':(['emola','movitel'].includes(String(cfg.mode||'').toLowerCase())?'emola':'todos'))},${(['voda','vodacom','mpesa'].includes(String(cfg.mode||'').toLowerCase())?'voda':(['emola','movitel'].includes(String(cfg.mode||'').toLowerCase())?'emola':'todos'))},${paymentRef},${paymentAmount},${paymentAmount},${String(b.pagamentoDate||b.paymentDate||'')},${String(b.pagamentoTime||b.paymentTime||'')},'pending',NOW()+INTERVAL '10 minutes',${cfg.verification_device_id})`; 
   const inbox=(await sql`SELECT id,provider,sms_text,sms_sender FROM verification_inbox
      WHERE matched_at IS NULL AND expires_at>NOW()
        AND UPPER(REPLACE(payment_id,'.',''))=UPPER(REPLACE(${paymentRef},'.',''))
        AND ABS(COALESCE(amount_mt,0)-${paymentAmount})<0.05
        AND (${String(cfg.mode||'todos')}='todos' OR provider='todos' OR provider=${String(cfg.mode||'todos')})
      ORDER BY received_at ASC LIMIT 1`).rows[0];
   if(inbox){
     await sql`UPDATE payment_verifications SET status='verified',provider=${inbox.provider},sms_text=${inbox.sms_text},sms_sender=${inbox.sms_sender},received_at=NOW(),verified_at=NOW(),updated_at=NOW() WHERE order_id=${oid} AND status='pending'`;
     await sql`UPDATE orders SET status='pending',source='lc_verification' WHERE id=${oid} AND status='waiting_verification'`;
     await sql`UPDATE verification_inbox SET matched_at=NOW() WHERE id=${inbox.id}`;
   }
 } }
 let push={sent:false};
 if(verificar){
   const alreadyVerified=(await sql`SELECT COUNT(*) AS n FROM payment_verifications pv JOIN orders o ON o.id=pv.order_id WHERE (o.id=${parent} OR o.parent_order_id=${parent}) AND pv.status='verified'`).rows[0];
   if(Number(alreadyVerified?.n||0)>0) push=await notifyDevice(g.fcm_token,{type:'NEW_ORDER',pedidoId:parent,androidId:g.android_id,paymentVerified:'true'});
   else push=await notifyDevice(verifier?.fcm_token,{type:'NEW_PAYMENT_VERIFICATION',pedidoId:parent,paymentId:String(b.pagamentoId||b.paymentId||''),valueMT:String(Number(b.valorPagamento||b.valorMT||0)||0),paymentProvider:cfg.mode,deadline:new Date(Date.now()+600000).toISOString()});
 } else { push=await notifyDevice(g.fcm_token,{type:'NEW_ORDER',pedidoId:parent,androidId:g.android_id}); }
 return json(res,200,{ok:true,pedidoId:parent,status:verificar?'waiting_verification':'pending',partes,limiteMB:LIMITE,verificacaoSMS:verificar,modoVerificacao:verificar?cfg.mode:'off',pushEnviado:push.sent,pushDetalhe:push.sent?{messageId:push.messageId,attempts:push.attempts}:{reason:push.reason,message:push.message,retryable:push.retryable,invalidToken:push.invalidToken,attempts:push.attempts}});
}catch(e){console.error(e);return json(res,500,{ok:false,message:e.message})}};