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
import android.widget.Button;
import android.app.AlertDialog;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import com.lacoste.auto.PollingService; // <- COLA AQUI

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
            licenseHandler.postDelayed(this, 60000L);
        }
    };

    private int dp(float v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    private TextView text(String value, float size) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(size);
        t.setTextColor(0xFFE5E9F0);
        t.setPadding(dp(2), dp(4), dp(2), dp(4));
        return t;
    }

    private LinearLayout card(String title) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(16), dp(14), dp(16), dp(14));
        c.setBackgroundColor(0xFF171F2E);

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
        b.setTextSize(14);
        b.setAllCaps(false);
        b.setTextColor(0xFFE5E9F0);
        b.setBackgroundColor(0xFF1E2838);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(50)
        );
        p.setMargins(0, dp(5), 0, dp(5));
        b.setLayoutParams(p);
        return b;
    }

    private EditText input(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setHintTextColor(0xFF8792A6);
        e.setTextColor(0xFFE5E9F0);
        e.setSingleLine(true);
        e.setTextSize(14);
        e.setPadding(dp(12), 0, dp(12), 0);
        e.setBackgroundColor(0xFF1E2838);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(52)
        );
        p.setMargins(0, dp(3), 0, dp(6));
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

        construirInterfaceNativa();
        iniciarMonitorService();
        licenseHandler.post(licenseCheckRunnable);
    }

    // Sistema de armazenamento baseado no main1, adaptado para Android moderno.
    private void pedirPermissoesStorage() {

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }

        // Android 6 a 10: permissão normal de leitura/escrita.
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q) {

            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.READ_EXTERNAL_STORAGE
            ) != PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) != PackageManager.PERMISSION_GRANTED) {

                ActivityCompat.requestPermissions(
                        this,
                        new String[]{
                                Manifest.permission.READ_EXTERNAL_STORAGE,
                                Manifest.permission.WRITE_EXTERNAL_STORAGE
                        },
                        REQ_STORAGE
                );
            }

            return;
        }

        // Android 11/12/13/14+: MANAGE_EXTERNAL_STORAGE é uma
        // permissão especial. READ/WRITE_EXTERNAL_STORAGE já não
        // fornecem acesso amplo ao armazenamento.
        if (!Environment.isExternalStorageManager()) {

            try {
                Intent intent = new Intent(
                        Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION
                );
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);

            } catch (Exception e) {

                try {
                    startActivity(new Intent(
                            Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION
                    ));
                } catch (Exception ignored) {
                }
            }
        }
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

    private void construirInterfaceNativa() {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(20), dp(16), dp(30));

        TextView titulo = text("LACOSTE AUTO", 20);
        titulo.setTextColor(0xFFE5E9F0);
        titulo.setGravity(Gravity.CENTER_VERTICAL);
        content.addView(titulo);

        TextView subtitulo = text("Automação de transferência de megas (*162#)", 12);
        subtitulo.setTextColor(0xFF8792A6);
        content.addView(subtitulo);

        licencaView = text("Licença: " + LicenseManager.tempoRestante(this), 12);
        licencaView.setTextColor(0xFF22C55E);
        content.addView(licencaView);

        // Saldo / SIM
        LinearLayout saldo = card("Saldo e transferências");
        LinearLayout sims = new LinearLayout(this);
        sims.setOrientation(LinearLayout.HORIZONTAL);

        LinearLayout s1 = new LinearLayout(this);
        s1.setOrientation(LinearLayout.VERTICAL);
        s1.setGravity(Gravity.CENTER);
        s1.setPadding(dp(8), dp(10), dp(8), dp(10));
        s1.setBackgroundColor(0xFF1E2838);

        LinearLayout s2 = new LinearLayout(this);
        s2.setOrientation(LinearLayout.VERTICAL);
        s2.setGravity(Gravity.CENTER);
        s2.setPadding(dp(8), dp(10), dp(8), dp(10));
        s2.setBackgroundColor(0xFF1E2838);

        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(0, dp(150), 1);
        sp.setMargins(0, 0, dp(5), 0);
        s1.setLayoutParams(sp);

        LinearLayout.LayoutParams sp2 = new LinearLayout.LayoutParams(0, dp(150), 1);
        sp2.setMargins(dp(5), 0, 0, 0);
        s2.setLayoutParams(sp2);

        s1.addView(text("SIM 1", 12));
        sim1Saldo = text("toca pra ver", 19);
        sim1Saldo.setGravity(Gravity.CENTER);
        s1.addView(sim1Saldo);
        sim1Restantes = text("Transferências", 11);
        s1.addView(sim1Restantes);
        Button q1 = button("Consultar saldo");
        q1.setOnClickListener(v -> consultarSaldoSim(1));
        s1.addView(q1);

        Button f1 = button("Número fixo / Resetar");
        f1.setOnClickListener(v -> abrirConfiguracaoSim(1));
        s1.addView(f1);

        s2.addView(text("SIM 2", 12));
        sim2Saldo = text("toca pra ver", 19);
        sim2Saldo.setGravity(Gravity.CENTER);
        s2.addView(sim2Saldo);
        sim2Restantes = text("Transferências", 11);
        s2.addView(sim2Restantes);
        Button q2 = button("Consultar saldo");
        q2.setOnClickListener(v -> consultarSaldoSim(2));
        s2.addView(q2);

        Button f2 = button("Número fixo / Resetar");
        f2.setOnClickListener(v -> abrirConfiguracaoSim(2));
        s2.addView(f2);

        sims.addView(s1);
        sims.addView(s2);
        saldo.addView(sims);
        content.addView(saldo);

        // Transferência manual
        LinearLayout manual = card("Transferência manual");
        EditText mb = input("Quantidade de MB (ex: 100)");
        mb.setInputType(InputType.TYPE_CLASS_NUMBER);
        manual.addView(mb);
        EditText numero = input("Número do destinatário");
        numero.setInputType(InputType.TYPE_CLASS_PHONE);
        manual.addView(numero);
        Button transferir = button("Transferir agora");
        resultadoTransferencia = text("", 12);
        resultadoTransferencia.setTextColor(0xFF8792A6);

        transferir.setOnClickListener(v -> {
            try {
                int quantidade = Integer.parseInt(mb.getText().toString().trim());
                String n = numero.getText().toString().trim();
                if (quantidade <= 0 || n.isEmpty()) {
                    throw new Exception("Dados inválidos");
                }
                iniciarTransferenciaManual(quantidade, n);
            } catch (Exception e) {
                resultadoTransferencia.setText("Erro: " + e.getMessage());
            }
        });

        manual.addView(transferir);
        acessibilidadeView = status("Acessibilidade", UssdAccessibilityService.estaAtivo()? "ATIVA" : "INATIVA");
        manual.addView(acessibilidadeView);
        Button acess = button("Abrir configuração de acessibilidade");
        acess.setOnClickListener(v -> abrirConfigAcessibilidade());
        manual.addView(acess);
        manual.addView(resultadoTransferencia);
        content.addView(manual);

        // Crédito
        LinearLayout credito = card("Transferência de crédito");
        Button c1 = button("Usar SIM 1 para crédito");
        Button c2 = button("Usar SIM 2 para crédito");
        Button cn = button("Desativar crédito");
        c1.setOnClickListener(v -> definirSimCredito(1));
        c2.setOnClickListener(v -> definirSimCredito(2));
        cn.setOnClickListener(v -> definirSimCredito(0));
        credito.addView(c1);
        credito.addView(c2);
        credito.addView(cn);

        EditText valor = input("Valor em MT (ex: 5)");
        valor.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        credito.addView(valor);
        EditText numCredito = input("Número do destinatário");
        numCredito.setInputType(InputType.TYPE_CLASS_PHONE);
        credito.addView(numCredito);

        resultadoCredito = text("", 12);
        resultadoCredito.setTextColor(0xFF8792A6);
        Button transferirCredito = button("Transferir crédito agora");

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

        // Permissões
        LinearLayout permissoes = card("Permissões e sistema");
        Button chamadas = button("Permitir chamadas / USSD");
        chamadas.setOnClickListener(v -> pedirPermissoesChamadas());
        permissoes.addView(chamadas);
        Button bateria = button("Configurar otimização da bateria");
        bateria.setOnClickListener(v -> abrirConfigBateria());
        permissoes.addView(bateria);
        Button admin = button("Configurar administrador do dispositivo");
        admin.setOnClickListener(v -> abrirConfigDeviceAdmin());
        permissoes.addView(admin);
        Button overlay = button("Permissão de sobreposição");
        overlay.setOnClickListener(v -> abrirConfigOverlay());
        permissoes.addView(overlay);
        Button notificacoes = button("Permitir leitura de notificações (.enviar /.saldo)");
