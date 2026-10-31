const {sql}=require('../../../db');
const {json,body,id}=require('../../../common');
const {notifyDevice}=require('../../../push');
const LIMITE=10240;
module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{ok:false,message:'Método não permitido.'});
 try{
  const aid=String(req.headers['x-android-id']||'').trim(),tok=String(req.headers['x-app-token']||'').trim();
  const d=(await sql`SELECT android_id,token,status,license_expires_at,fcm_token FROM devices WHERE android_id=${aid} LIMIT 1`).rows[0];
  if(!d||!aid||!tok||tok!==d.token||d.status!=='active'||(d.license_expires_at&&new Date(d.license_expires_at)<=new Date()))return json(res,403,{ok:false,message:'Dispositivo Lacoste Auto não autorizado ou licença expirada.'});
  const b=await body(req);const numero=String(b.numero||'').replace(/\D/g,'');const ref=String(b.pagamentoId||'').trim();const valor=Number(b.valorPagamento);const mb=Number(b.quantidadeMB);const sender=String(b.senderPhone||'').trim();const groupRequested=String(b.groupId||'').trim();
  if(!/^8[4-7]\d{7}$/.test(numero)||!ref||!Number.isFinite(valor)||valor<=0||!Number.isFinite(mb)||mb<=0||!sender)return json(res,400,{ok:false,message:'Número, referência, valor, pacote ou remetente inválido.'});
  const duplicate=(await sql`SELECT id,status FROM orders WHERE UPPER(REPLACE(payment_id,'.',''))=UPPER(REPLACE(${ref},'.','')) LIMIT 1`).rows[0];
  if(duplicate)return json(res,409,{ok:false,message:'Esta referência já foi submetida.',pedidoId:duplicate.id,status:duplicate.status});
  let groups=(await sql`SELECT g.group_id,g.android_id FROM bot_group_devices g WHERE g.android_id=${aid} AND g.active=TRUE`).rows;
  if(groupRequested)groups=groups.filter(g=>g.group_id===groupRequested);
  if(groups.length!==1)return json(res,409,{ok:false,message:groups.length===0?'Não existe grupo de vendas associado a este dispositivo. Associa o grupo no servidor e configura o mesmo ID no app.':'Este dispositivo tem vários grupos associados. Preenche o ID do grupo no app para escolher o correto.'});
  const groupId=groups[0].group_id;
  const cfg=(await sql`SELECT mode,verification_enabled,verification_device_id FROM payment_verification_configs WHERE group_id=${groupId} LIMIT 1`).rows[0];
  const verificationEnabled=cfg&&(cfg.verification_enabled===true||Number(cfg.verification_enabled)===1||String(cfg.verification_enabled).toLowerCase()==='true');
  if(!cfg||!verificationEnabled||!cfg.verification_device_id||!['voda','emola','todos','all'].includes(String(cfg.mode||'').toLowerCase()))return json(res,409,{ok:false,message:'A verificação de pagamento por SMS não está ativa ou não há dispositivo LC Verification associado. Nenhum MB foi enviado.'});
  const vd=(await sql`SELECT id,status,fcm_token FROM verification_devices WHERE id=${cfg.verification_device_id} LIMIT 1`).rows[0];
  if(!vd||vd.status!=='active')return json(res,409,{ok:false,message:'O dispositivo LC Verification não está ativo.'});
  const expectedProvider=['voda','vodacom','mpesa'].includes(String(cfg.mode).toLowerCase())?'voda':['emola','movitel'].includes(String(cfg.mode).toLowerCase())?'emola':'todos';
  const parent=id('SMS');const parts=Math.ceil(mb/LIMITE);let remaining=mb;let first=null;
  for(let i=1;i<=parts;i++){
   const q=Math.min(remaining,LIMITE);remaining-=q;const oid=parts===1?parent:`${parent}-P${i}`;if(!first)first=oid;
   await sql`INSERT INTO orders(id,type,number,quantity_mb,value_mt,payment_id,payment_date,payment_time,test_mode,status,device_android_id,bot_group_id,source,parent_order_id,part_number,total_parts) VALUES(${oid},'megas',${numero},${q},${valor},${ref},'', '',FALSE,'waiting_verification',${aid},${groupId},'sms',${parts>1?parent:null},${i},${parts})`;
   await sql`INSERT INTO payment_verifications(id,order_id,group_id,reference,expected_provider,provider,operator,expected_payment_id,amount_mt,expected_amount,expected_date,expected_time,status,expires_at,verification_device_id) VALUES(${id('VER')},${oid},${groupId},${ref},${expectedProvider},${expectedProvider},${expectedProvider},${ref},${valor},${valor},'','', 'pending',NOW()+INTERVAL '10 minutes',${vd.id})`;
  }
  // A matching receipt may already have arrived on LC Verification before this customer's SMS.
  const inbox=(await sql`SELECT id,provider,sms_text,sms_sender FROM verification_inbox WHERE matched_at IS NULL AND expires_at>NOW() AND UPPER(REPLACE(payment_id,'.',''))=UPPER(REPLACE(${ref},'.','')) AND ABS(COALESCE(amount_mt,0)-${valor})<0.05 AND (${expectedProvider}='todos' OR provider='todos' OR provider=${expectedProvider}) ORDER BY received_at ASC LIMIT 1`).rows[0];
  let pushResultado={sent:false,reason:'push_not_attempted'};
  if(inbox){
   await sql`UPDATE payment_verifications SET status='verified',provider=${inbox.provider},sms_text=${inbox.sms_text},sms_sender=${inbox.sms_sender},received_at=NOW(),verified_at=NOW(),updated_at=NOW() WHERE order_id IN (SELECT id FROM orders WHERE id=${parent} OR parent_order_id=${parent}) AND status='pending'`;
   await sql`UPDATE orders SET status='pending',source='lc_verification' WHERE (id=${parent} OR parent_order_id=${parent}) AND status='waiting_verification'`;
   await sql`UPDATE verification_inbox SET matched_at=NOW() WHERE id=${inbox.id}`;
   pushResultado=await notifyDevice(d.fcm_token,{type:'NEW_ORDER',pedidoId:parent,androidId:aid,paymentVerified:'true'});
  } else {
   pushResultado=await notifyDevice(vd.fcm_token,{type:'NEW_PAYMENT_VERIFICATION',pedidoId:parent,paymentId:ref,valueMT:String(valor),paymentProvider:cfg.mode,deadline:new Date(Date.now()+600000).toISOString()});
  }
  return json(res,200,{ok:true,pedidoId:parent,status:inbox?'pending':'waiting_verification',partes:parts,verificationRequired:true,pushEnviado:!!pushResultado.sent,pushDetalhe:pushResultado.sent?{messageId:pushResultado.messageId,attempts:pushResultado.attempts}:{reason:pushResultado.reason,message:pushResultado.message,retryable:pushResultado.retryable,invalidToken:pushResultado.invalidToken,attempts:pushResultado.attempts},message:inbox?'Pagamento validado; pedido encaminhado para a fila.':'Pedido registado. A aguardar validação do pagamento pelo LC Verification.'});
 }catch(e){console.error('SMS ORDER ERROR',e);return json(res,500,{ok:false,message:e.message||'Erro interno.'});}
};
