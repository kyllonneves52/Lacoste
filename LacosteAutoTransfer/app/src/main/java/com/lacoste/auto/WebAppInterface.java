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
}
