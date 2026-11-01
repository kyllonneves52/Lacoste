package com.lacoste.verification;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends Activity {
    LinearLayout root;
    TextView status;
    EditText key;
    EditText mbId;

    int dp(int x) { return (int) (x * getResources().getDisplayMetrics().density + .5f); }

    TextView tv(String x) {
        TextView t = new TextView(this);
        t.setText(x);
        t.setTextSize(15);
        t.setPadding(0, dp(8), 0, dp(8));
        return t;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        ui();
    }

    void ui() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(25), dp(18), dp(25));
        root.addView(tv("LC VERIFICATION / mainSMS"));
        root.addView(tv("Verifica SMS de dinheiro RECEBIDO (M-Pesa e E-Mola)."));
        root.addView(tv("Device ID deste telemóvel SMS: " + VerificationStore.deviceId(this)));
        status = tv("Estado: a verificar...");
        root.addView(status);

        key = new EditText(this);
        key.setHint("Chave de licença");
        root.addView(key);

        Button b = new Button(this);
        b.setText("Ativar / verificar licença");
        root.addView(b);

        root.addView(tv("Android ID do mainMB (o telemóvel que envia MB)"));
        mbId = new EditText(this);
        mbId.setHint("Cola aqui o Android ID que aparece no app MB");
        mbId.setText(VerificationStore.mbAndroidId(this));
        root.addView(mbId);

        Button save = new Button(this);
        save.setText("Salvar e associar ao mainMB");
        root.addView(save);

        Button sms = new Button(this);
        sms.setText("Permitir SMS e notificações");
        root.addView(sms);

        Button notif = new Button(this);
        notif.setText("Abrir acesso às notificações");
        root.addView(notif);

        Button ver = new Button(this);
        ver.setText("Ver últimos SMS recebidos");
        root.addView(ver);

        b.setOnClickListener(v -> ativar());
        save.setOnClickListener(v -> associar());
        sms.setOnClickListener(v -> pedir());
        ver.setOnClickListener(v -> mostrarSms());
        notif.setOnClickListener(v -> {
            try { startActivity(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")); }
            catch (Exception ignored) {}
        });
        setContentView(root);
        pedir();
        verificar();
    }

    void pedir() {
        if (Build.VERSION.SDK_INT >= 23) {
            requestPermissions(new String[]{
                    Manifest.permission.RECEIVE_SMS,
                    Manifest.permission.READ_SMS,
                    Manifest.permission.POST_NOTIFICATIONS
            }, 44);
        }
    }

    void ativar() {
        String k = key.getText().toString().trim();
        if (k.isEmpty()) {
            status.setText("Estado: introduz a chave.");
            return;
        }
        status.setText("Estado: a enviar pedido...");
        new Thread(() -> {
            try {
                org.json.JSONObject r = VerificationApi.requestLicense(this, k);
                if (r.optBoolean("ok")) {
                    VerificationStore.setLicense(this, k);
                    VerificationStore.setRequestId(this, r.optString("requestId"));
                    if ("approved".equals(r.optString("status"))) {
                        VerificationStore.setToken(this, r.optString("deviceToken"));
                        VerificationStore.setExpires(this, r.optString("expiresAt"));
                    }
                    runOnUiThread(() -> status.setText("Estado: " + r.optString("status")));
                } else {
                    runOnUiThread(() -> status.setText("Erro: " + r.optString("message")));
                }
            } catch (Exception e) {
                runOnUiThread(() -> status.setText("Erro: " + e.getMessage()));
            }
        }).start();
    }

    void associar() {
        final String aid = mbId.getText().toString().trim();
        if (aid.isEmpty()) {
            status.setText("Estado: cola o Android ID do mainMB.");
            return;
        }
        VerificationStore.setMbAndroidId(this, aid);
        status.setText("Estado: a associar ao mainMB...");
        new Thread(() -> {
            try {
                final String[] fcm = {""};
                try {
                    com.google.android.gms.tasks.Tasks.await(FirebaseMessaging.getInstance().getToken());
                } catch (Exception ignored) {}
                try {
                    fcm[0] = com.google.android.gms.tasks.Tasks.await(FirebaseMessaging.getInstance().getToken());
                } catch (Exception ignored) {}
                org.json.JSONObject r = VerificationApi.associarMb(this, aid, fcm[0]);
                final String msg = r.optBoolean("ok")
                        ? ("Associado. Grupos: " + r.optJSONArray("gruposAssociados"))
                        : ("Erro: " + r.optString("message"));
                runOnUiThread(() -> status.setText(msg));
            } catch (Exception e) {
                runOnUiThread(() -> status.setText("Erro ao associar: " + e.getMessage()));
            }
        }).start();
    }

    void verificar() {
        FirebaseConfig.init(this);
        try {
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(t ->
                    new Thread(() -> {
                        try { VerificationApi.register(this, t); } catch (Exception ignored) {}
                    }).start());
        } catch (Exception ignored) {}
        new Thread(() -> {
            try {
                org.json.JSONObject r = VerificationApi.status(this);
                if ("approved".equals(r.optString("status"))) {
                    VerificationStore.setToken(this, r.optString("deviceToken", VerificationStore.token(this)));
                    VerificationStore.setExpires(this, r.optString("expiresAt"));
                }
                runOnUiThread(() -> status.setText("Estado: " + r.optString("status")
                        + (VerificationStore.mbAndroidId(this).isEmpty() ? " | falta Android ID do MB" : " | MB: " + VerificationStore.mbAndroidId(this))));
            } catch (Exception e) {
                runOnUiThread(() -> status.setText("Estado: servidor indisponível"));
            }
        }).start();
    }

    void mostrarSms() {
        try {
            if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.READ_SMS) != 0) {
                pedir();
                return;
            }
            android.database.Cursor c = getContentResolver().query(
                    android.net.Uri.parse("content://sms/inbox"),
                    new String[]{"address", "body", "date"},
                    null, null, "date DESC LIMIT 10");
            StringBuilder x = new StringBuilder("ÚLTIMOS SMS\n\n");
            if (c != null) {
                while (c.moveToNext()) {
                    String body = c.getString(1);
                    x.append(c.getString(0)).append("\n");
                    x.append(body).append("\n");
                    x.append("IN? ").append(SmsParser.isIncoming(body))
                            .append(" ID=").append(SmsParser.id(body))
                            .append(" ").append(SmsParser.value(body)).append("MT\n\n");
                }
                c.close();
            }
            new AlertDialog.Builder(this).setTitle("SMS recebidos").setMessage(x.toString()).setPositiveButton("Fechar", null).show();
        } catch (Exception e) {
            Toast.makeText(this, "Não foi possível ler os SMS: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }
}
