package com.kreysam.autosistematransfer;

import android.content.Context;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/* JADX INFO: loaded from: classes3.dex */
public class ApiClient {
    private static final String TAG = "AutosistemaApiClient";

    public interface Callback {
        void onResultado(boolean z, String str);
    }

    public interface ConcluirCallback {
        void onResultado(boolean z);
    }

    public interface PedidosCallback {
        void onErro(String str);

        void onPedidos(JSONArray jSONArray);
    }

    public static String obterAndroidId(Context ctx) {
        try {
            return Settings.Secure.getString(ctx.getContentResolver(), "android_id");
        } catch (Exception e) {
            return "desconhecido";
        }
    }

    public static void registarDispositivo(final Context ctx, final Callback cb) {
        final String base = Prefs.getUrlPainel(ctx);
        final String token = Prefs.getToken(ctx);
        if (base.isEmpty()) {
            postCallback(cb, false, "Cola o link do painel primeiro.");
        } else if (token.isEmpty()) {
            postCallback(cb, false, "Cola o token primeiro.");
        } else {
            new Thread(new Runnable() { // from class: com.kreysam.autosistematransfer.ApiClient$$ExternalSyntheticLambda2
                @Override // java.lang.Runnable
                public final void run() {
                    ApiClient.lambda$registarDispositivo$0(token, ctx, base, cb);
                }
            }).start();
        }
    }

    static /* synthetic */ void lambda$registarDispositivo$0(String token, Context ctx, String base, Callback cb) {
        boolean ok;
        try {
            JSONObject body = new JSONObject();
            body.put("token", token);
            body.put("androidId", obterAndroidId(ctx));
            body.put("modelo", Build.MANUFACTURER + " " + Build.MODEL);
            body.put("tipo", "transfer");
            JSONObject resp = postJson(base + "/api/autosistema/dispositivo/registar", body, null);
            if (resp == null || !resp.optBoolean("ok", false)) {
                ok = false;
            } else {
                ok = true;
            }
            if (!ok) {
                postCallback(cb, false, resp != null ? resp.optString(NotificationCompat.CATEGORY_MESSAGE, "Erro") : "Sem resposta do painel");
                return;
            }
            String status = resp.optString(NotificationCompat.CATEGORY_STATUS, "desativado");
            Prefs.setStatusDispositivo(ctx, status);
            postCallback(cb, true, "Registado! Estado: " + status);
        } catch (Exception e) {
            postCallback(cb, false, "Erro: " + e.getMessage());
        }
    }

    public static void verificarStatusDispositivo(final Context ctx, final Callback cb) {
        final String base = Prefs.getUrlPainel(ctx);
        if (base.isEmpty()) {
            return;
        }
        new Thread(new Runnable() { // from class: com.kreysam.autosistematransfer.ApiClient$$ExternalSyntheticLambda7
            @Override // java.lang.Runnable
            public final void run() {
                ApiClient.lambda$verificarStatusDispositivo$1(ctx, base, cb);
            }
        }).start();
    }

    static /* synthetic */ void lambda$verificarStatusDispositivo$1(Context ctx, String base, Callback cb) {
        try {
            String androidId = obterAndroidId(ctx);
            URL u = new URL(base + "/api/autosistema/dispositivo/status?androidId=" + androidId);
            HttpURLConnection conn = (HttpURLConnection) u.openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            JSONObject resp = lerResposta(conn);
            conn.disconnect();
            if (resp != null) {
                String status = resp.optString(NotificationCompat.CATEGORY_STATUS, "nao_registado");
                Prefs.setStatusDispositivo(ctx, status);
                Prefs.setUltimaVerificacaoFalhou(ctx, false);
                postCallback(cb, true, status);
            } else {
                Log.w(TAG, "Verificacao de status sem resposta valida do painel -- mantendo ultimo estado conhecido.");
                AppLog.add(ctx, TAG, "Verificacao de status sem resposta valida do painel -- mantendo ultimo estado conhecido.");
                Prefs.setUltimaVerificacaoFalhou(ctx, true);
                postCallback(cb, false, "sem_resposta");
            }
        } catch (Exception e) {
            Log.w(TAG, "Verificacao de status falhou (rede): " + e.getMessage());
            AppLog.add(ctx, TAG, "Verificacao de status falhou (rede): " + e.getMessage());
            Prefs.setUltimaVerificacaoFalhou(ctx, true);
            postCallback(cb, false, e.getMessage());
        }
    }

