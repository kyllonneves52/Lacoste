package com.lacoste.verification;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * LC Verification — layout melhorado (estilo limpo semelhante ao menu do Auto).
 * Mantém a lógica original; acrescenta pedido de optimização de bateria
 * para o app continuar a verificar pagamentos em segundo plano.
 */
public class MainActivity extends Activity {
    LinearLayout root;
    TextView status;
    EditText key;
    EditText mbId;
    EditText profitMb;
    EditText profitValue;
    TextView financeToday;
    TextView financeWeek;
    TextView financeMonth;
    TextView financeAll;
    TextView financeRules;
    TextView financeHistory;
    ProfitChartView financeChart;

    static final int BG = Color.parseColor("#05070D");
    static final int CARD = Color.parseColor("#0A1220");
    static final int ACCENT = Color.parseColor("#00D4FF");
    static final int TEXT = Color.parseColor("#D8E6F2");
    static final int MUTED = Color.parseColor("#7F93A8");
    static final int BORDER = Color.parseColor("#1F3350");

    int dp(int x) {
        return (int) (x * getResources().getDisplayMetrics().density + .5f);
    }

    GradientDrawable cardBg() {
        GradientDrawable d = new GradientDrawable();
        d.setColor(CARD);
        d.setCornerRadius(dp(12));
        d.setStroke(dp(1), BORDER);
        return d;
    }

    TextView label(String x, boolean accent) {
        TextView t = new TextView(this);
        t.setText(x);
        t.setTextSize(accent ? 13 : 14);
        t.setTextColor(accent ? ACCENT : MUTED);
        t.setPadding(0, dp(6), 0, dp(4));
        if (accent) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    TextView metricCard(String initial) {
        TextView t = new TextView(this);
        t.setText(initial);
        t.setTextColor(TEXT);
        t.setTextSize(14);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER_VERTICAL);
        t.setPadding(dp(12), dp(8), dp(8), dp(8));
        t.setBackground(cardBg());
        return t;
    }

    Button btn(String title) {
        Button b = new Button(this);
        b.setText(title);
        b.setAllCaps(false);
        b.setTextColor(ACCENT);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#0B1626"));
        bg.setCornerRadius(dp(8));
        bg.setStroke(dp(1), ACCENT);
        b.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(6);
        lp.bottomMargin = dp(2);
        b.setLayoutParams(lp);
        b.setPadding(dp(12), dp(12), dp(12), dp(12));
        return b;
    }

    EditText field(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setHintTextColor(MUTED);
        e.setTextColor(TEXT);
        e.setTextSize(14);
        e.setPadding(dp(12), dp(12), dp(12), dp(12));
        e.setBackground(cardBg());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(6);
        e.setLayoutParams(lp);
        return e;
    }

