package com.lacoste.auto;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class FirebasePushService extends FirebaseMessagingService {
    private static final String TAG = "LacosteFCM";

    @Override
    public void onCreate() {
        super.onCreate();
        FirebaseConfig.inicializar(getApplicationContext());
    }

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        AppLog.add(getApplicationContext(), TAG, "Novo token FCM recebido.");
        ApiClient.registarTokenPush(getApplicationContext(), token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Context ctx = getApplicationContext();
        String tipo = message.getData().get("type");
        String pedidoId = message.getData().get("pedidoId");
        String androidId = message.getData().get("androidId");

        if (androidId != null && !androidId.isEmpty() && !ApiClient.obterAndroidId(ctx).equalsIgnoreCase(androidId)) {
            AppLog.add(ctx, TAG, "Push ignorado: Android ID não corresponde.");
            return;
        }

        AppLog.add(ctx, TAG, "Push recebido: " + (tipo == null ? "" : tipo) + " pedido=" + (pedidoId == null ? "" : pedidoId));
        if ("NEW_ORDER".equalsIgnoreCase(tipo)) {
            acordarMonitor(ctx);
        }
    }

    private void acordarMonitor(Context ctx) {
        try {
            Intent i = new Intent(ctx, MonitorService.class);
            i.setAction(MonitorService.ACTION_WAKE);
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Exception e) {
            Log.e(TAG, "Não foi possível acordar MonitorService", e);
        }
    }
}
