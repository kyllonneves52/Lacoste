const {sql}=require('../../db');
const {json,body,detectIncomingPaymentProvider,extractIncomingPaymentId,extractIncomingPaymentAmount,normalizePaymentProvider}=require('../../common');
const {notifyDevice}=require('../../push');

module.exports=async(req,res)=>{
  if(req.method!=='POST')return json(res,405,{ok:false,message:'Método não permitido.'});
  try{
    const b=await body(req);
    const did=String(req.headers['x-verification-device']||b.deviceId||'').trim();
    const tok=String(req.headers['x-verification-token']||req.headers['x-app-token']||b.token||'').trim();
    const vd=(await sql`
      SELECT id,mb_android_id FROM verification_devices
      WHERE (id=${did} OR device_id=${did}) AND (token=${tok} OR ${tok}='' )
      AND status='active' LIMIT 1
    `).rows[0];
    if(!vd)return json(res,403,{ok:false,message:'Dispositivo LC Verification não autorizado.'});

    const text=String(b.text||b.sms||'').trim();
    const provider=normalizePaymentProvider(b.provider||detectIncomingPaymentProvider(text));
    const pid=String(b.paymentId||extractIncomingPaymentId(text)||'').trim();
    const amount=b.amount==null?extractIncomingPaymentAmount(text):Number(b.amount);

    if(!pid||provider==='off'||!Number.isFinite(amount)||amount<=0){
      return json(res,400,{ok:false,message:'SMS de RECEBIMENTO inválido. Precisa de ID e valor de dinheiro recebido (não de envio).'});
    }

    await sql`UPDATE payment_verifications SET status='expired',failure_reason='Nenhum SMS válido recebido dentro de 10 minutos.',updated_at=NOW() WHERE status='pending' AND expires_at<=NOW()`;
    await sql`UPDATE orders SET status='failed',fail_reason='Pagamento não verificado dentro de 10 minutos.' WHERE status='waiting_verification' AND id IN (SELECT order_id FROM payment_verifications WHERE status='expired')`;

    const q=await sql`
      SELECT pv.*,o.device_android_id,o.payment_id,o.bot_group_id,o.id AS order_id
      FROM payment_verifications pv
      JOIN orders o ON o.id=pv.order_id
      WHERE pv.status='pending'
        AND pv.expires_at>NOW()
        AND UPPER(REPLACE(pv.expected_payment_id,'.',''))=UPPER(REPLACE(${pid},'.',''))
        AND (pv.verification_device_id=${vd.id} OR pv.verification_device_id IS NULL
             OR o.device_android_id=${vd.mb_android_id})
      ORDER BY pv.created_at ASC
      LIMIT 50
    `;

    const matches=q.rows.filter(x=>{
      const mode=normalizePaymentProvider(x.expected_provider);
      const okProv=(mode==='todos'||mode==='all'||mode===provider);
      const okVal=!x.expected_amount||Math.abs(Number(x.expected_amount)-amount)<0.05;
      return okProv&&okVal;
    });

    if(!matches.length){
      // O SMS pode chegar antes do comprovativo/pedido. Não o descartamos:
      // guardamos temporariamente para casar quando o pedido for criado.
      await sql`INSERT INTO verification_inbox
        (id,payment_id,amount_mt,provider,sms_text,sms_sender,verification_device_id,received_at,expires_at)
        VALUES(${`IN-${Date.now()}-${Math.random().toString(36).slice(2,8)}`},${pid},${amount},${provider},${text},${String(b.sender||'')},${vd.id},NOW(),NOW()+INTERVAL '10 minutes')`;
      return json(res,200,{ok:true,matched:false,stored:true,message:'Recebimento guardado temporariamente; será associado quando o pedido com o mesmo ID e valor for criado.',paymentId:pid,amount,provider});
    }

    const uRows=[];
    for(const match of matches){
      const u=await sql`
        UPDATE payment_verifications
        SET status='verified',provider=${provider},sms_text=${text},sms_sender=${String(b.sender||'')},
            received_at=NOW(),verification_device_id=${vd.id},verified_at=NOW(),updated_at=NOW()
        WHERE id=${match.id} AND status='pending'
        RETURNING id,order_id
      `;
      if(u.rows[0]) uRows.push(u.rows[0]);
    }

    for(const row of uRows){
      await sql`UPDATE orders SET status='pending',source='lc_verification' WHERE id=${row.order_id} AND status='waiting_verification'`;
    }

    const parent=matches[0];
    const androidId=parent.device_android_id||vd.mb_android_id;
    const dev=(await sql`SELECT fcm_token FROM devices WHERE android_id=${androidId} LIMIT 1`).rows[0];
    const push=await notifyDevice(dev?.fcm_token,{
      type:'NEW_ORDER',
      pedidoId:parent.order_id,
      androidId,
      paymentVerified:'true'
    });

    return json(res,200,{
      ok:true,
      status:'verified',
      pedidoId:parent.order_id,
      verificationId:matches[0].id,
      provider,
      paymentId:pid,
      amount,
      partesLiberadas:uRows.length,
      pushEnviado:push.sent
    });
  }catch(e){
    console.error(e);
    return json(res,500,{ok:false,message:e.message});
  }
};
