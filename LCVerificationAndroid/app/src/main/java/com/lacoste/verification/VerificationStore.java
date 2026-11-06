package com.lacoste.verification;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

public final class VerificationStore {
    private static final String P = "lc_verification";
    private VerificationStore() {}

    static SharedPreferences p(Context c) {
        return c.getSharedPreferences(P, 0);
    }

    public static String deviceId(Context c) {
        String x = p(c).getString("device_id", "");
        if (x.isEmpty()) {
            x = android.provider.Settings.Secure.getString(c.getContentResolver(), "android_id");
            if (x == null || x.isEmpty()) x = "LCV-" + java.util.UUID.randomUUID();
            p(c).edit().putString("device_id", x).apply();
        }
        return x;
    }

    public static String requestId(Context c) {
        return deviceId(c);
    }

    public static void setToken(Context c, String x) { p(c).edit().putString("token", x == null ? "" : x).apply(); }
    public static String token(Context c) { return p(c).getString("token", ""); }

    public static void setMbAndroidId(Context c, String x) { p(c).edit().putString("mb_android_id", x == null ? "" : x.trim()).apply(); }
    public static String mbAndroidId(Context c) { return p(c).getString("mb_android_id", ""); }

    public static void setPending(Context c, String id, String paymentId, double value, String provider, long deadline) {
        try {
            JSONObject o = new JSONObject();
            o.put("pedidoId", id);
            o.put("paymentId", paymentId);
            o.put("value", value);
            o.put("provider", provider);
            o.put("deadline", deadline);
            p(c).edit().putString("pending", o.toString()).apply();
        } catch (Exception ignored) {}
    }

    public static JSONObject pending(Context c) {
        try {
            String x = p(c).getString("pending", "");
            return x.isEmpty() ? null : new JSONObject(x);
        } catch (Exception e) {
            return null;
        }
    }

    public static void clearPending(Context c) {
        p(c).edit().remove("pending").apply();
    }

    public static void rememberIncoming(Context c, String paymentId, double value, String provider, String text) {
        rememberIncoming(c, paymentId, value, provider, text, "");
    }

    public static void rememberIncoming(Context c, String paymentId, double value, String provider, String text, String sender) {
        try {
            JSONArray arr = recentIncoming(c);
            JSONObject o = new JSONObject();
            o.put("paymentId", paymentId);
            o.put("norm", SmsParser.normalizeId(paymentId));
            o.put("value", value);
            o.put("provider", provider);
            o.put("text", text);
            o.put("sender", sender == null ? "" : sender);
            o.put("at", System.currentTimeMillis());
            JSONArray next = new JSONArray();
            next.put(o);
            for (int i = 0; i < arr.length() && i < 19; i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item != null) next.put(item);
            }
            p(c).edit().putString("recent_in", next.toString()).apply();
        } catch (Exception ignored) {}
    }

    public static JSONArray recentIncoming(Context c) {
        try {
            String x = p(c).getString("recent_in", "");
            return x.isEmpty() ? new JSONArray() : new JSONArray(x);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    public static synchronized String enqueueSms(Context c, String text, String sender, String paymentId, double amount, String provider) {
        try {
            String fingerprint = fingerprint((sender == null ? "" : sender) + "\n" + (text == null ? "" : text));
            JSONArray old = new JSONArray(p(c).getString("sms_outbox", "[]"));
            for (int i = 0; i < old.length(); i++) {
                JSONObject item = old.optJSONObject(i);
                if (item != null && fingerprint.equals(item.optString("fingerprint"))) return fingerprint;
            }
            JSONObject item = new JSONObject();
            item.put("fingerprint", fingerprint);
            item.put("text", text == null ? "" : text);
            item.put("sender", sender == null ? "" : sender);
            item.put("paymentId", paymentId == null ? "" : paymentId);
            item.put("amount", amount);
            item.put("provider", provider == null ? "" : provider);
            item.put("createdAt", System.currentTimeMillis());
            JSONArray next = new JSONArray();
            next.put(item);
            for (int i = 0; i < old.length() && i < 49; i++) {
                JSONObject existing = old.optJSONObject(i);
                if (existing != null) next.put(existing);
            }
            p(c).edit().putString("sms_outbox", next.toString()).apply();
            return fingerprint;
        } catch (Exception e) { return ""; }
    }

    private static String fingerprint(String value) throws Exception {
        java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
        byte[] digest = md.digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder();
        for (byte b : digest) out.append(String.format(java.util.Locale.US, "%02x", b));
        return out.toString();
    }

    public static synchronized JSONArray pendingSms(Context c) {
        try { return new JSONArray(p(c).getString("sms_outbox", "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    public static synchronized void removeQueuedSms(Context c, String fingerprint) {
        try {
            JSONArray old = pendingSms(c), next = new JSONArray();
            for (int i = 0; i < old.length(); i++) {
                JSONObject item = old.optJSONObject(i);
                if (item != null && !fingerprint.equals(item.optString("fingerprint"))) next.put(item);
            }
            p(c).edit().putString("sms_outbox", next.toString()).apply();
        } catch (Exception ignored) {}
    }

    public static JSONObject findRecent(Context c, String paymentId, double value, long maxAgeMs) {
        try {
            String want = SmsParser.normalizeId(paymentId);
            long now = System.currentTimeMillis();
            JSONArray arr = recentIncoming(c);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                if (now - o.optLong("at") > maxAgeMs) continue;
                if (!want.equalsIgnoreCase(o.optString("norm"))) continue;
                if (value > 0 && Math.abs(o.optDouble("value") - value) > 0.05) continue;
                return o;
            }
        } catch (Exception ignored) {}
        return null;
    }
}