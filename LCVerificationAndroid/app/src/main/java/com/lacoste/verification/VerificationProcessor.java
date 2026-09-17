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

            VerificationStore.rememberIncoming(c, id, v, prov, t);

            JSONObject p = VerificationStore.pending(c);
            if (p != null) {
                if (System.currentTimeMillis() > p.optLong("deadline", 0)) {
                    VerificationStore.clearPending(c);
                    p = null;
                }
            }

            if (p != null) {
                String wanted = p.optString("provider", "all");
                if (!"all".equalsIgnoreCase(wanted) && !"todos".equalsIgnoreCase(wanted)
                        && wanted.length() > 0 && prov != null && !wanted.equalsIgnoreCase(prov)
                        && !(wanted.equals("voda") && "vodacom".equals(prov))) {
                    return;
                }
                String wantId = SmsParser.normalizeId(p.optString("paymentId", ""));
                if (!wantId.equalsIgnoreCase(SmsParser.normalizeId(id))) return;
                double ev = p.optDouble("value", -999);
                if (ev > 0 && Math.abs(v - ev) > 0.05) return;
            }

            final String text = t;
            final String from = sender;
            final String payId = id;
            final double amt = v;
            final String provider = prov;
            new Thread(() -> {
                try {
                    VerificationApi.verifySms(c, text, from, payId, amt, provider);
                    VerificationStore.clearPending(c);
                } catch (Exception ignored) {}
            }).start();
        } catch (Exception ignored) {}
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
                process(c, hit.optString("text"));
            }
        } catch (Exception ignored) {}
    }
}
