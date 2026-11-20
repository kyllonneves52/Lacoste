package com.kreysam.autosistematransfer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Telephony;
import android.telephony.SmsManager;
import android.telephony.SmsMessage;
import android.util.Log;

import java.util.ArrayList;

public class SmsReceiver extends BroadcastReceiver {

    private static final String TAG = "AutosistemaSmsReceiver";

    private void reencaminharPorSms(
            Context ctx,
            String numeroDestino,
            String remetente,
            String texto
    ) {
        try {
            String numLimpo = numeroDestino.replaceAll("[^0-9+]", "");

            if (numLimpo.length() == 9 && !numLimpo.startsWith("+")) {
                numLimpo = "+258" + numLimpo;
            } else if (numLimpo.length() == 12 && numLimpo.startsWith("258")) {
                numLimpo = "+" + numLimpo;
            }

            String mensagem = "[" + remetente + "]\n" + texto;

            SmsManager smsManager;

            if (Build.VERSION.SDK_INT >= 31) {
                smsManager = ctx.getSystemService(SmsManager.class);
            } else {
                smsManager = SmsManager.getDefault();
            }

            if (smsManager == null) {
                Log.e(TAG, "SmsManager nulo — sem SIM ou permissão negada.");
                Prefs.setUltimoErro(
                        ctx,
                        "SmsManager nulo — verifica permissões e SIM."
                );
                return;
            }

            ArrayList<String> partes =
                    smsManager.divideMessage(mensagem);

            smsManager.sendMultipartTextMessage(
                    numLimpo,
                    null,
                    partes,
                    null,
                    null
            );

            Prefs.incrementarEnviados(ctx);

            Log.i(
                    TAG,
                    "SMS reencaminhado para " + numLimpo
            );

        } catch (Exception e) {

            Log.e(
                    TAG,
                    "Erro ao reencaminhar SMS: " + e.getMessage(),
                    e
            );

            Prefs.setUltimoErro(
                    ctx,
                    "Falha ao enviar SMS: " + e.getMessage()
            );
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {

        if (!"android.provider.Telephony.SMS_RECEIVED"
                .equals(intent.getAction())) {
            return;
        }

        try {

            SmsMessage[] partes =
                    Telephony.Sms.Intents.getMessagesFromIntent(intent);

            if (partes == null || partes.length == 0) {
                return;
            }

            String remetente =
                    partes[0].getDisplayOriginatingAddress();

            StringBuilder corpo = new StringBuilder();

            for (SmsMessage parte : partes) {
                if (parte != null &&
                        parte.getMessageBody() != null) {

                    corpo.append(parte.getMessageBody());
                }
            }

            String texto = corpo.toString();

            String numeroExtra =
                    Prefs.getNumeroExtra(context);

            Log.i(
                    TAG,
                    "SMS de: " + remetente
            );

            if (!SmsFilter.deveEncaminhar(
                    remetente,
                    texto,
                    numeroExtra
            )) {

                Log.i(
                        TAG,
                        "Ignorado (não é confirmação de pagamento M-Pesa/E-Mola)."
                );

                return;
            }

            Log.i(
                    TAG,
                    "Confirmação de pagamento detetada."
            );

            String modo =
                    Prefs.getModoEnvio(context);

            if ("desligado".equals(modo)) {

                Log.i(
                        TAG,
                        "Modo desligado — mensagem ignorada."
                );

                return;
            }

            if ("sms".equals(modo)) {

                String numeroSms =
                        Prefs.getNumeroSms(context);

                if (numeroSms == null ||
                        numeroSms.isEmpty()) {

                    Log.w(
                            TAG,
                            "Modo SMS mas sem número configurado — a ignorar."
                    );

                    Prefs.setUltimoErro(
                            context,
                            "Modo SMS sem número configurado."
                    );

                    return;
                }

                Log.i(
                        TAG,
                        "A reencaminhar por SMS para " + numeroSms
                );

                reencaminharPorSms(
                        context,
                        numeroSms,
                        remetente,
                        texto
                );

                return;
            }

            // Modo painel: usar o mesmo canal do AutosistemaTransfer.
            try {
                ApiClient.enviarParaPainel(
                        context,
                        texto
                );

                Log.i(
                        TAG,
                        "Confirmação enviada ao painel."
                );
            } catch (Exception e) {
                Log.e(
                        TAG,
                        "Falha ao enviar confirmação ao painel.",
                        e
                );

                Prefs.setUltimoErro(
                        context,
                        "Falha ao enviar SMS ao painel: " + e.getMessage()
                );
            }

        } catch (Exception e) {

            Log.e(
                    TAG,
                    "Erro a processar SMS",
                    e
            );
        }
    }
}