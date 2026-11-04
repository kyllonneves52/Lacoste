package com.lacoste.verification;

import android.content.Context;
import org.json.JSONObject;

public final class VerificationProcessor {
    private VerificationProcessor() {}

    public static void process(Context c, String t) {
        process(c, t, "");
    }

    public static void process(Context c, String t, String sender) {
        try {
            if (!SmsParser.isIncoming(t)) return;
            String prov = SmsParser.provider(t);
            String id = SmsParser.id(t);
            double v = SmsParser.value(t);
            if (id.isEmpty() || v <= 0) return;

            VerificationStore.rememberIncoming(c, id, v, prov, t, sender);

            JSONObject pending = VerificationStore.pending(c);
            if (pending != null && System.currentTimeMillis() > pending.optLong("deadline", 0)) {
                VerificationStore.clearPending(c);
            }

            // Encaminha todos os SMS válidos de dinheiro recebido. A API é a
            // autoridade para casar referência, valor, operadora e dispositivo;
            // um SMS diferente não deve bloquear outro pagamento pendente.
            VerificationStore.enqueueSms(c, t, sender, id, v, prov);
            retryQueued(c);
        } catch (Exception ignored) {}
    }

    private static volatile boolean deliveringQueue = false;

    public static void retryQueued(Context c) {
        synchronized (VerificationProcessor.class) {
            if (deliveringQueue) return;
            deliveringQueue = true;
        }
        final Context app = c.getApplicationContext();
        new Thread(() -> {
            try {
                org.json.JSONArray queue = VerificationStore.pendingSms(app);
                for (int i = 0; i < queue.length(); i++) {
                    org.json.JSONObject item = queue.optJSONObject(i);
                    if (item == null) continue;
                    String fingerprint = item.optString("fingerprint", "");
                    long age = System.currentTimeMillis() - item.optLong("createdAt", 0);
                    if (age > 10 * 60 * 1000L) {
                        VerificationStore.removeQueuedSms(app, fingerprint);
                        continue;
                    }
                    boolean accepted = false;
                    for (int attempt = 0; attempt < 3 && !accepted; attempt++) {
                        try {
                            org.json.JSONObject response = VerificationApi.verifySms(
                                    app,
                                    item.optString("text"),
                                    item.optString("sender"),
                                    item.optString("paymentId"),
                                    item.optDouble("amount", 0),
                                    item.optString("provider")
                            );
                            accepted = response != null && (response.optBoolean("stored")
                                    || response.optBoolean("duplicate")
                                    || "verified".equalsIgnoreCase(response.optString("status")));
                            if (accepted) {
                                VerificationStore.removeQueuedSms(app, fingerprint);
                                JSONObject pending = VerificationStore.pending(app);
                                boolean samePending = pending != null
                                        && SmsParser.normalizeId(pending.optString("paymentId", "")).equalsIgnoreCase(SmsParser.normalizeId(item.optString("paymentId", "")))
                                        && Math.abs(pending.optDouble("value", -1) - item.optDouble("amount", 0)) < 0.05;
                                if (samePending && (response.optBoolean("stored") || "verified".equalsIgnoreCase(response.optString("status")))) VerificationStore.clearPending(app);
                            } else if (response != null && response.optInt("httpStatus", 200) >= 400 && response.optInt("httpStatus", 200) < 500
                                    && response.optInt("httpStatus", 200) != 401 && response.optInt("httpStatus", 200) != 403) {
                                VerificationStore.removeQueuedSms(app, fingerprint);
                                break;
                            }
                        } catch (Exception e) {
                            if (attempt < 2) {
                                try { Thread.sleep(attempt == 0 ? 5000L : 15000L); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); break; }
                            }
                        }
                    }
                }
            } finally {
                synchronized (VerificationProcessor.class) { deliveringQueue = false; }
            }
        }, "LCV-SMS-OUTBOX").start();
    }

    public static void matchPendingAgainstInbox(Context c) {
        try {
            JSONObject p = VerificationStore.pending(c);
            if (p == null) return;
            if (System.currentTimeMillis() > p.optLong("deadline", 0)) {
                VerificationStore.clearPending(c);
                return;
            }
            JSONObject hit = VerificationStore.findRecent(
                    c,
                    p.optString("paymentId"),
                    p.optDouble("value", -1),
                    120000
            );
            if (hit != null) {
                process(c, hit.optString("text"), hit.optString("sender", ""));
            }
        } catch (Exception ignored) {}
    }
}