    public static void enviarParaPainel(final Context ctx, final String texto) {
        final String base = Prefs.getUrlPainel(ctx);
        final String token = Prefs.getToken(ctx);
        if (base.isEmpty()) {
            Log.w(TAG, "Sem URL do painel configurado.");
            AppLog.add(ctx, TAG, "Sem URL do painel configurado.");
            Prefs.setUltimoErro(ctx, "Sem link do painel configurado.");
        } else {
            if (token.isEmpty()) {
                Log.w(TAG, "Sem token configurado.");
                AppLog.add(ctx, TAG, "Sem token configurado.");
                Prefs.setUltimoErro(ctx, "Sem token configurado.");
                return;
            }
            new Thread(new Runnable() { // from class: com.kreysam.autosistematransfer.ApiClient$$ExternalSyntheticLambda1
                @Override // java.lang.Runnable
                public final void run() {
                    ApiClient.lambda$enviarParaPainel$2(texto, token, ctx, base);
                }
            }).start();
        }
    }

    static /* synthetic */ void lambda$enviarParaPainel$2(String texto, String token, Context ctx, String base) {
        try {
            JSONObject body = new JSONObject();
            body.put("texto", texto);
            Map<String, String> headers = new HashMap<>();
            headers.put("X-App-Token", token);
            headers.put("X-Android-Id", obterAndroidId(ctx));
            JSONObject resp = postJson(base + "/api/comprovativo/colar", body, headers);
            if (resp != null && resp.optBoolean("ok", false)) {
                Prefs.incrementarEnviados(ctx);
                Prefs.setUltimoErro(ctx, "");
                Log.i(TAG, "Enviado com sucesso.");
                AppLog.add(ctx, TAG, "Enviado com sucesso.");
                return;
            }
            String msg = resp != null ? resp.optString(NotificationCompat.CATEGORY_MESSAGE, "Erro desconhecido") : "Sem resposta";
            Prefs.setUltimoErro(ctx, msg);
            Log.e(TAG, "Erro do painel: " + msg);
            AppLog.add(ctx, TAG, "Erro do painel: " + msg);
        } catch (Exception e) {
            Prefs.setUltimoErro(ctx, "Erro de rede: " + e.getMessage());
            Log.e(TAG, "Falha ao enviar", e);
            AppLog.add(ctx, TAG, "Falha ao enviar: " + e.getMessage());
        }
    }

    public static void buscarPedidos(final Context ctx, final PedidosCallback cb) {
        final String base = Prefs.getUrlPainel(ctx);
        final String token = Prefs.getToken(ctx);
        if (base.isEmpty() || token.isEmpty()) {
            cb.onErro("Sem URL ou token do painel configurado.");
        } else {
            new Thread(new Runnable() { // from class: com.kreysam.autosistematransfer.ApiClient$$ExternalSyntheticLambda3
                @Override // java.lang.Runnable
                public final void run() {
                    ApiClient.lambda$buscarPedidos$3(base, ctx, token, cb);
                }
            }).start();
        }
    }

    static /* synthetic */ void lambda$buscarPedidos$3(String base, Context ctx, String token, PedidosCallback cb) {
        try {
            URL u = new URL(base + "/api/autosistema/pedidos/dispositivo");
            HttpURLConnection conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setRequestProperty("X-Android-Id", obterAndroidId(ctx));
            conn.setRequestProperty("X-App-Token", token);
            JSONObject resp = lerResposta(conn);
            conn.disconnect();
            if (resp != null && resp.optBoolean("ok", false)) {
                JSONArray pedidos = resp.optJSONArray("pedidos");
                cb.onPedidos(pedidos != null ? pedidos : new JSONArray());
            } else {
                cb.onErro(resp != null ? resp.optString(NotificationCompat.CATEGORY_MESSAGE, "Erro desconhecido") : "Sem resposta do painel");
            }
        } catch (Exception e) {
            cb.onErro("Erro de rede: " + e.getMessage());
        }
    }

