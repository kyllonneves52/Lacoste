package com.kreysam.autosistematransfer;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

public class NotificationForwarderService
        extends NotificationListenerService {

    private static final String TAG =
            "AutosistemaNotifService";

    @Override
    public void onNotificationPosted(
            StatusBarNotification sbn) {

        if (sbn == null) {
            return;
        }

        try {

            Notification n = sbn.getNotification();

            if (n == null) {
                return;
            }

            Bundle extras = n.extras;

            if (extras == null) {
                return;
            }

            CharSequence tituloCs =
                    extras.getCharSequence("android.title");

            CharSequence textoCs =
                    extras.getCharSequence("android.text");

            CharSequence bigTextCs =
                    extras.getCharSequence("android.bigText");

            String titulo =
                    tituloCs == null
                            ? ""
                            : tituloCs.toString();

            String texto;

            if (bigTextCs != null) {
                texto = bigTextCs.toString();
            } else if (textoCs != null) {
                texto = textoCs.toString();
            } else {
                texto = "";
            }

            if (texto.trim().isEmpty()) {
                return;
            }

            String remetente =
                    titulo + " " + sbn.getPackageName();

            String numeroExtra =
                    Prefs.getNumeroExtra(
                            getApplicationContext()
                    );

            if (SmsFilter.deveEncaminhar(
                    remetente,
                    texto,
                    numeroExtra)) {

                Log.i(TAG,
                        "Notificação de pagamento detetada — a enviar ao painel.");

                ApiClient.enviarParaPainel(
                        getApplicationContext(),
                        texto
                );
            }

        } catch (Exception e) {

            Log.e(TAG,
                    "Erro a processar notificação",
                    e);
        }
    }
}