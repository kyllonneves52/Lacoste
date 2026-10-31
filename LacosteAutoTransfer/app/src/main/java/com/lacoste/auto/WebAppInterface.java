package com.lacoste.auto;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;

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
    public void copiarTexto(String t) {
        main.post(() -> {
            try {
                ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("lacoste", t == null ? "" : t));
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
        main.post(() -> Toast.makeText(activity, "Lucro " + mb + "MB → " + mt + "MT (sync API)", Toast.LENGTH_SHORT).show());
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
}
