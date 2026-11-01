package com.lacoste.auto;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

/**
 * Bridge JavaScript ↔ Android para o layout WebView (index.html).
 */
public class WebAppInterface {

    private final MainActivity activity;
    private final Handler main = new Handler(Looper.getMainLooper());

    public WebAppInterface(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void onUiReady() {
        main.post(() -> activity.actualizarWebUi());
    }

    @JavascriptInterface
    public String getAndroidId() {
        return ApiClient.obterAndroidId(activity);
    }

    @JavascriptInterface
    public void copiarTexto(String t) {
        main.post(() -> {
            try {
                ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) {
                    cm.setPrimaryClip(ClipData.newPlainText("lacoste", t == null ? "" : t));
                }
                Toast.makeText(activity, "Copiado", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(activity, "Falha ao copiar", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public void listarPedidos() {
        main.post(() -> activity.listarPedidosNaWeb());
    }

    @JavascriptInterface
    public void enviarManual(String mb, String numero) {
        main.post(() -> activity.enviarManualDaWeb(mb, numero));
    }

    @JavascriptInterface
    public void consultarSaldo(int sim) {
        main.post(() -> activity.consultarSaldoSim(sim));
    }

    @JavascriptInterface
    public void comandoRemoto(String cmd) {
        main.post(() -> activity.executarComandoDaWeb(cmd));
    }

    @JavascriptInterface
    public void pedirCodigoBot(String numero) {
        main.post(() -> activity.pedirCodigoBotDaWeb(numero));
    }

    @JavascriptInterface
    public void guardarLucro(String mb, String mt) {
        main.post(() -> activity.guardarLucroDaWeb(mb, mt));
    }

    @JavascriptInterface
    public void abrirAcessibilidade() {
        main.post(activity::abrirConfigAcessibilidade);
    }

    @JavascriptInterface
    public void abrirBateria() {
        main.post(activity::abrirConfigBateria);
    }

    @JavascriptInterface
    public void iniciarMonitor() {
        main.post(activity::iniciarMonitorService);
    }

    @JavascriptInterface
    public void pararMonitor() {
        main.post(() -> {
            try {
                activity.stopService(new Intent(activity, MonitorService.class));
                Toast.makeText(activity, "Monitor parado", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(activity, e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public void sair() {
        main.post(activity::finish);
    }

    // --- Métodos legados mantidos ---

    @JavascriptInterface
    public boolean acessibilidadeAtiva() {
        return UssdAccessibilityService.estaAtivo();
    }

    @JavascriptInterface
    public void abrirConfigAcessibilidade() {
        main.post(activity::abrirConfigAcessibilidade);
    }

    @JavascriptInterface
    public void transferirManual(final int quantidadeMB, final String numero) {
        main.post(() -> activity.iniciarTransferenciaManual(quantidadeMB, numero));
    }

    @JavascriptInterface
    public void transferirCreditoManual(final String valorMT, final String numero) {
        main.post(() -> activity.iniciarTransferenciaCreditoManual(valorMT, numero));
    }

    @JavascriptInterface
    public void abrirConfigBateria() {
        main.post(activity::abrirConfigBateria);
    }

    @JavascriptInterface
    public void abrirConfigDeviceAdmin() {
        main.post(activity::abrirConfigDeviceAdmin);
    }

    // Compatibilidade integral com os comandos usados pelo ecrã nativo SRC.
    @JavascriptInterface public int getSimCreditoDisponivel() { return Prefs.getSimCreditoDisponivel(activity); }
    @JavascriptInterface public void setSimCreditoDisponivel(int simOuZero) { Prefs.setSimCreditoDisponivel(activity, simOuZero); }
    @JavascriptInterface public boolean acessibilidadeAtiva() { return UssdAccessibilityService.estaAtivo(); }
    @JavascriptInterface public void ajustarRestantes(int sim, int delta) { Prefs.ajustarRestantes(activity, sim, delta); }
    @JavascriptInterface public void resetarTransferencias(int sim) { Prefs.resetarTransferencias(activity, sim); }
    @JavascriptInterface public boolean setNumeroFixo(int sim, String numero) {
        if (numero == null || numero.trim().isEmpty()) { Prefs.setNumeroFixo(activity, sim, ""); return true; }
        String limpo = numero.trim().replaceAll("[^0-9]", "");
        if (limpo.length() == 9 && (limpo.startsWith("84") || limpo.startsWith("85"))) { Prefs.setNumeroFixo(activity, sim, limpo); return true; }
        return false;
    }
    @JavascriptInterface public String getNumeroFixo(int sim) { return Prefs.getNumeroFixo(activity, sim); }
    @JavascriptInterface public String getStatus() {
        try {
            org.json.JSONObject o = new org.json.JSONObject();
            o.put("bateriaIgnorada", activity.bateriaOtimizacaoIgnorada());
            o.put("deviceAdminAtivo", activity.deviceAdminAtivo());
            o.put("saldoSim1", Prefs.getSaldo(activity, 1));
            o.put("saldoSim2", Prefs.getSaldo(activity, 2));
            o.put("transferenciasRestantesSim1", Prefs.getTransferenciasRestantes(activity, 1));
            o.put("transferenciasRestantesSim2", Prefs.getTransferenciasRestantes(activity, 2));
            o.put("maxTransferenciasDia", 10);
            o.put("numeroFixoSim1", Prefs.getNumeroFixo(activity, 1));
            o.put("numeroFixoSim2", Prefs.getNumeroFixo(activity, 2));
            o.put("simCreditoDisponivel", Prefs.getSimCreditoDisponivel(activity));
            o.put("licenca", LicenseManager.tempoRestante(activity));
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }
    @JavascriptInterface public boolean temPermissaoChamadas() { return activity.temPermissaoChamadas(); }
    @JavascriptInterface public void pedirPermissoesChamadas() { main.post(activity::pedirPermissoesChamadas); }
    @JavascriptInterface public boolean acessoNotificacoesAtivo() { return activity.acessoNotificacoesAtivo(); }
    @JavascriptInterface public void abrirConfigNotificacoes() { main.post(activity::abrirConfigNotificacoes); }
    @JavascriptInterface public void transferirCreditoManual(final String valorMT, final String numero) {
        main.post(() -> activity.iniciarTransferenciaCreditoManual(valorMT, numero));
    }
    @JavascriptInterface public void transferirManual(final int quantidadeMB, final String numero) {
        main.post(() -> activity.iniciarTransferenciaManual(quantidadeMB, numero));
    }
    @JavascriptInterface public void abrirConfigDeviceAdmin() { main.post(activity::abrirConfigDeviceAdmin); }
    @JavascriptInterface public void voltarTransferencias() { main.post(activity::mostrarTransferencias); }

}
