package com.lacoste.verification;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import android.content.Context;

public class FirebasePushService extends FirebaseMessagingService {

    @Override
    public void onCreate() {
        super.onCreate();
        FirebaseConfig.init(this);
    }

    @Override
    public void onNewToken(String t) {
        try {
            VerificationApi.register(this, t);
        } catch (Exception ignored) {}
    }

    @Override
    public void onMessageReceived(RemoteMessage m) {
        try {
            if (m.getData() == null) return;
            String type = m.getData().get("type");
            if (type != null && "NEW_PAYMENT_VERIFICATION".equalsIgnoreCase(type)) {
                return;
            }

            String id = m.getData().get("pedidoId");
            String pid = m.getData().get("paymentId");
            String v = m.getData().get("valueMT");
            String provider = m.getData().get("paymentProvider");
            String deadlineStr = m.getData().get("deadline");

            long deadline = System.currentTimeMillis() + 30000;
            try {
                if (deadlineStr != null) {
                    deadline = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", java.util.Locale.US)
                            .parse(deadlineStr).getTime();
                }
            } catch (Exception ignored) {}

            double value = 0;
            try {
                value = Double.parseDouble(v == null ? "0" : v);
            } catch (Exception ignored) {}

            VerificationStore.setPending(this, id, pid, value, provider == null ? "all" : provider, deadline);

        } catch (Exception ignored) {}
    }
}