    public static void concluirPedido(final Context ctx, final String pedidoId, final ConcluirCallback cb) {
        final String base = Prefs.getUrlPainel(ctx);
        final String token = Prefs.getToken(ctx);
        if (base.isEmpty() || token.isEmpty()) {
            if (cb != null) {
                cb.onResultado(false);
                return;
            }
            return;
        }
        new Thread(new Runnable() { // from class: com.kreysam.autosistematransfer.ApiClient$$ExternalSyntheticLambda6
            @Override // java.lang.Runnable
            public final void run() {
                ApiClient.lambda$concluirPedido$4(pedidoId, ctx, token, base, cb);
            }
        }).start();
    }

    static /* synthetic */ void lambda$concluirPedido$4(String pedidoId, Context ctx, String token, String base, ConcluirCallback cb) {
        boolean ok = false;
        for (int tentativa = 1; tentativa <= 3 && !ok; tentativa++) {
            try {
                JSONObject body = new JSONObject();
                body.put("pedidoId", pedidoId);
                Map<String, String> headers = new HashMap<>();
                headers.put("X-Android-Id", obterAndroidId(ctx));
                headers.put("X-App-Token", token);
                JSONObject resp = postJson(base + "/api/autosistema/pedido/concluir", body, headers);
                boolean z = false;
                if (resp != null && resp.optBoolean("ok", false)) {
                    z = true;
                }
                ok = z;
                AppLog.add(ctx, TAG, "Pedido " + pedidoId + " marcado concluido no painel (tentativa " + tentativa + "): " + ok);
            } catch (Exception e) {
                AppLog.add(ctx, TAG, "Falha ao marcar pedido " + pedidoId + " como concluido (tentativa " + tentativa + "): " + e.getMessage());
            }
            if (!ok && tentativa < 3) {
                try {
                    Thread.sleep(2000L);
                } catch (InterruptedException e2) {
                }
            }
        }
        if (cb != null) {
            cb.onResultado(ok);
        }
    }

    public static void falharPedido(final Context ctx, final String pedidoId, final String motivo) {
        final String base = Prefs.getUrlPainel(ctx);
        final String token = Prefs.getToken(ctx);
        if (base.isEmpty() || token.isEmpty()) {
            return;
        }
        new Thread(new Runnable() { // from class: com.kreysam.autosistematransfer.ApiClient$$ExternalSyntheticLambda5
            @Override // java.lang.Runnable
            public final void run() {
                ApiClient.lambda$falharPedido$5(pedidoId, motivo, ctx, token, base);
            }
        }).start();
    }

    static /* synthetic */ void lambda$falharPedido$5(String pedidoId, String motivo, Context ctx, String token, String base) {
        try {
            JSONObject body = new JSONObject();
            body.put("pedidoId", pedidoId);
            body.put("motivo", motivo);
            Map<String, String> headers = new HashMap<>();
            headers.put("X-Android-Id", obterAndroidId(ctx));
            headers.put("X-App-Token", token);
            JSONObject resp = postJson(base + "/api/autosistema/pedido/falhou", body, headers);
            boolean ok = false;
            if (resp != null && resp.optBoolean("ok", false)) {
                ok = true;
            }
            AppLog.add(ctx, TAG, "Pedido " + pedidoId + " marcado como falhou no painel (" + motivo + "): " + ok);
        } catch (Exception e) {
            AppLog.add(ctx, TAG, "Falha ao reportar falha do pedido " + pedidoId + ": " + e.getMessage());
        }
    }

    public static void enviarHeartbeat(final Context ctx) {
        final String base = Prefs.getUrlPainel(ctx);
        final String token = Prefs.getToken(ctx);
        if (base.isEmpty() || token.isEmpty()) {
            return;
        }
        new Thread(new Runnable() { // from class: com.kreysam.autosistematransfer.ApiClient$$ExternalSyntheticLambda4
            @Override // java.lang.Runnable
            public final void run() {
                ApiClient.lambda$enviarHeartbeat$6(token, ctx, base);
            }
        }).start();
    }

