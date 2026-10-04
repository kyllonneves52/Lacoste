package com.lacoste.auto;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public class ActivationActivity extends Activity {
    private EditText chave;
    private TextView detalhe;

    private int dp(float v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    private GradientDrawable round(int color, float radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(radiusDp));
        return d;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.rgb(11, 18, 32));
        }
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(28), dp(20), dp(24));
        root.setBackgroundColor(Color.rgb(11, 18, 32));

        TextView logo = new TextView(this);
        logo.setText("L");
        logo.setTextSize(28);
        logo.setTextColor(Color.WHITE);
        logo.setGravity(Gravity.CENTER);
        logo.setBackground(round(Color.rgb(15, 39, 68), 18));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(64), dp(64));
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        logo.setLayoutParams(lp);
        root.addView(logo);

        TextView t = new TextView(this);
        t.setText("LACOSTE AUTO");
        t.setTextSize(22);
        t.setTextColor(Color.WHITE);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(14), 0, 0);
        root.addView(t);

        TextView info = new TextView(this);
        info.setText("Cola a chave que o chefe te deu e envia o pedido. A ativação só entra depois da aprovação no painel.");
        info.setTextColor(Color.rgb(148, 163, 184));
        info.setTextSize(14);
        info.setPadding(0, dp(10), 0, dp(14));
        root.addView(info);

        TextView id = new TextView(this);
        id.setText("ID do dispositivo\n" + ApiClient.obterAndroidId(this));
        id.setTextColor(Color.rgb(148, 163, 184));
        id.setTextSize(12);
        id.setPadding(dp(12), dp(10), dp(12), dp(10));
        id.setBackground(round(Color.rgb(22, 32, 51), 12));
        root.addView(id);

        TextView label = new TextView(this);
        label.setText("Chave de licença");
        label.setTextColor(Color.rgb(148, 163, 184));
        label.setTextSize(12);
        label.setPadding(0, dp(16), 0, dp(6));
        root.addView(label);

        chave = new EditText(this);
        chave.setHint("Ex: a chave do chefe");
        chave.setSingleLine(true);
        chave.setTextColor(Color.WHITE);
        chave.setHintTextColor(Color.GRAY);
        chave.setTextSize(16);
        chave.setPadding(dp(14), dp(14), dp(14), dp(14));
        chave.setBackground(round(Color.rgb(30, 40, 56), 12));
        chave.setMinHeight(dp(52));
        root.addView(chave, new LinearLayout.LayoutParams(-1, LinearLayout.LayoutParams.WRAP_CONTENT));

        Button enviar = new Button(this);
        enviar.setText("Enviar pedido");
        enviar.setAllCaps(false);
        enviar.setTextColor(Color.rgb(6, 40, 15));
        enviar.setTextSize(16);
        enviar.setBackground(round(Color.rgb(34, 197, 94), 12));
        enviar.setMinHeight(dp(52));
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-1, LinearLayout.LayoutParams.WRAP_CONTENT);
        bp.topMargin = dp(14);
        root.addView(enviar, bp);

        detalhe = new TextView(this);
        detalhe.setTextColor(Color.rgb(148, 163, 184));
        detalhe.setTextSize(13);
        detalhe.setPadding(0, dp(14), 0, dp(8));
        root.addView(detalhe);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(11, 18, 32));
        scroll.addView(root);
        setContentView(scroll);

        enviar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String c = chave.getText().toString().trim().toUpperCase();
                if (c.isEmpty()) {
                    detalhe.setText("Digite a chave.");
                    chave.requestFocus();
                    return;
                }
                detalhe.setText("A enviar pedido...");
                LicenseManager.solicitar(ActivationActivity.this, c, new LicenseManager.Callback() {
                    @Override
                    public void onResultado(final boolean ok, final String msg) {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                detalhe.setText(msg);
                                if (ok && LicenseManager.estaAtivado(ActivationActivity.this)) {
                                    startActivity(new Intent(ActivationActivity.this, MainActivity.class));
                                    finish();
                                }
                            }
                        });
                    }
                });
            }
        });

        LicenseManager.verificarOnline(this, new LicenseManager.Callback() {
            @Override
            public void onResultado(final boolean ok, final String msg) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (ok && LicenseManager.estaAtivado(ActivationActivity.this)) {
                            startActivity(new Intent(ActivationActivity.this, MainActivity.class));
                            finish();
                        }
                    }
                });
            }
        });
    }
}