    LinearLayout section(String title) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(14), dp(12), dp(14), dp(12));
        box.setBackground(cardBg());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(12);
        box.setLayoutParams(lp);
        TextView h = new TextView(this);
        h.setText(title);
        h.setTextColor(ACCENT);
        h.setTextSize(13);
        h.setTypeface(Typeface.DEFAULT_BOLD);
        h.setLetterSpacing(0.08f);
        box.addView(h);
        return box;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 21) {
            getWindow().setStatusBarColor(BG);
            getWindow().setNavigationBarColor(BG);
        }
        ui();
        pedirIgnorarBateriaSePreciso();
    }

    void ui() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(20), dp(16), dp(28));
        root.setBackgroundColor(BG);

        // Barra superior com menu lateral (três barras), sem importar código do Aurum.
        LinearLayout topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setPadding(0, 0, 0, dp(10));
        Button menuBtn = btn("☰");
        LinearLayout.LayoutParams menuLp = new LinearLayout.LayoutParams(dp(56), dp(48));
        menuBtn.setLayoutParams(menuLp);
        TextView topTitle = new TextView(this);
        topTitle.setText("LC Verification");
        topTitle.setTextColor(TEXT);
        topTitle.setTextSize(17);
        topTitle.setTypeface(Typeface.DEFAULT_BOLD);
        topTitle.setPadding(dp(12), 0, 0, 0);
        topBar.addView(menuBtn);
        topBar.addView(topTitle);
        root.addView(topBar);

        TextView logo = new TextView(this);
        logo.setText("LC VERIFICATION");
        logo.setTextColor(ACCENT);
        logo.setTextSize(22);
        logo.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        logo.setLetterSpacing(0.12f);
        logo.setGravity(Gravity.CENTER);
        root.addView(logo);

        TextView sub = new TextView(this);
        sub.setText("Verifica SMS de dinheiro RECEBIDO\n(M-Pesa e E-Mola)");
        sub.setTextColor(MUTED);
        sub.setTextSize(13);
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(0, dp(6), 0, dp(14));
        root.addView(sub);

        LinearLayout sStatus = section("ESTADO");
        TextView device = label("Device ID SMS: " + VerificationStore.deviceId(this), false);
        device.setTextColor(TEXT);
        sStatus.addView(device);
        status = label("Estado: a verificar...", true);
        status.setTextColor(TEXT);
        sStatus.addView(status);
        root.addView(sStatus);

        LinearLayout sFinance = section("PAINEL FINANCEIRO");
        TextView financeIntro = label("Lucro calculado apenas depois da transferência ser confirmada pelo Lacoste Auto.", false);
        financeIntro.setTextColor(MUTED);
        sFinance.addView(financeIntro);
        LinearLayout metricRow1 = new LinearLayout(this);
        metricRow1.setOrientation(LinearLayout.HORIZONTAL);
        financeToday = metricCard("HOJE\n— MT");
        financeWeek = metricCard("7 DIAS\n— MT");
        metricRow1.addView(financeToday, new LinearLayout.LayoutParams(0, dp(76), 1f));
        LinearLayout.LayoutParams weekLp = new LinearLayout.LayoutParams(0, dp(76), 1f); weekLp.leftMargin = dp(8);
        metricRow1.addView(financeWeek, weekLp);
        sFinance.addView(metricRow1);
        LinearLayout metricRow2 = new LinearLayout(this);
        metricRow2.setOrientation(LinearLayout.HORIZONTAL);
        financeMonth = metricCard("ESTE MÊS\n— MT");
        financeAll = metricCard("ACUMULADO\n— MT");
        LinearLayout.LayoutParams monthLp = new LinearLayout.LayoutParams(0, dp(76), 1f); monthLp.topMargin = dp(8);
        metricRow2.addView(financeMonth, monthLp);
        LinearLayout.LayoutParams allLp = new LinearLayout.LayoutParams(0, dp(76), 1f); allLp.leftMargin = dp(8); allLp.topMargin = dp(8);
        metricRow2.addView(financeAll, allLp);
        sFinance.addView(metricRow2);
        financeChart = new ProfitChartView(this);
        financeChart.setBackground(cardBg());
        LinearLayout.LayoutParams chartLp = new LinearLayout.LayoutParams(-1, dp(190));
        chartLp.topMargin = dp(4);
        chartLp.bottomMargin = dp(8);
        financeChart.setLayoutParams(chartLp);
        sFinance.addView(financeChart);
        Button refreshFinance = btn("↻ Atualizar estatísticas");
        sFinance.addView(refreshFinance);
        root.addView(sFinance);

        LinearLayout sRules = section("TABELA DE LUCRO POR PACOTE");
        sRules.addView(label("Define quanto ganhas por cada pacote concluído. Exemplo: 220 MB = 2 MT.", false));
        profitMb = field("Quantidade de MB (ex.: 220)");
        profitMb.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        profitValue = field("Lucro em MT (ex.: 2,00)");
        profitValue.setInputType(android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL);
        sRules.addView(profitMb);
        sRules.addView(profitValue);
        Button saveRule = btn("Guardar / atualizar pacote");
        Button deleteRule = btn("Remover pacote indicado");
        sRules.addView(saveRule);
        sRules.addView(deleteRule);
        financeRules = label("Ainda não existem regras.", false);
        financeRules.setTextColor(TEXT);
        sRules.addView(financeRules);
        root.addView(sRules);

        LinearLayout sHistory = section("HISTÓRICO DE LUCROS");
        financeHistory = label("A carregar histórico...", false);
        financeHistory.setTextColor(TEXT);
        sHistory.addView(financeHistory);
        root.addView(sHistory);

        LinearLayout sLic = section("LICENÇA");
        key = field("Chave de licença");
        sLic.addView(key);
        Button bAtivar = btn("Ativar / verificar licença");
        sLic.addView(bAtivar);
        root.addView(sLic);

        LinearLayout sMb = section("ASSOCIAÇÃO mainMB");
        sMb.addView(label("Android ID do telemóvel que envia MB", false));
        mbId = field("Cola aqui o Android ID do app MB");
        mbId.setText(VerificationStore.mbAndroidId(this));
        sMb.addView(mbId);
        Button bAssoc = btn("Salvar e associar ao mainMB");
        sMb.addView(bAssoc);
        root.addView(sMb);

        LinearLayout sPerm = section("PERMISSÕES E MANTER ATIVO");
        Button bSms = btn("Permitir SMS e notificações");
        Button bNotif = btn("Abrir acesso às notificações");
        Button bBat = btn("Não optimizar bateria (manter activo)");
        Button bVer = btn("Ver últimos SMS recebidos");
        sPerm.addView(bSms);
        sPerm.addView(bNotif);
        sPerm.addView(bBat);
        sPerm.addView(bVer);
        root.addView(sPerm);

        TextView foot = new TextView(this);
        foot.setText("Mantenha a optimização de bateria DESLIGADA\npara o app continuar a verificar pagamentos.");
        foot.setTextColor(MUTED);
        foot.setTextSize(12);
        foot.setGravity(Gravity.CENTER);
        foot.setPadding(0, dp(8), 0, 0);
        root.addView(foot);

        menuBtn.setOnClickListener(v -> abrirDrawer(menuBtn, scroll,
                new String[]{"Início", "Estado", "Painel financeiro", "Tabela de lucro", "Histórico de lucros", "Licença", "Associação mainMB", "Permissões e manter ativo"},
                new View[]{logo, sStatus, sFinance, sRules, sHistory, sLic, sMb, sPerm}));
        refreshFinance.setOnClickListener(v -> carregarFinanceiro());
        saveRule.setOnClickListener(v -> guardarRegra());
        deleteRule.setOnClickListener(v -> removerRegra());

        bAtivar.setOnClickListener(v -> ativar());
        bAssoc.setOnClickListener(v -> associar());
        bSms.setOnClickListener(v -> pedir());
        bNotif.setOnClickListener(v -> {
            try {
                Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
                startActivity(i);
            } catch (Exception e) {
                Toast.makeText(this, "Abra Definições → Acesso a notificações", Toast.LENGTH_LONG).show();
            }
        });
        bBat.setOnClickListener(v -> pedirIgnorarBateria());
        bVer.setOnClickListener(v -> mostrarSms());

        scroll.addView(root);
        setContentView(scroll);
        verificar();
        carregarFinanceiro();
    }

    void carregarFinanceiro() {
        if (financeToday != null) financeToday.setText("HOJE\nA sincronizar...");
        new Thread(() -> {
            try {
                org.json.JSONObject r = VerificationApi.financeDashboard(this);
                if (!r.optBoolean("ok")) throw new Exception(r.optString("message", "Não foi possível carregar."));
                org.json.JSONObject t = r.optJSONObject("totals");
                org.json.JSONArray daily = r.optJSONArray("daily");
                org.json.JSONArray rules = r.optJSONArray("rules");
                org.json.JSONArray history = r.optJSONArray("history");
                String todayText = String.format(java.util.Locale.getDefault(), "HOJE\n%.2f MT\n%d vendas", t==null?0:t.optDouble("today"), t==null?0:t.optInt("todayCount"));
                String weekText = String.format(java.util.Locale.getDefault(), "7 DIAS\n%.2f MT\n%d vendas", t==null?0:t.optDouble("week"), t==null?0:t.optInt("weekCount"));
                String monthText = String.format(java.util.Locale.getDefault(), "ESTE MÊS\n%.2f MT\n%d vendas", t==null?0:t.optDouble("month"), t==null?0:t.optInt("monthCount"));
                String allText = String.format(java.util.Locale.getDefault(), "ACUMULADO\n%.2f MT\n%d vendas", t==null?0:t.optDouble("all"), t==null?0:t.optInt("allCount"));
                StringBuilder rb = new StringBuilder();
                if (rules != null) for (int i=0;i<rules.length();i++) {
                    org.json.JSONObject x=rules.optJSONObject(i); if(x==null)continue;
                    if(rb.length()>0)rb.append("\n");
                    rb.append("📦 ").append(x.optInt("quantity_mb")).append(" MB  →  ").append(String.format(java.util.Locale.getDefault(),"%.2f",x.optDouble("profit_mt"))).append(" MT");
                }
                if(rb.length()==0)rb.append("Sem tabela configurada. Adiciona o primeiro pacote acima.");
                StringBuilder hb = new StringBuilder();
                if(history!=null) for(int i=0;i<history.length();i++){
                    org.json.JSONObject x=history.optJSONObject(i);if(x==null)continue;
                    if(hb.length()>0)hb.append("\n\n");
                    hb.append("✓ ").append(x.optInt("quantity_mb")).append(" MB  +").append(String.format(java.util.Locale.getDefault(),"%.2f",x.optDouble("profit_mt"))).append(" MT");
                    hb.append("\n").append(x.optString("completed_at",""));
                    if(!x.optString("group_id","").isEmpty())hb.append(" · ").append(x.optString("group_id"));
                }
                if(hb.length()==0)hb.append("Ainda não há transferências concluídas com lucro registado.");
                final String finalToday=todayText, finalWeek=weekText, finalMonth=monthText, finalAll=allText, finalRules=rb.toString(), finalHistory=hb.toString();
                runOnUiThread(() -> {
                    financeToday.setText(finalToday);
                    financeWeek.setText(finalWeek);
                    financeMonth.setText(finalMonth);
                    financeAll.setText(finalAll);
                    financeRules.setText(finalRules);
                    financeHistory.setText(finalHistory);
                    financeChart.setData(daily);
                });
            } catch (Exception e) {
                runOnUiThread(() -> financeToday.setText("HOJE\nSem ligação à API"));
            }
        }).start();
    }

    void guardarRegra() {
        try {
            int mb=Integer.parseInt(profitMb.getText().toString().trim());
            double profit=Double.parseDouble(profitValue.getText().toString().trim().replace(',','.'));
            if(mb<=0||profit<0)throw new Exception("Valores inválidos.");
            status.setText("Estado: a guardar tabela de lucro...");
            new Thread(() -> {
                try {
                    org.json.JSONObject r=VerificationApi.saveProfitRule(this,mb,profit);
                    runOnUiThread(() -> { status.setText(r.optBoolean("ok")?"Tabela de lucro guardada.":"Erro: "+r.optString("message")); carregarFinanceiro(); });
                } catch(Exception e){runOnUiThread(() -> status.setText("Erro ao guardar: "+e.getMessage()));}
            }).start();
        } catch(Exception e){Toast.makeText(this,"Preenche MB e lucro corretamente.",Toast.LENGTH_LONG).show();}
    }

    void removerRegra() {
        try {
            int mb=Integer.parseInt(profitMb.getText().toString().trim());
            new Thread(() -> {
                try {
                    org.json.JSONObject r=VerificationApi.deleteProfitRule(this,mb);
                    runOnUiThread(() -> { status.setText(r.optBoolean("ok")?"Pacote removido da tabela.":"Erro: "+r.optString("message")); carregarFinanceiro(); });
                } catch(Exception e){runOnUiThread(() -> status.setText("Erro ao remover: "+e.getMessage()));}
            }).start();
        } catch(Exception e){Toast.makeText(this,"Indica a quantidade de MB a remover.",Toast.LENGTH_LONG).show();}
    }

    void abrirDrawer(View anchor, ScrollView scroll, String[] labels, View[] targets) {
        LinearLayout drawer = new LinearLayout(this);
        drawer.setOrientation(LinearLayout.VERTICAL);
        drawer.setPadding(dp(16), dp(24), dp(12), dp(16));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#08111E"));
        bg.setCornerRadii(new float[]{0,0,dp(18),dp(18),dp(18),dp(18),0,0});
        bg.setStroke(dp(1), BORDER);
        drawer.setBackground(bg);
        TextView brand = new TextView(this);
        brand.setText("LC VERIFICATION\nGestão e controlo");
        brand.setTextColor(ACCENT);
        brand.setTextSize(18);
        brand.setTypeface(Typeface.DEFAULT_BOLD);
        brand.setPadding(dp(8), dp(4), dp(8), dp(18));
        drawer.addView(brand);
        PopupWindow popup = new PopupWindow(drawer, dp(286), -1, true);
        popup.setBackgroundDrawable(cardBg());
        popup.setOutsideTouchable(true);
        popup.setElevation(dp(18));
        for (int i=0;i<labels.length;i++) {
            final int index=i;
            Button item=btn("›   "+labels[i]);
            item.setGravity(Gravity.CENTER_VERTICAL|Gravity.LEFT);
            item.setTextColor(TEXT);
            item.setBackgroundColor(Color.TRANSPARENT);
            drawer.addView(item);
            item.setOnClickListener(v -> {
                popup.dismiss();
                View target=targets[index];
                if(target!=null) scroll.post(() -> scroll.smoothScrollTo(0,target.getTop()));
                if(index==2||index==3||index==4) carregarFinanceiro();
            });
        }
        Button close=btn("Fechar menu");
        drawer.addView(close);
        close.setOnClickListener(v -> popup.dismiss());
        popup.showAtLocation(root, Gravity.LEFT|Gravity.TOP, 0, 0);
    }

    void pedirIgnorarBateriaSePreciso() {
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    status.setText(status.getText() + " | bateria: optimizada (toque no botão)");
                }
            }
        } catch (Exception ignored) {}
    }

    void pedirIgnorarBateria() {
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                Intent i = new Intent();
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null && pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    Toast.makeText(this, "Já está excluído da optimização de bateria.", Toast.LENGTH_LONG).show();
                    return;
                }
                i.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + getPackageName()));
                startActivity(i);
            } else {
                Toast.makeText(this, "Não necessário nesta versão do Android.", Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                startActivity(i);
            } catch (Exception e2) {
                Toast.makeText(this, "Abra Definições → Bateria → Não optimizar este app", Toast.LENGTH_LONG).show();
            }
        }
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
