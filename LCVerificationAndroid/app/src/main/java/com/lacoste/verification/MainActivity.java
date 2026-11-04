package com.lacoste.verification;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
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
    EditText mbId;
    EditText lucroMb;
    EditText lucroMt;
    TextView financeSummary;
    TextView financeChart;
    TextView financeHistory;
    LinearLayout financeSection;
    ProfitChartView profitChartView;
    TextView salesStats;
    TextView packageStats;
    ProfitChartView salesChartView;
    ConnectivityManager connectivityManager;
    ConnectivityManager.NetworkCallback networkCallback;
    EditText receiptSearch;
    TextView receiptResult;

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
        iniciarMonitorRedeSms();
        VerificationProcessor.retryQueued(this);
    }

    void iniciarMonitorRedeSms() {
        try {
            connectivityManager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (connectivityManager == null || Build.VERSION.SDK_INT < 24) return;
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network network) {
                    VerificationProcessor.retryQueued(getApplicationContext());
                }
            };
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception ignored) {}
    }

    @Override protected void onDestroy() {
        try { if (connectivityManager != null && networkCallback != null) connectivityManager.unregisterNetworkCallback(networkCallback); }
        catch (Exception ignored) {}
        super.onDestroy();
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

        LinearLayout sMb = section("ASSOCIAÇÃO mainMB");
        sMb.addView(label("Android ID do telemóvel que envia MB", false));
        mbId = field("Cola aqui o Android ID do app MB");
        mbId.setText(VerificationStore.mbAndroidId(this));
        sMb.addView(mbId);
        Button bAssoc = btn("Salvar e associar ao mainMB");
        sMb.addView(bAssoc);
        root.addView(sMb);

        financeSection = section("PAINEL FINANCEIRO");
        financeSection.addView(label("Lucro calculado apenas após a transferência ser confirmada pelo Lacoste Auto.", false));
        financeSummary = label("A carregar estatísticas...", false); financeSummary.setTextColor(TEXT); financeSection.addView(financeSummary);
        financeChart = label("Gráfico dos últimos 30 dias", false); financeChart.setTextColor(ACCENT); financeSection.addView(financeChart);
        profitChartView = new ProfitChartView(this);
        LinearLayout.LayoutParams cpl = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(180));
        profitChartView.setLayoutParams(cpl);
        financeSection.addView(profitChartView);
        Button refreshFinance = btn("↻ Atualizar estatísticas"); financeSection.addView(refreshFinance);
        financeSection.addView(label("TABELA DE LUCRO POR PACOTE", true));
        lucroMb = field("Quantidade de MB (ex.: 220)"); financeSection.addView(lucroMb);
        lucroMt = field("Lucro em MT (ex.: 2,00)"); financeSection.addView(lucroMt);
        Button saveProfit = btn("Guardar / atualizar pacote"); financeSection.addView(saveProfit);
        financeHistory = label("Histórico de vendas concluídas", false); financeHistory.setTextColor(TEXT); financeSection.addView(financeHistory);
        root.addView(financeSection);

        LinearLayout salesSection = section("VENDAS E ESTATÍSTICAS");
        salesSection.addView(label("Vendas por período, pacotes mais comprados e faturação confirmada.", false));
        salesStats = label("A carregar vendas…", false); salesStats.setTextColor(TEXT); salesSection.addView(salesStats);
        packageStats = label("Pacotes mais comprados", true); salesSection.addView(packageStats);
        root.addView(salesSection);

        LinearLayout searchSection = section("PESQUISAR COMPROVATIVO");
        searchSection.addView(label("Pesquisa exata pela referência registada no servidor.", false));
        receiptSearch = field("Referência do comprovativo"); searchSection.addView(receiptSearch);
        Button searchReceipt = btn("Pesquisar referência"); searchSection.addView(searchReceipt);
        receiptResult = label("Nenhuma pesquisa realizada.", false); receiptResult.setTextColor(TEXT); searchSection.addView(receiptResult);
        root.addView(searchSection);
        searchReceipt.setOnClickListener(v -> pesquisarComprovativo());

        salesChartView = new ProfitChartView(this);
        salesChartView.setTitle("Vendas concluídas (30 dias)");
        salesSection.addView(salesChartView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(180)));
        refreshFinance.setOnClickListener(v -> carregarFinanceiro());
        saveProfit.setOnClickListener(v -> guardarLucro());

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

        menuBtn.setOnClickListener(v -> {
            final String[] opcoes = {"Início", "Estado", "Associação mainMB", "Painel financeiro", "Vendas e estatísticas", "Pesquisar comprovativo", "Permissões e manter ativo"};
            final int[] indices = {1, 3, 4, root.indexOfChild(financeSection), root.indexOfChild(salesSection), root.indexOfChild(searchSection), root.indexOfChild(sPerm)};
            new AlertDialog.Builder(this)
                    .setTitle("LC Verification — Menu")
                    .setItems(opcoes, (dialog, which) -> {
                        View alvo = root.getChildAt(indices[which]);
                        if (alvo != null) scroll.smoothScrollTo(0, alvo.getTop());
                    })
                    .setNegativeButton("Fechar", null)
                    .show();
        });

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
        financeSummary.setText("A sincronizar com a API...");
        new Thread(() -> {
            try {
                org.json.JSONObject b = new org.json.JSONObject(); b.put("action", "dashboard");
                org.json.JSONObject r = VerificationApi.finance(this, b);
                if (!r.optBoolean("ok")) throw new Exception(r.optString("message", "Falha financeira"));
                org.json.JSONObject sm = r.optJSONObject("summary");
                org.json.JSONObject hoje = sm == null ? new org.json.JSONObject() : sm.optJSONObject("today");
                org.json.JSONObject semana = sm == null ? new org.json.JSONObject() : sm.optJSONObject("week");
                org.json.JSONObject mes = sm == null ? new org.json.JSONObject() : sm.optJSONObject("month");
                org.json.JSONObject total = sm == null ? new org.json.JSONObject() : sm.optJSONObject("total");
                String resumo = "HOJE: " + valor(hoje) + " MT\n7 DIAS: " + valor(semana) + " MT\nESTE MÊS: " + valor(mes) + " MT\nACUMULADO: " + valor(total) + " MT";
                org.json.JSONArray dias = r.optJSONArray("days"); StringBuilder graf = new StringBuilder("GRÁFICO — ÚLTIMOS 30 DIAS\n");
                if (dias != null) for (int i=0;i<dias.length();i++){org.json.JSONObject d=dias.optJSONObject(i);if(d!=null){double v=d.optDouble("lucro",0);int n=(int)Math.min(18,Math.round(v));graf.append(d.optString("dia")).append("  "); for(int z=0;z<Math.max(0,n);z++) graf.append("▮"); graf.append(" ").append(v).append(" MT\n");}}
                org.json.JSONArray packs=r.optJSONArray("packages"); StringBuilder h=new StringBuilder("TABELA DE LUCRO CONFIGURADA\n");
                if(packs!=null)for(int i=0;i<packs.length();i++){org.json.JSONObject p=packs.optJSONObject(i);if(p!=null)h.append(p.optInt("mb")).append(" MB = ").append(p.optDouble("profit_mt",0)).append(" MT\n");}
                h.append("\nHISTÓRICO RECENTE\n");
                org.json.JSONArray hist=r.optJSONArray("history");
                if(hist!=null)for(int i=0;i<Math.min(hist.length(),15);i++){org.json.JSONObject x=hist.optJSONObject(i);if(x!=null)h.append(x.optString("completed_at")).append(" | ").append(x.optInt("mb")).append(" MB | +").append(x.optDouble("profit_mt",0)).append(" MT\n");}
                org.json.JSONObject sales = sm == null ? new org.json.JSONObject() : sm.optJSONObject("sales");
                String vendaResumo = "HOJE: " + (sales==null?0:sales.optInt("today")) + "\nONTEM: " + (sales==null?0:sales.optInt("yesterday")) + "\nANTEONTEM: " + (sales==null?0:sales.optInt("before_yesterday")) + "\nÚLTIMOS 7 DIAS: " + (sales==null?0:sales.optInt("week"));
                org.json.JSONArray tops = r.optJSONArray("topPackages"); StringBuilder topText = new StringBuilder("PACOTES MAIS COMPRADOS (7 DIAS)\n");
                if(tops!=null) for(int i=0;i<tops.length();i++){org.json.JSONObject t=tops.optJSONObject(i);if(t!=null)topText.append(t.optInt("mb")).append(" MB — ").append(t.optInt("sales")).append(" vendas\n");}
                org.json.JSONArray salesDays = r.optJSONArray("dailySales");
                java.util.List<ProfitChartView.Bar> salesBars = new java.util.ArrayList<>();
                if(salesDays!=null) for(int i=0;i<salesDays.length();i++){org.json.JSONObject d=salesDays.optJSONObject(i);if(d!=null){String day=d.optString("day","");if(day.length()>=5)day=day.substring(5);salesBars.add(new ProfitChartView.Bar(day,(float)d.optInt("sales",0)));}}
                String g=graf.toString(),hh=h.toString(),vs=vendaResumo,pt=topText.toString();runOnUiThread(()->{
                  financeSummary.setText(resumo);financeChart.setText(g);financeHistory.setText(hh);
                  salesStats.setText(vs); packageStats.setText(pt);
                  if(!salesBars.isEmpty()) salesChartView.setData(salesBars);
                  try {
                    org.json.JSONArray chart = r.optJSONArray("chart7");
                    if (chart == null) chart = r.optJSONArray("chart30");
                    java.util.List<ProfitChartView.Bar> bars = new java.util.ArrayList<>();
                    if (chart != null) {
                      for (int i=0;i<chart.length();i++) {
                        org.json.JSONObject c = chart.getJSONObject(i);
                        String day = c.optString("day", "");
                        if (day.length()>=5) day = day.substring(day.length()-5);
                        bars.add(new ProfitChartView.Bar(day, (float)c.optDouble("total",0)));
                      }
                    }
                    if (profitChartView != null) {
                      profitChartView.setTitle("Lucros (MT)");
                      if (bars.isEmpty()) profitChartView.setSampleWeek();
                      else profitChartView.setData(bars);
                    }
                  } catch (Exception ignored) {}
                });
            } catch(Exception e){runOnUiThread(()->financeSummary.setText("Painel indisponível: "+e.getMessage()));}
        }).start();
    }
    String valor(org.json.JSONObject o){return o==null?"0":String.format(java.util.Locale.US,"%.2f",o.optDouble("total",0))+" ("+o.optInt("vendas",0)+" vendas)";}
    void guardarLucro(){try{int mb=Integer.parseInt(lucroMb.getText().toString().trim());double mt=Double.parseDouble(lucroMt.getText().toString().trim().replace(',','.'));new Thread(()->{try{org.json.JSONObject b=new org.json.JSONObject();b.put("action","savePackage");b.put("mb",mb);b.put("profitMt",mt);org.json.JSONObject r=VerificationApi.finance(this,b);runOnUiThread(()->{Toast.makeText(this,r.optString("message",r.optBoolean("ok")?"Tabela guardada":"Erro ao guardar"),Toast.LENGTH_LONG).show();if(r.optBoolean("ok"))carregarFinanceiro();});}catch(Exception e){runOnUiThread(()->Toast.makeText(this,"Erro: "+e.getMessage(),Toast.LENGTH_LONG).show());}}).start();}catch(Exception e){Toast.makeText(this,"Indica MB e lucro válidos.",Toast.LENGTH_SHORT).show();}}

    void pesquisarComprovativo() {
        String ref = receiptSearch == null ? "" : receiptSearch.getText().toString().trim();
        if (ref.length() < 4) { receiptResult.setText("Introduz uma referência válida (mínimo 4 caracteres)."); return; }
        receiptResult.setText("A pesquisar na API…");
        new Thread(() -> {
            try {
                org.json.JSONObject body = new org.json.JSONObject(); body.put("action", "searchReceipt"); body.put("reference", ref);
                org.json.JSONObject result = VerificationApi.finance(this, body);
                org.json.JSONArray rows = result.optJSONArray("results"); StringBuilder out = new StringBuilder();
                if (rows == null || rows.length() == 0) out.append("Comprovativo não encontrado.");
                else for (int i=0;i<rows.length();i++) { org.json.JSONObject x=rows.optJSONObject(i); if(x==null) continue;
                    out.append("REGISTO ENCONTRADO\nReferência: ").append(x.optString("reference", ref))
                       .append("\nEstado: ").append(x.optString("status"))
                       .append("\nValor: ").append(x.optDouble("amount_mt",0)).append(" MT")
                       .append("\nPedido: ").append(x.optString("order_id"))
                       .append("\nNúmero: ").append(x.optString("number","—"))
                       .append("\nPacote: ").append(x.optInt("quantity_mb")).append(" MB\n\n");
                }
                String text=out.toString(); runOnUiThread(() -> receiptResult.setText(text));
            } catch(Exception e) { runOnUiThread(() -> receiptResult.setText("Erro na pesquisa: "+e.getMessage())); }
        }).start();
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
                String fcm = "";
                try {
                    fcm = com.google.android.gms.tasks.Tasks.await(FirebaseMessaging.getInstance().getToken());
                } catch (Exception ignored) {}
                if (VerificationStore.token(this).trim().isEmpty()) {
                    org.json.JSONObject registration = VerificationApi.register(this, fcm);
                    if (!registration.optBoolean("ok") || VerificationStore.token(this).trim().isEmpty()) {
                        throw new Exception(registration.optString("message", "Não foi possível registar o dispositivo."));
                    }
                }
                org.json.JSONObject r = VerificationApi.associarMb(this, aid, fcm);
                final String msg = r.optBoolean("ok")
                        ? ("Associado. Grupos: " + r.optJSONArray("gruposAssociados"))
                        : ("Erro: " + r.optString("message"));
                runOnUiThread(() -> { status.setText(msg); if (r.optBoolean("ok")) carregarFinanceiro(); });
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
                        try {
                            org.json.JSONObject r = VerificationApi.register(this, t);
                            String linked = VerificationStore.mbAndroidId(this);
                            String message = r.optBoolean("ok")
                                    ? "App livre • dispositivo registado" + (linked.isEmpty() ? " • falta associar mainMB" : " • mainMB: " + linked)
                                    : "Registo: " + r.optString("message", "não confirmado");
                            runOnUiThread(() -> {
                                status.setText("Estado: " + message);
                                if (r.optBoolean("ok")) {
                                    if (!linked.isEmpty()) carregarFinanceiro();
                                    new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
                                            () -> VerificationProcessor.retryQueued(getApplicationContext()), 2500L);
                                }
                            });
                        } catch (Exception e) {
                            runOnUiThread(() -> status.setText("Estado: falha no registo — " + e.getMessage()));
                        }
                    }).start());
        } catch (Exception e) {
            status.setText("Estado: não foi possível iniciar o registo do dispositivo.");
        }
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