    static /* synthetic */ void lambda$enviarHeartbeat$6(String token, Context ctx, String base) {
        try {
            JSONObject jSONObject = new JSONObject();
            jSONObject.put("token", token);
            jSONObject.put("androidId", obterAndroidId(ctx));
            jSONObject.put("toggleAtivo", Prefs.getComunicacaoAtiva(ctx));
            jSONObject.put("simAtivo", Prefs.getSimAtivo(ctx));
            jSONObject.put("simCreditoDisponivel", Prefs.getSimCreditoDisponivel(ctx));
            JSONArray sims = new JSONArray();
            for (int sim = 1; sim <= 2; sim++) {
                long saldo = Prefs.getSaldo(ctx, sim);
                if (saldo >= 0) {
                    JSONObject simObj = new JSONObject();
                    simObj.put("slot", sim);
                    simObj.put("saldoMB", saldo);
                    simObj.put("transferencias", Prefs.getTransferenciasRestantes(ctx, sim));
                    sims.put(simObj);
                }
            }
            jSONObject.put("sims", sims);
            postJson(base + "/api/autosistema/dispositivo/heartbeat", jSONObject, null);
        } catch (Exception e) {
            Log.w(TAG, "Heartbeat falhou (sem problema, tenta de novo no próximo ciclo): " + e.getMessage());
            AppLog.add(ctx, TAG, "Heartbeat falhou (sem problema, tenta de novo no proximo ciclo): " + e.getMessage());
        }
    }

    public static void relatarResultadoComRetentativa(final Context ctx, final JSONObject payload, final String endpoint) {
        new Thread(new Runnable() { // from class: com.kreysam.autosistematransfer.ApiClient$$ExternalSyntheticLambda0
            @Override // java.lang.Runnable
            public final void run() {
                ApiClient.lambda$relatarResultadoComRetentativa$7(ctx, endpoint, payload);
            }
        }).start();
    }

    static /* synthetic */ void lambda$relatarResultadoComRetentativa$7(Context ctx, String endpoint, JSONObject payload) {
        int tentativa = 0;
        long[] esperasMs = {2000, 5000, 15000, 30000, 60000, 120000, 300000};
        while (true) {
            try {
                String base = Prefs.getUrlPainel(ctx);
                JSONObject resp = postJson(base + endpoint, payload, null);
                if (resp != null && resp.optBoolean("ok", false)) {
                    Log.i(TAG, "Resultado entregue ao painel com sucesso (tentativa " + (tentativa + 1) + ").");
                    AppLog.add(ctx, TAG, "Resultado entregue ao painel com sucesso (tentativa " + (tentativa + 1) + ").");
                    return;
                }
            } catch (Exception e) {
                Log.w(TAG, "Falha ao entregar resultado (tentativa " + (tentativa + 1) + "): " + e.getMessage());
                AppLog.add(ctx, TAG, "Falha ao entregar resultado (tentativa " + (tentativa + 1) + "): " + e.getMessage());
            }
            long espera = esperasMs[Math.min(tentativa, esperasMs.length - 1)];
            tentativa++;
            if (tentativa > 200) {
                return;
            }
            try {
                Thread.sleep(espera);
            } catch (InterruptedException e2) {
                return;
            }
        }
    }

    private static JSONObject postJson(String urlStr, JSONObject body, Map<String, String> headers) throws Exception {
        HttpURLConnection conn = null;
        try {
            URL u = new URL(urlStr);
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            if (headers != null) {
                for (Map.Entry<String, String> e : headers.entrySet()) {
                    conn.setRequestProperty(e.getKey(), e.getValue());
                }
            }
            OutputStream os = conn.getOutputStream();
            try {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                if (os != null) {
                    os.close();
                }
                return lerResposta(conn);
            } finally {
            }
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private static JSONObject lerResposta(HttpURLConnection conn) {
        try {
            int codigo = conn.getResponseCode();
            InputStream is = (codigo < 200 || codigo >= 300) ? conn.getErrorStream() : conn.getInputStream();
            if (is == null) {
                return null;
            }
            BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            while (true) {
                String linha = br.readLine();
                if (linha == null) {
                    br.close();
                    return new JSONObject(sb.toString());
                }
                sb.append(linha);
            }
        } catch (Exception e) {
            return null;
        }
    }

    private static void postCallback(Callback cb, boolean ok, String msg) {
        if (cb != null) {
            cb.onResultado(ok, msg);
        }
    }
}