notificacoes.setOnClickListener(v -> abrirConfigNotificacoes());
permissoes.addView(notificacoes);

// COLA AQUI OS 2 BOTÕES NOVOS
Button btnIniciar = button("INICIAR MONITORAMENTO AUTO");
btnIniciar.setBackgroundColor(0xFF22C55E);
btnIniciar.setOnClickListener(v -> {
    iniciarMonitorService();
    Toast.makeText(this, "Monitoramento automático ativado.", Toast.LENGTH_SHORT).show();
});
permissoes.addView(btnIniciar);

Button btnParar = button("PARAR MONITORAMENTO");
btnParar.setBackgroundColor(0xFFEF4444);
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

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(0xFF0F1420);
        scroll.addView(content);
        setContentView(scroll);
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
                        runOnUiThread(() -> resultadoTransferencia.setText("Transferido via SIM " + sim + " — saldo restante: " + saldoRestanteMB + "MB"));
                    }
                    @Override
                    public void onFalhaSaldoInsuficiente(String detalhes) {
                        runOnUiThread(() -> resultadoTransferencia.setText("Nenhum SIM disponível. " + (detalhes == null? "" : detalhes)));
                    }
                    @Override
                    public void onErro(String motivo) {
                        runOnUiThread(() -> resultadoTransferencia.setText("Erro: " + (motivo == null? "desconhecido" : motivo)));
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
                        runOnUiThread(() -> resultadoCredito.setText("Crédito transferido via SIM " + sim));
                    }
                    @Override
                    public void onErro(String motivo) {
                        runOnUiThread(() -> resultadoCredito.setText("Erro: " + (motivo == null? "falhou" : motivo)));
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
    protected void onDestroy() {
        licenseHandler.removeCallbacks(licenseCheckRunnable);
        super.onDestroy();
    }
}