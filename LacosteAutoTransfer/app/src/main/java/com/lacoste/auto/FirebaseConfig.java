package com.lacoste.auto;

import android.content.Context;
import android.util.Log;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

public final class FirebaseConfig {
    private static final String TAG = "LacosteFirebase";
    private FirebaseConfig() {}

    public static boolean inicializar(Context context) {
        try {
            if (FirebaseApp.getApps(context).size() > 0) return true;
            String apiKey = BuildConfig.FIREBASE_API_KEY;
            String appId = BuildConfig.FIREBASE_APP_ID;
            String projectId = BuildConfig.FIREBASE_PROJECT_ID;
            String senderId = BuildConfig.FIREBASE_MESSAGING_SENDER_ID;
            if (isBlank(apiKey) || isBlank(appId) || isBlank(projectId) || isBlank(senderId)) {
                Log.w(TAG, "Firebase ainda não configurado no build.");
                return false;
            }
            FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApiKey(apiKey)
                    .setApplicationId(appId)
                    .setProjectId(projectId)
                    .setGcmSenderId(senderId)
                    .build();
            FirebaseApp.initializeApp(context.getApplicationContext(), options);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Falha ao inicializar Firebase", e);
            return false;
        }
    }
    private static boolean isBlank(String s) { return s == null || s.trim().isEmpty(); }
}
