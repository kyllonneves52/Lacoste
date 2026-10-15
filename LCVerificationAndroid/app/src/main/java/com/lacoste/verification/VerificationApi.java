package com.lacoste.verification;

import android.content.Context;
import android.os.Build;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public final class VerificationApi {
    private static final String BASE = "https://lacoste.hyzecloud.app";
    private VerificationApi() {}

    static JSONObject req(String path, String method, JSONObject body, String token, String deviceId) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(BASE + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestProperty("Content-Type", "application/json");
        if (token != null && !token.isEmpty()) {
            c.setRequestProperty("X-App-Token", token);
            c.setRequestProperty("X-Verification-Token", token);
        }
        if (deviceId != null && !deviceId.isEmpty()) {
            c.setRequestProperty("X-Verification-Device", deviceId);
        }
        if (body != null) {
            c.setDoOutput(true);
            try (OutputStream o = c.getOutputStream()) {
                o.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
        }
        int httpStatus = c.getResponseCode();
        InputStream in = httpStatus >= 400 ? c.getErrorStream() : c.getInputStream();
        if (in == null) {
            JSONObject empty = new JSONObject();
            empty.put("ok", false);
            empty.put("httpStatus", httpStatus);
            empty.put("message", "Servidor respondeu sem conteúdo (HTTP " + httpStatus + ").");
            c.disconnect();
            return empty;
        }
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder s = new StringBuilder();
        String l;
        while ((l = r.readLine()) != null) s.append(l);
        c.disconnect();
        String raw = s.toString().trim();
        try {
            JSONObject result = new JSONObject(raw);
            if (!result.has("httpStatus")) result.put("httpStatus", httpStatus);
            return result;
        } catch (org.json.JSONException notJson) {
            // The API/proxy can return plain text (for example "Payment ...").
            // Convert it to a structured error instead of crashing on JSONObject.
            JSONObject result = new JSONObject();
            result.put("ok", false);
            result.put("httpStatus", httpStatus);
            result.put("message", raw.isEmpty() ? "Resposta vazia do servidor." : raw);
            result.put("rawResponse", raw);
            return result;
        }
    }

    public static JSONObject requestLicense(Context c, String key) throws Exception {
        JSONObject b = new JSONObject();
        b.put("licenseKey", key.toUpperCase());
        b.put("androidId", VerificationStore.deviceId(c));
        b.put("model", Build.MANUFACTURER + " " + Build.MODEL);
        b.put("deviceRole", "verification");
        b.put("platform", "android");
        return req("/api/licenca/request", "POST", b, null, null);
    }

    public static JSONObject status(Context c) throws Exception {
        return req(
            "/api/licenca/status?androidId=" + URLEncoder.encode(VerificationStore.deviceId(c), "UTF-8")
                + "&requestId=" + URLEncoder.encode(VerificationStore.requestId(c), "UTF-8"),
            "GET", null, null, null);
    }

    public static JSONObject register(Context c, String fcm) throws Exception {
        JSONObject b = new JSONObject();
        b.put("deviceId", VerificationStore.deviceId(c));
        b.put("androidId", VerificationStore.deviceId(c));
        b.put("fcmToken", fcm == null ? "" : fcm);
        b.put("deviceRole", "verification");
        return req("/api/autosistema/verificacao/registar", "POST", b, VerificationStore.token(c), VerificationStore.deviceId(c));
    }

    public static JSONObject associarMb(Context c, String mbAndroidId, String fcm) throws Exception {
        JSONObject b = new JSONObject();
        b.put("deviceId", VerificationStore.deviceId(c));
        b.put("mbAndroidId", mbAndroidId);
        b.put("fcmToken", fcm == null ? "" : fcm);
        b.put("token", VerificationStore.token(c));
        return req("/api/lcverification/associar", "POST", b, VerificationStore.token(c), VerificationStore.deviceId(c));
    }

    public static JSONObject verifySms(Context c, String text, String sender, String paymentId, double amount, String provider) throws Exception {
        JSONObject b = new JSONObject();
        b.put("deviceId", VerificationStore.deviceId(c));
        b.put("token", VerificationStore.token(c));
        b.put("text", text == null ? "" : text);
        b.put("sms", text == null ? "" : text);
        b.put("sender", sender == null ? "" : sender);
        b.put("paymentId", paymentId == null ? "" : paymentId);
        if (amount > 0) b.put("amount", amount);
        if (provider != null) b.put("provider", provider);
        return req("/api/lcverification/sms", "POST", b, VerificationStore.token(c), VerificationStore.deviceId(c));
    }

    public static JSONObject verify(Context c, String pedidoId, String paymentId) throws Exception {
        JSONObject b = new JSONObject();
        b.put("deviceId", VerificationStore.deviceId(c));
        b.put("pedidoId", pedidoId);
        b.put("paymentId", paymentId);
        return req("/api/autosistema/verificacao/pagamento", "POST", b, VerificationStore.token(c), VerificationStore.deviceId(c));
    }
}
