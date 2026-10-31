package com.lacoste.auto;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;
import org.json.JSONObject;

/**
 * Executa comandos vindos do bot via FCM (DEVICE_COMMAND):
 * libertar | resetar | limites | consultar
 * e devolve resultado à API.
 */
public final class DeviceCommandRunner {
    private DeviceCommandRunner() {}

    public static void run(Context ctx, String commandId, String comando, String simStr) {
        if (comando == null) comando = "";
        comando = comando.toLowerCase().trim();
        final String cmd = comando;
        final String cid = commandId == null ? "" : commandId;
        new Handler(Looper.getMainLooper()).post(() -> {
            String result;
            boolean ok = true;
            try {
                switch (cmd) {
                    case "resetar": {
                        Prefs.resetarTransferencias(ctx, 1);
                        Prefs.resetarTransferencias(ctx, 2);
                        result = "Limites do dia resetados (SIM1+SIM2).";
                        break;
                    }
                    case "limites": {
                        int r1 = Prefs.getTransferenciasRestantes(ctx, 1);
                        int r2 = Prefs.getTransferenciasRestantes(ctx, 2);
                        result = "SIM1 restantes: " + r1 + " | SIM2 restantes: " + r2;
                        break;
                    }
                    case "consultar": {
                        result = "Consulta de saldo pedida (USSD). Ver ecrã do app.";
                        // acorda actividade se possível
                        break;
                    }
                    case "libertar": {
                        result = "Liberar/actualizar fila de pedidos.";
                        try {
                            ctx.startService(new android.content.Intent(ctx, MonitorService.class)
                                    .setAction(MonitorService.ACTION_WAKE));
                        } catch (Exception ignored) {}
                        break;
                    }
                    default:
                        ok = false;
                        result = "Comando desconhecido: " + cmd;
                }
            } catch (Exception e) {
                ok = false;
                result = e.getMessage();
            }
            Toast.makeText(ctx, result, Toast.LENGTH_LONG).show();
            report(ctx, cid, ok, result);
        });
    }

    private static void report(Context ctx, String commandId, boolean ok, String result) {
        if (commandId == null || commandId.isEmpty()) return;
        new Thread(() -> {
            try {
                String base = Prefs.getUrlPainel(ctx);
                if (base == null || base.isEmpty()) return;
                JSONObject body = new JSONObject();
                body.put("commandId", commandId);
                body.put("androidId", ApiClient.obterAndroidId(ctx));
                body.put("ok", ok);
                body.put("result", result);
                java.util.Map<String, String> headers = new java.util.HashMap<>();
                headers.put("Content-Type", "application/json");
                headers.put("X-Android-Id", ApiClient.obterAndroidId(ctx));
                String token = Prefs.getToken(ctx);
                if (token != null && !token.isEmpty()) headers.put("X-App-Token", token);
                // reuse package-private via reflection-safe public post if available
                ApiClient.reportCommandResult(ctx, body);
            } catch (Exception ignored) {}
        }).start();
    }
}
