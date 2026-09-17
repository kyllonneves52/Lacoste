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

    public static void setToken(Context c, String x) { p(c).edit().putString("token", x == null ? "" : x).apply(); }
    public static String token(Context c) { return p(c).getString("token", ""); }
    public static void setLicense(Context c, String x) { p(c).edit().putString("license", x == null ? "" : x).apply(); }
    public static String license(Context c) { return p(c).getString("license", ""); }
    public static void setRequestId(Context c, String x) { p(c).edit().putString("request", x == null ? "" : x).apply(); }
    public static String requestId(Context c) { return p(c).getString("request", ""); }
    public static void setExpires(Context c, String x) { p(c).edit().putString("expires", x == null ? "" : x).apply(); }
    public static String expires(Context c) { return p(c).getString("expires", ""); }

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
        try {
            JSONArray arr = recentIncoming(c);
            JSONObject o = new JSONObject();
            o.put("paymentId", paymentId);
            o.put("norm", SmsParser.normalizeId(paymentId));
            o.put("value", value);
            o.put("provider", provider);
            o.put("text", text);
            o.put("at", System.currentTimeMillis());
            JSONArray next = new JSONArray();
            next.put(o);
            for (int i = 0; i < arr.length() && i < 19; i++) next.put(arr.getJSONObject(i));
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

    public static JSONObject findRecent(Context c, String paymentId, double value, long maxAgeMs) {
        try {
            String want = SmsParser.normalizeId(paymentId);
            long now = System.currentTimeMillis();
            JSONArray arr = recentIncoming(c);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                if (now - o.optLong("at") > maxAgeMs) continue;
                if (!want.equalsIgnoreCase(o.optString("norm"))) continue;
                if (value > 0 && Math.abs(o.optDouble("value") - value) > 0.05) continue;
                return o;
            }
        } catch (Exception ignored) {}
        return null;
    }
}
