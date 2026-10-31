const crypto=require('crypto');
function json(res,status,data){res.status(status).setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));}
function id(prefix){return `${prefix}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*900000+100000)}`;}
function token(){return crypto.randomBytes(24).toString('hex');}
function adminOk(req){const supplied=String(req.headers['x-admin-password']||req.query?.password||'');const expected=String(process.env.ADMIN_PASSWORD||'');if(!supplied||!expected)return false;const a=Buffer.from(supplied),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function deviceAuth(req,row){const aid=req.headers['x-android-id'];const t=req.headers['x-app-token'];return row&&aid===row.android_id&&t===row.token;}
function body(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}})});}
function normalizePaymentProvider(value){const v=String(value||'').toLowerCase().replace(/[\s_-]+/g,'');if(v==='voda'||v==='vodacom'||v==='mpesa')return 'voda';if(v==='emola'||v==='movitel')return 'emola';if(v==='todos'||v==='all'||v==='sms')return 'todos';return 'off';}
// IMPORTANT: these parsers are for the RECEIPT sent by the customer. They extract
// the transaction reference + amount only. They never mean that money was received.
function detectOutgoingPaymentProvider(text){const t=String(text||'');if(/\bConfirmado\s+[A-Z0-9.]+\b/i.test(t)&&/Transferiste\s+[\d.,]+\s*MT/i.test(t))return 'voda';if(/\bID\s+da\s+transa(?:c|ç)ao\s+[A-Z0-9.]+/i.test(t)&&/Transferiste\s+[\d.,]+\s*MT/i.test(t))return 'emola';return null;}
function isIncomingMoneySms(text){
  const t=String(text||'');
  if(/\btransferiste\b/i.test(t)&&!/\brecebeste\b/i.test(t)&&!/\brecebeu\b/i.test(t)&&!/\brecebido\b/i.test(t))return false;
  return /\b(?:recebeste|recebeu|recebido|recebesteu|you have received|received)\b/i.test(t);
}
function detectIncomingPaymentProvider(text){
  const t=String(text||'');
  if(!isIncomingMoneySms(t))return null;
  if(/\bConfirmado\s+[A-Z0-9.]+\b/i.test(t)&&/(?:[\d.,]+\s*MT|MT\s*[\d.,]+)/i.test(t))return 'voda';
  if(/\bID\s+da\s+transa(?:c|ç)[aã]o\s+[A-Z0-9.]+/i.test(t)&&/(?:[\d.,]+\s*MT|MT\s*[\d.,]+)/i.test(t))return 'emola';
  if(/\bmpesa|m-pesa|vodacom/i.test(t)&&/(?:[\d.,]+\s*MT)/i.test(t))return 'voda';
  if(/\bemola|e-mola|movitel/i.test(t)&&/(?:[\d.,]+\s*MT)/i.test(t))return 'emola';
  return null;
}
function detectPaymentProvider(text){return detectIncomingPaymentProvider(text);}
function extractIncomingPaymentId(text){
  const t=String(text||'');
  const m=t.match(/\bID\s+da\s+transa(?:c|ç)[aã]o\s*[:#-]?\s*([A-Z0-9.]+)/i)
    ||t.match(/\bConfirmado\s+([A-Z0-9.]+)/i)
    ||t.match(/\bID\s+trans(?:ac[aã]o)?\s*[:#-]?\s*([A-Z0-9.]+)/i)
    ||t.match(/refer(?:e|ê)ncia\s*[:#-]?\s*([A-Z0-9.]+)/i);
  return m?m[1].trim().replace(/[.]$/,''):'';
}
function extractPaymentId(text){const t=String(text||'');const m=t.match(/\b(?:Confirmado|ID\s+da\s+transa(?:c|ç)[aã]o|ID\s+trans)\s*[:#-]?\s*([A-Z0-9.]+)/i)||t.match(/refer(?:e|ê)ncia\s*[:#-]?\s*([A-Z0-9.]+)/i);return m?m[1].trim().replace(/[.]$/,''):'';}
function extractIncomingPaymentAmount(text){
  const t=String(text||'');
  let m=t.match(/\b(?:recebeste|recebeu|recebido|you have received)\b[^\d]{0,80}([\d.,]+)\s*MT/i);
  if(!m)m=t.match(/([\d.,]+)\s*MT[^\n]{0,80}\b(?:recebeste|recebeu|recebido)\b/i);
  if(!m)m=t.match(/(?:montante|valor)\s*[:=-]?\s*([\d.,]+)\s*MT/i);
  if(!m)return null;
  const n=Number(String(m[1]).replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'));
  return Number.isFinite(n)?n:null;
}
function extractPaymentAmount(text){const t=String(text||'');let m=t.match(/\b(?:recebeste|recebeu|recebido)\b[^\d]{0,80}([\d.,]+)\s*MT/i);if(!m)m=t.match(/([\d.,]+)\s*MT[^\n]{0,80}\b(?:recebeste|recebeu|recebido)\b/i);if(!m)m=t.match(/\b(?:transferiste|transferiu)\s*([\d.,]+)\s*MT/i);if(!m)m=t.match(/(?:montante|valor)\s*[:=-]?\s*([\d.,]+)\s*MT/i);if(!m)return null;const n=Number(String(m[1]).replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'));return Number.isFinite(n)?n:null;}
function extractOutgoingPaymentAmount(text){const t=String(text||'');const m=t.match(/\bTransferiste\s+([\d.,]+)\s*MT/i)||t.match(/(?:montante|valor)\s*[:=-]?\s*([\d.,]+)\s*MT/i);if(!m)return null;const n=Number(String(m[1]).replace(',','.'));return Number.isFinite(n)?n:null;}
module.exports={json,id,token,adminOk,deviceAuth,body,normalizePaymentProvider,detectPaymentProvider,detectIncomingPaymentProvider,detectOutgoingPaymentProvider,extractPaymentId,extractIncomingPaymentId,extractPaymentAmount,extractIncomingPaymentAmount,extractOutgoingPaymentAmount,isIncomingMoneySms};
