package com.lacoste.auto;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Environment;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.widget.FrameLayout;
import android.app.AlertDialog;
import android.widget.Button; // <-- FALTAVA ESSA LINHA
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import com.lacoste.auto.PollingService;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final int REQ_PERMISSOES = 501;
    private static final int REQ_STORAGE = 100;

    private TextView sim1Saldo, sim2Saldo;
    private TextView sim1Restantes, sim2Restantes;
    private TextView acessibilidadeView;
    private TextView resultadoTransferencia, resultadoCredito;

    private TextView licencaView;
    private TextView licencaPerfil;
    private LinearLayout historicoLista;
    private LinearLayout paginaInicio;
    private LinearLayout paginaHistorico;
    private LinearLayout paginaPerfil;
    private Button navInicio;
    private Button navHistorico;
    private Button navPerfil;
    private final Handler licenseHandler = new Handler(Looper.getMainLooper());
    private final Runnable licenseCheckRunnable = new Runnable() {
        @Override public void run() {
            if (!LicenseManager.estaAtivado(MainActivity.this)) {
                licenseHandler.removeCallbacks(this);
                try {
                    startActivity(new Intent(MainActivity.this, ActivationActivity.class));
                    finish();
                } catch (Exception ignored) {}
                return;
            }
            if (licencaView!= null) {
                licencaView.setText("Licença: " + LicenseManager.tempoRestante(MainActivity.this));
            }
            if (licencaPerfil != null) {
                licencaPerfil.setText(LicenseManager.tempoRestante(MainActivity.this));
            }
            licenseHandler.postDelayed(this, 60000L);
        }
    };

    private float ui = 1f;

    private void calcularEscala() {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        float widthDp = dm.widthPixels / dm.density;
        float heightDp = dm.heightPixels / dm.density;
        float font = dm.scaledDensity / Math.max(dm.density, 0.1f);
        float wScale = widthDp / 392f;
        float hScale = heightDp / 760f;
        ui = Math.min(wScale, hScale);
        if (font > 1.05f) ui = ui / Math.min(font, 1.45f);
        if (ui < 0.68f) ui = 0.68f;
        if (ui > 1.12f) ui = 1.12f;
    }

    private int dp(float v) {
        return Math.max(1, (int) (v * ui * getResources().getDisplayMetrics().density + 0.5f));
    }

    private void aplicarTexto(TextView t, float sizeSp) {
        t.setTextSize(TypedValue.COMPLEX_UNIT_DIP, sizeSp * ui);
        t.setIncludeFontPadding(false);
    }

    private TextView text(String value, float size) {
        TextView t = new TextView(this);
        t.setText(value);
        aplicarTexto(t, size);
        t.setTextColor(0xFFE5E9F0);
        t.setPadding(dp(2), dp(2), dp(2), dp(2));
        return t;
    }

    private LinearLayout card(String title) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(10), dp(10), dp(10), dp(10));
        c.setBackground(round(0xFF101D2D, 14));

        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        cp.setMargins(0, 0, 0, dp(12));
        c.setLayoutParams(cp);

        TextView h = text(title.toUpperCase(), 13);
        h.setTextColor(0xFF8792A6);
        h.setPadding(0, 0, 0, dp(10));
        c.addView(h);
        return c;
    }

    private Button button(String label) {
        Button b = new Button(this);
        b.setText(label);
        aplicarTexto(b, 12.5f);
        b.setAllCaps(false);
        b.setTextColor(0xFFE5E9F0);
        b.setBackground(round(0xFF1E2838, 10));
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setPadding(dp(10), dp(9), dp(10), dp(9));
        b.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        p.setMargins(0, dp(3), 0, dp(3));
        b.setLayoutParams(p);
        return b;
    }

    private EditText input(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setHintTextColor(0xFF8792A6);
        e.setTextColor(0xFFE5E9F0);
        e.setSingleLine(true);
        aplicarTexto(e, 13f);
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
        e.setMinHeight(dp(42));
        e.setBackground(round(0xFF1E2838, 10));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        p.setMargins(0, dp(3), 0, dp(4));
        e.setLayoutParams(p);
        return e;
    }

    private TextView status(String label, String value) {
        TextView t = text(label + ": " + value, 13);
        t.setTextColor(0xFF8792A6);
        return t;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FirebaseConfig.inicializar(getApplicationContext());
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken().addOnSuccessListener(t -> ApiClient.registarTokenPush(getApplicationContext(), t));
        } catch (Exception ignored) {}

        if (!LicenseManager.estaAtivado(this)) {
            startActivity(new Intent(this, ActivationActivity.class));
            finish();
            return;
        }

        // Depois da licença, pedir o acesso aos arquivos.
        pedirPermissoesStorage();

        // Garante FCM mesmo quando a aprovação aconteceu nesta instalação.
        ApiClient.sincronizarFcmAgora(getApplicationContext());

        calcularEscala();
        construirInterfaceNativa();
        atualizarQuadroRestantes();
        iniciarMonitorService();
        licenseHandler.post(licenseCheckRunnable);
    }

    // O Lacoste Auto não precisa de acesso amplo ao armazenamento.
    // Removido MANAGE_EXTERNAL_STORAGE para evitar configurações extras.
    private void pedirPermissoesStorage() {
        // Intencionalmente vazio.
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(
                requestCode,
                permissions,
                grantResults
        );

        if (requestCode == REQ_STORAGE) {
            Toast.makeText(
                    this,
                    "Permissões de arquivos atualizadas",
                    Toast.LENGTH_SHORT
            ).show();
        }
    }

    private GradientDrawable round(int color, float radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(radiusDp));
        return d;
    }

    private void construirInterfaceNativa() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setClipChildren(true);
        root.setClipToPadding(true);
        root.setBackgroundColor(0xFF061321);
        getWindow().setStatusBarColor(0xFF061321);
        getWindow().setNavigationBarColor(0xFF061321);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(16), dp(10), dp(16), dp(4));

        TextView logo = new TextView(this);
        logo.setText("🐊");
        aplicarTexto(logo, 24);
        logo.setTextColor(Color.WHITE);
        logo.setGravity(Gravity.CENTER);
        logo.setBackground(round(0x00132738, 16));
        LinearLayout.LayoutParams logoP = new LinearLayout.LayoutParams(dp(48), dp(48));
        logoP.rightMargin = dp(12);
        logo.setLayoutParams(logoP);
        header.addView(logo);

        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);
        TextView titulo = text("LACOSTE AUTO", 21);
        titulo.setTextColor(0xFFF1F5F9);
        titulo.setPadding(0, 0, 0, 0);
        titles.addView(titulo);
        TextView subtitulo = text("Automação de transferência de megas", 12);
        subtitulo.setTextColor(0xFF94A3B8);
        subtitulo.setPadding(0, 0, 0, 0);
        subtitulo.setSingleLine(true);
        titles.addView(subtitulo);
        header.addView(titles, new LinearLayout.LayoutParams(0, -2, 1f));
        root.addView(header);

        licencaView = text("🛡  Licença: " + LicenseManager.tempoRestante(this), 13);
        licencaView.setTextColor(0xFF22C55E);
        licencaView.setPadding(dp(16), 0, dp(16), dp(8));
        root.addView(licencaView);

        FrameLayout pages = new FrameLayout(this);
        pages.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));

        paginaInicio = construirInicio();
        paginaHistorico = construirHistorico();
        paginaPerfil = construirPerfil();
        pages.addView(wrapScroll(paginaInicio));
        pages.addView(wrapScroll(paginaHistorico));
        pages.addView(wrapScroll(paginaPerfil));
        root.addView(pages);

        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setPadding(dp(8), dp(6), dp(8), dp(8));
        nav.setBackgroundColor(0xFF10192A);
        navInicio = navButton("Início");
        navHistorico = navButton("Histórico");
        navPerfil = navButton("Perfil");
        navInicio.setOnClickListener(v -> mostrarPagina(0));
        navHistorico.setOnClickListener(v -> mostrarPagina(1));
        navPerfil.setOnClickListener(v -> mostrarPagina(2));
        nav.addView(navInicio);
        nav.addView(navHistorico);
        nav.addView(navPerfil);
        root.addView(nav);

        mostrarPagina(0);
        setContentView(root);
    }

    private ScrollView wrapScroll(View child) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(true);
        scroll.setClipChildren(true);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        scroll.addView(child, new FrameLayout.LayoutParams(-1, -2));
        return scroll;
    }

    private Button navButton(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        aplicarTexto(b, 13f);
        b.setTextColor(0xFFE5E9F0);
        b.setBackgroundColor(0x00000000);
        b.setMinHeight(dp(44));
        b.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        return b;
    }

    private void mostrarPagina(int index) {
        paginaInicio.setVisibility(index == 0 ? View.VISIBLE : View.GONE);
        paginaHistorico.setVisibility(index == 1 ? View.VISIBLE : View.GONE);
        paginaPerfil.setVisibility(index == 2 ? View.VISIBLE : View.GONE);
        if (paginaInicio.getParent() instanceof View) ((View) paginaInicio.getParent()).setVisibility(index == 0 ? View.VISIBLE : View.GONE);
        if (paginaHistorico.getParent() instanceof View) ((View) paginaHistorico.getParent()).setVisibility(index == 1 ? View.VISIBLE : View.GONE);
        if (paginaPerfil.getParent() instanceof View) ((View) paginaPerfil.getParent()).setVisibility(index == 2 ? View.VISIBLE : View.GONE);
        navInicio.setTextColor(index == 0 ? 0xFF22C55E : 0xFF94A3B8);
        navHistorico.setTextColor(index == 1 ? 0xFF22C55E : 0xFF94A3B8);
        navPerfil.setTextColor(index == 2 ? 0xFF22C55E : 0xFF94A3B8);
        if (index == 1) preencherHistorico();
        if (index == 2 && licencaPerfil != null) {
            licencaPerfil.setText(LicenseManager.tempoRestante(this));
        }
    }

    private LinearLayout page() {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(4), dp(16), dp(24));
        return content;
    }

    private LinearLayout sectionTitle(String icon, String title, String subtitle) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(4), 0, dp(8));

        TextView ico = text(icon, 17);
        ico.setGravity(Gravity.CENTER);
        ico.setTextColor(0xFFE8EEF7);
        ico.setBackground(round(0xFF13253A, 18));
        LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(dp(38), dp(38));
        ip.rightMargin = dp(10);
        ico.setLayoutParams(ip);
        row.addView(ico);

        LinearLayout labels = new LinearLayout(this);
        labels.setOrientation(LinearLayout.VERTICAL);
        TextView t = text(title.toUpperCase(), 15);
        t.setTypeface(null, android.graphics.Typeface.BOLD);
        t.setTextColor(0xFFF2F5F9);
        t.setPadding(0, 0, 0, 0);
        labels.addView(t);
        if (subtitle != null && !subtitle.isEmpty()) {
            TextView st = text(subtitle, 10.5f);
            st.setTextColor(0xFF94A3B8);
            st.setPadding(0, dp(2), 0, 0);
            labels.addView(st);
        }
        row.addView(labels, new LinearLayout.LayoutParams(0, -2, 1f));

        return row;
    }

    private LinearLayout panel() {
        LinearLayout p = new LinearLayout(this);
        p.setOrientation(LinearLayout.VERTICAL);
        p.setPadding(dp(10), dp(10), dp(10), dp(10));
        p.setBackground(round(0xFF101D2D, 14));
        LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(-1, -2);
        pp.setMargins(0, 0, 0, dp(10));
        p.setLayoutParams(pp);
        return p;
    }

    private TextView smallIcon(String icon, int color) {
        TextView v = text(icon, 16);
        v.setGravity(Gravity.CENTER);
        v.setTextColor(color);
        v.setBackground(round(0x001A2B40, 20));
        v.setPadding(0, 0, 0, 0);
        v.setLayoutParams(new LinearLayout.LayoutParams(dp(28), dp(28)));
        return v;
    }

    private LinearLayout construirInicio() {
        LinearLayout content = page();
        content.setPadding(dp(16), dp(8), dp(16), dp(26));

        // 1 — SALDO E TRANSFERÊNCIAS (compacto como a referência)
        LinearLayout saldoWrap = new LinearLayout(this);
        saldoWrap.setOrientation(LinearLayout.VERTICAL);
        saldoWrap.addView(sectionTitle("▣", "Saldo e transferências", ""));

        LinearLayout sims = new LinearLayout(this);
        sims.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams sp1 = new LinearLayout.LayoutParams(0, -2, 1f);
        sp1.rightMargin = dp(5);
        LinearLayout.LayoutParams sp2 = new LinearLayout.LayoutParams(0, -2, 1f);
        sp2.leftMargin = dp(5);

        LinearLayout s1 = simCard();
        LinearLayout s2 = simCard();
        s1.setLayoutParams(sp1);
        s2.setLayoutParams(sp2);

        TextView eye1 = smallIcon("◉", 0xFF39F27A);
        eye1.setBackground(round(0x001C5B43, 30));
        s1.addView(eye1);
        TextView simLabel1 = text("SIM 1", 11);
        simLabel1.setTextColor(0xFF94A3B8);
        s1.addView(simLabel1);
        sim1Saldo = text("toca pra ver", 14);
        sim1Saldo.setTextColor(0xFFF2F5F9);
        sim1Saldo.setPadding(0, 0, 0, 0);
        s1.addView(sim1Saldo);
        sim1Restantes = text("Restantes hoje\n—", 11);
        sim1Restantes.setTextColor(0xFF39F27A);
        sim1Restantes.setPadding(0, dp(2), 0, dp(4));
        s1.addView(sim1Restantes);
        Button q1 = button("▥  Consultar saldo");
        q1.setBackground(round(0xFF23C76B, 10));
        q1.setTextColor(0xFFFFFFFF);
        q1.setOnClickListener(v -> consultarSaldoSim(1));
        s1.addView(q1);

        TextView db2 = smallIcon("◎", 0xFF4CA8FF);
        s2.addView(db2);
        TextView simLabel2 = text("SIM 2", 11);
        simLabel2.setTextColor(0xFF94A3B8);
        s2.addView(simLabel2);
        sim2Saldo = text("toca pra ver", 14);
        sim2Saldo.setTextColor(0xFFF2F5F9);
        sim2Saldo.setPadding(0, 0, 0, 0);
        s2.addView(sim2Saldo);
        sim2Restantes = text("Restantes hoje\n—", 11);
        sim2Restantes.setTextColor(0xFF39F27A);
        sim2Restantes.setPadding(0, dp(2), 0, dp(4));
        s2.addView(sim2Restantes);
        Button q2 = button("▥  Consultar saldo");
        q2.setBackground(round(0xFF23C76B, 10));
        q2.setTextColor(0xFFFFFFFF);
        q2.setOnClickListener(v -> consultarSaldoSim(2));
        s2.addView(q2);

        sims.addView(s1);
        sims.addView(s2);
        saldoWrap.addView(sims);

        // Número fixo fica ABAIXO dos cards. No ecrã inicial só se vê consultar;
        // desliza para aparecer esta faixa, sem sobrepor o card.
        LinearLayout resets = new LinearLayout(this);
        resets.setOrientation(LinearLayout.HORIZONTAL);
        resets.setPadding(0, dp(8), 0, 0);
        Button f1 = button("SIM 1\nNúmero fixo / Resetar");
        Button f2 = button("SIM 2\nNúmero fixo / Resetar");
        aplicarTexto(f1, 11f);
        aplicarTexto(f2, 11f);
        f1.setOnClickListener(v -> abrirConfiguracaoSim(1));
        f2.setOnClickListener(v -> abrirConfiguracaoSim(2));
        LinearLayout.LayoutParams rp1 = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        rp1.rightMargin = dp(5);
        LinearLayout.LayoutParams rp2 = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        rp2.leftMargin = dp(5);
        f1.setLayoutParams(rp1); f2.setLayoutParams(rp2);
        resets.addView(f1); resets.addView(f2);
        saldoWrap.addView(resets);
        content.addView(saldoWrap);

        // 2 — TRANSFERÊNCIA MANUAL
        LinearLayout manual = panel();
        manual.addView(sectionTitle("↻", "Transferência manual", ""));
        EditText mb = input("Insira a quantidade (MB)");
        mb.setInputType(InputType.TYPE_CLASS_NUMBER);
        manual.addView(mb);
        EditText numero = input("Insira o número do destinatário");
        numero.setInputType(InputType.TYPE_CLASS_PHONE);
        manual.addView(numero);
        Button transferir = button("✈  Transferir agora");
        transferir.setBackground(round(0xFF23C76B, 10));
        transferir.setTextColor(Color.WHITE);
        resultadoTransferencia = text("", 11);
        resultadoTransferencia.setTextColor(0xFF94A3B8);
        transferir.setOnClickListener(v -> {
            try {
                int quantidade = Integer.parseInt(mb.getText().toString().trim());
                String n = numero.getText().toString().trim();
                if (quantidade <= 0 || n.isEmpty()) throw new Exception("Dados inválidos");
                iniciarTransferenciaManual(quantidade, n);
            } catch (Exception e) {
                resultadoTransferencia.setText("Erro: " + e.getMessage());
            }
        });
        manual.addView(transferir);
        manual.addView(resultadoTransferencia);
        content.addView(manual);

        // 3 — ACESSIBILIDADE: status numa linha, botão por baixo (não corta o texto)
        LinearLayout acessPanel = panel();
        acessPanel.addView(sectionTitle("♿", "Acessibilidade", "Serviço usado para ler e confirmar o USSD."));
        LinearLayout accessRow = new LinearLayout(this);
        accessRow.setOrientation(LinearLayout.HORIZONTAL);
        accessRow.setGravity(Gravity.CENTER_VERTICAL);
        accessRow.setPadding(0, dp(2), 0, dp(6));
        TextView check = smallIcon("✓", 0xFF39F27A);
        check.setBackground(round(0xFF1C5B43, 20));
        LinearLayout.LayoutParams checkP = new LinearLayout.LayoutParams(dp(28), dp(28));
        checkP.rightMargin = dp(10);
        check.setLayoutParams(checkP);
        accessRow.addView(check);
        TextView al = text("Status", 13);
        al.setTextColor(0xFFF2F5F9);
        al.setPadding(0, 0, dp(8), 0);
        accessRow.addView(al);
        acessibilidadeView = text(UssdAccessibilityService.estaAtivo() ? "ATIVA" : "INATIVA", 13);
        acessibilidadeView.setTypeface(null, android.graphics.Typeface.BOLD);
        acessibilidadeView.setTextColor(UssdAccessibilityService.estaAtivo() ? 0xFF39F27A : 0xFFEF4444);
        acessibilidadeView.setSingleLine(true);
        acessibilidadeView.setPadding(0, 0, 0, 0);
        accessRow.addView(acessibilidadeView, new LinearLayout.LayoutParams(0, -2, 1f));
        acessPanel.addView(accessRow);
        Button acess = button("Abrir configuração  ⚙");
        acess.setOnClickListener(v -> abrirConfigAcessibilidade());
        acessPanel.addView(acess);
        content.addView(acessPanel);

        // 4 — CONTINUAÇÃO DA SEGUNDA FOTO, na MESMA página/ScrollView.
        LinearLayout credito = panel();
        credito.addView(sectionTitle("⇄", "Transferência de crédito", "Envie crédito para outro número usando SIM 1 ou SIM 2."));
        Button c1 = button("▣   Usar SIM 1 para crédito    ›");
        Button c2 = button("▣   Usar SIM 2 para crédito    ›");
        Button cn = button("⏻   Desativar crédito    ›");
        c1.setTextColor(0xFF8CFF59); c2.setTextColor(0xFF5FA8FF); cn.setTextColor(0xFFFFA43D);
        c1.setOnClickListener(v -> definirSimCredito(1));
        c2.setOnClickListener(v -> definirSimCredito(2));
        cn.setOnClickListener(v -> definirSimCredito(0));
        credito.addView(c1); credito.addView(c2); credito.addView(cn);
        EditText valor = input("Valor em MT   Ex.: 50.00");
        valor.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        credito.addView(valor);
        EditText numCredito = input("Número do destinatário   Ex.: 84 XXX XXXX");
        numCredito.setInputType(InputType.TYPE_CLASS_PHONE);
        credito.addView(numCredito);
        resultadoCredito = text("", 11);
        resultadoCredito.setTextColor(0xFF94A3B8);
        Button transferirCredito = button("✈  Transferir crédito agora");
        transferirCredito.setBackground(round(0xFF5145E8, 10));
        transferirCredito.setTextColor(Color.WHITE);
        transferirCredito.setOnClickListener(v -> {
            String val = valor.getText().toString().trim();
            String n = numCredito.getText().toString().trim();
            if (val.isEmpty() || n.isEmpty()) {
                resultadoCredito.setText("Preencha o valor e o número.");
                return;
            }
            iniciarTransferenciaCreditoManual(val, n);
        });
        credito.addView(transferirCredito);
        credito.addView(resultadoCredito);
        content.addView(credito);

        // 5 — PERMISSÕES E SISTEMA
        LinearLayout permissoes = panel();
        permissoes.addView(sectionTitle("♢", "Permissões e sistema", "Configure permissões e otimizações necessárias para o funcionamento."));
        Button chamadas = button("☎  Permitir chamadas / USSD\n     Necessário para comandos e consultas.");
        chamadas.setOnClickListener(v -> pedirPermissoesChamadas());
        permissoes.addView(chamadas);
        Button bateria = button("▣  Configurar otimização da bateria\n     Permitir execução em segundo plano.");
        bateria.setOnClickListener(v -> abrirConfigBateria());
        permissoes.addView(bateria);
        Button admin = button("♢  Configurar administrador do dispositivo\n     Maior controle e estabilidade do sistema.");
        admin.setOnClickListener(v -> abrirConfigDeviceAdmin());
        permissoes.addView(admin);
        Button overlay = button("▣  Permissão de sobreposição\n     Exibir sobre outros aplicativos.");
        overlay.setOnClickListener(v -> abrirConfigOverlay());
        permissoes.addView(overlay);
        Button notificacoes = button("●  Permitir leitura de notificações\n     Capturar notificações do sistema.");
        notificacoes.setOnClickListener(v -> abrirConfigNotificacoes());
        permissoes.addView(notificacoes);

        Button btnIniciar = button("🚀  INICIAR MONITORAMENTO AUTO\n     Inicia o monitoramento automático em segundo plano.");
        btnIniciar.setBackground(round(0xFF23C76B, 12));
        btnIniciar.setTextColor(Color.WHITE);
        btnIniciar.setOnClickListener(v -> {
            iniciarMonitorService();
            Toast.makeText(this, "Monitoramento automático ativado.", Toast.LENGTH_SHORT).show();
        });
        permissoes.addView(btnIniciar);

        Button btnParar = button("■  PARAR MONITORAMENTO\n     Interrompe todo o monitoramento e processos em execução.");
        btnParar.setBackground(round(0xFFD72F2F, 12));
        btnParar.setTextColor(Color.WHITE);
        btnParar.setOnClickListener(v -> {
            try {
                stopService(new Intent(this, MonitorService.class));
                Toast.makeText(this, "Monitoramento parado.", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "Não foi possível parar: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
        permissoes.addView(btnParar);
        content.addView(permissoes);

        TextView lock = text("🔒  Suas configurações são protegidas e criptografadas.", 10.5f);
        lock.setTextColor(0xFF8A96A8);
        lock.setGravity(Gravity.CENTER);
        lock.setPadding(0, dp(2), 0, dp(8));
        content.addView(lock);
        return content;
    }

    private LinearLayout simCard() {
        LinearLayout s = new LinearLayout(this);
        s.setOrientation(LinearLayout.VERTICAL);
        s.setGravity(Gravity.CENTER);
        s.setPadding(dp(8), dp(8), dp(8), dp(8));
        s.setClipChildren(true);
        s.setClipToPadding(true);
        s.setBackground(round(0xFF1E2838, 14));
        return s;
    }

    private LinearLayout construirHistorico() {
        LinearLayout content = page();
        content.addView(text("Últimas transferências", 16));
        TextView dica = text("Concluídas e canceladas neste telemóvel.", 12);
        dica.setTextColor(0xFF94A3B8);
        content.addView(dica);
        historicoLista = new LinearLayout(this);
        historicoLista.setOrientation(LinearLayout.VERTICAL);
        content.addView(historicoLista);
        return content;
    }

    private void preencherHistorico() {
        if (historicoLista == null) return;
        historicoLista.removeAllViews();
        String raw = Prefs.getHistorico(this);
        if (raw == null || raw.trim().isEmpty()) {
            TextView vazio = text("Ainda não há transferências.", 13);
            vazio.setTextColor(0xFF94A3B8);
            historicoLista.addView(vazio);
            return;
        }
        String[] linhas = raw.split("\n");
        java.text.SimpleDateFormat fmt = new java.text.SimpleDateFormat("dd/MM HH:mm", java.util.Locale.getDefault());
        for (String linha : linhas) {
            String[] p = linha.split("\\|", 4);
            if (p.length < 4) continue;
            boolean ok = "ok".equals(p[1]);
            String quando = p[0];
            try { quando = fmt.format(new java.util.Date(Long.parseLong(p[0]))); } catch (Exception ignored) {}
            TextView item = text((ok ? "Concluída" : "Cancelada") + " · " + quando + "\n" + p[2] + " — " + p[3], 13);
            item.setTextColor(ok ? 0xFF22C55E : 0xFFEF4444);
            item.setBackground(round(0xFF171F2E, 12));
            item.setPadding(dp(12), dp(10), dp(12), dp(10));
            LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(-1, -2);
            ip.topMargin = dp(8);
            item.setLayoutParams(ip);
            historicoLista.addView(item);
        }
    }

    private LinearLayout construirPerfil() {
        LinearLayout content = page();
        content.addView(text("Perfil", 16));
        LinearLayout box = card("Licença");
        TextView label = text("Tempo que ainda tens", 12);
        label.setTextColor(0xFF94A3B8);
        box.addView(label);
        licencaPerfil = text(LicenseManager.tempoRestante(this), 20);
        licencaPerfil.setTextColor(0xFF22C55E);
        box.addView(licencaPerfil);
        TextView id = text("ID: " + ApiClient.obterAndroidId(this), 12);
        id.setTextColor(0xFF94A3B8);
        box.addView(id);
        TextView modelo = text(Build.MANUFACTURER + " " + Build.MODEL, 12);
        modelo.setTextColor(0xFF94A3B8);
        box.addView(modelo);
        content.addView(box);
        return content;
    }

    private void registarHistorico(String tipo, String detalhe, boolean ok) {
        Prefs.addHistorico(this, tipo, detalhe, ok);
    }

    private void abrirConfiguracaoSim(final int sim) {
        final EditText numero = input("Número fixo (opcional)");
        numero.setInputType(InputType.TYPE_CLASS_PHONE);
        String atual = Prefs.getNumeroFixo(this, sim);
        if (atual != null && !atual.isEmpty()) numero.setText(atual);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(5), dp(20), 0);
        box.addView(numero);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("SIM " + sim + " — Número fixo")
                .setMessage(
                        "Número fixo é opcional. Também podes resetar as transferências do dia."
                )
                .setView(box)
                .setNegativeButton("Cancelar", null)
                .setNeutralButton("Resetar hoje", null)
                .setPositiveButton("Guardar", null)
                .create();

        dialog.setOnShowListener(v -> {
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(x -> {
                Prefs.resetarTransferencias(this, sim);
                Toast.makeText(
                        this,
                        "SIM " + sim + " resetado.",
                        Toast.LENGTH_SHORT
                ).show();
                atualizarQuadroRestantes();
                dialog.dismiss();
            });

            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(x -> {
                String n = numero.getText().toString().replaceAll("\\D", "");
                if (!n.isEmpty()
                        && !(n.length() == 9
                        && (n.startsWith("84") || n.startsWith("85")))) {
                    numero.setError("Use 9 dígitos começando por 84 ou 85.");
                    return;
                }

                Prefs.setNumeroFixo(this, sim, n);

                Toast.makeText(
                        this,
                        n.isEmpty()
                                ? "Número fixo removido."
                                : "Número fixo guardado.",
                        Toast.LENGTH_SHORT
                ).show();

                dialog.dismiss();
            });
        });

        dialog.show();
    }

    private void atualizarQuadroRestantes() {
        if (sim1Restantes != null) {
            sim1Restantes.setText(
                    "Restantes hoje: "
                            + Prefs.getTransferenciasRestantes(this, 1)
            );
        }
        if (sim2Restantes != null) {
            sim2Restantes.setText(
                    "Restantes hoje: "
                            + Prefs.getTransferenciasRestantes(this, 2)
            );
        }
    }

    private void atualizarRestantes() {
        if (sim1Restantes!= null) sim1Restantes.setText("Transferências");
        if (sim2Restantes!= null) sim2Restantes.setText("Transferências");
    }

    public boolean temPermissaoChamadas() {
        boolean base = ContextCompat.checkSelfPermission(this, "android.permission.CALL_PHONE") == 0
                && ContextCompat.checkSelfPermission(this, "android.permission.READ_PHONE_STATE") == 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            return base && ContextCompat.checkSelfPermission(this, "android.permission.READ_PHONE_NUMBERS") == 0;
        return base;
    }

    public void pedirPermissoesChamadas() {
        List<String> p = new ArrayList<>();
        p.add("android.permission.CALL_PHONE");
        p.add("android.permission.READ_PHONE_STATE");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) p.add("android.permission.READ_PHONE_NUMBERS");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) p.add("android.permission.POST_NOTIFICATIONS");
        ActivityCompat.requestPermissions(this, p.toArray(new String[0]), REQ_PERMISSOES);
    }

    public boolean bateriaOtimizacaoIgnorada() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            return pm.isIgnoringBatteryOptimizations(getPackageName());
        return true;
    }

    public void abrirConfigBateria() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Intent i = new Intent("android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS");
                i.setData(Uri.parse("package:" + getPackageName()));
                startActivity(i);
            } else {
                abrirTelaBateria();
            }
        } catch (Exception e) {
            abrirTelaBateria();
        }
    }

    private void abrirTelaBateria() {
        try {
            startActivity(new Intent("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS"));
        } catch (Exception ignored) {}
    }

    public boolean deviceAdminAtivo() {
        DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
        ComponentName admin = new ComponentName(this, DeviceAdminReceiverImpl.class);
        return dpm!= null && dpm.isAdminActive(admin);
    }

    public void abrirConfigDeviceAdmin() {
        ComponentName admin = new ComponentName(this, DeviceAdminReceiverImpl.class);
        Intent i = new Intent("android.app.action.ADD_DEVICE_ADMIN");
        i.putExtra("android.app.extra.DEVICE_ADMIN", admin);
        i.putExtra("android.app.extra.ADD_EXPLANATION", "Ajuda o LACOSTE AUTO a continuar ativo em segundo plano.");
        startActivity(i);
    }

    public void abrirConfigAcessibilidade() {
        try {
            startActivity(new Intent("android.settings.ACCESSIBILITY_SETTINGS"));
        } catch (Exception ignored) {}
    }

    private void abrirConfigOverlay() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                i.setData(Uri.parse("package:" + getPackageName()));
                startActivity(i);
            }
        } catch (Exception e) {
            Toast.makeText(this, "Não foi possível abrir a configuração.", Toast.LENGTH_SHORT).show();
        }
    }

    public void iniciarTransferenciaManual(int quantidadeMB, String numero) {
        UssdTransferManager.transferir(this, quantidadeMB, numero, new UssdTransferManager.ResultadoCallback() {
                    @Override
                    public void onSucesso(int sim, int saldoRestanteMB) {
                        runOnUiThread(() -> {
                            String msg = "Transferido via SIM " + sim + " — saldo restante: " + saldoRestanteMB + "MB";
                            resultadoTransferencia.setText(msg);
                            registarHistorico("Megas", msg, true);
                        });
                    }
                    @Override
                    public void onFalhaSaldoInsuficiente(String detalhes) {
                        runOnUiThread(() -> {
                            String msg = "Nenhum SIM disponível. " + (detalhes == null? "" : detalhes);
                            resultadoTransferencia.setText(msg);
                            registarHistorico("Megas", msg, false);
                        });
                    }
                    @Override
                    public void onErro(String motivo) {
                        runOnUiThread(() -> {
                            String msg = "Erro: " + (motivo == null? "desconhecido" : motivo);
                            resultadoTransferencia.setText(msg);
                            registarHistorico("Megas", msg, false);
                        });
                    }
                }
        );
    }

    public void consultarSaldoSim(int sim) {
        UssdTransferManager.consultarSaldo(this, sim, new UssdTransferManager.SaldoCallback() {
                    @Override
                    public void onSaldoLido(int simRetornado, int saldoMB) {
                        runOnUiThread(() -> {
                            TextView v = simRetornado == 1? sim1Saldo : sim2Saldo;
                            v.setText(saldoMB + " MB");
                        });
                    }
                    @Override
                    public void onErro(int simRetornado, String motivo) {
                        runOnUiThread(() -> {
                            TextView v = simRetornado == 1? sim1Saldo : sim2Saldo;
                            v.setText("Erro: " + (motivo == null? "falhou" : motivo));
                        });
                    }
                }
        );
    }

    public void iniciarTransferenciaCreditoManual(String valorMT, String numero) {
        UssdTransferManager.transferirCredito(this, valorMT, numero, new UssdTransferManager.ResultadoCreditoCallback() {
                    @Override
                    public void onSucesso(int sim) {
                        runOnUiThread(() -> {
                            String msg = "Crédito transferido via SIM " + sim;
                            resultadoCredito.setText(msg);
                            registarHistorico("Crédito", msg, true);
                        });
                    }
                    @Override
                    public void onErro(String motivo) {
                        runOnUiThread(() -> {
                            String msg = "Erro: " + (motivo == null? "falhou" : motivo);
                            resultadoCredito.setText(msg);
                            registarHistorico("Crédito", msg, false);
                        });
                    }
                }
        );
    }

    private void definirSimCredito(int sim) {
        Prefs.setSimCreditoDisponivel(this, sim);
        Toast.makeText(this, sim == 0? "Crédito desativado." : "Crédito: SIM " + sim, Toast.LENGTH_SHORT).show();
    }

    public void iniciarMonitorService() {
        try {
            Intent servico = new Intent(this, MonitorService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(servico);
            else startService(servico);
        } catch (Exception e) {
            AppLog.add(this, "MainActivity", "Erro ao iniciar MonitorService: " + e.getMessage());
        }
    }

    public boolean acessoNotificacoesAtivo() {
        String ativos = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return ativos!= null && ativos.contains(getPackageName());
    }

    public void abrirConfigNotificacoes() {
        try {
            startActivity(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"));
        } catch (Exception e) {
            Toast.makeText(this, "Não foi possível abrir a configuração de notificações.", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (acessibilidadeView != null) {
            boolean ativo = UssdAccessibilityService.estaAtivo();
            acessibilidadeView.setText(ativo ? "ATIVA" : "INATIVA");
            acessibilidadeView.setTextColor(ativo ? 0xFF39F27A : 0xFFEF4444);
        }
    }

    @Override
    protected void onDestroy() {
        licenseHandler.removeCallbacks(licenseCheckRunnable);
        super.onDestroy();
    }
}