package com.lacoste.auto;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

public class WebAppInterface {

    private final MainActivity activity;

    public WebAppInterface(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String getAndroidId() {
        return ApiClient.obterAndroidId(activity);
    }

    @JavascriptInterface
    public int getSimCreditoDisponivel() {
        return Prefs.getSimCreditoDisponivel(activity);
    }

    @JavascriptInterface
    public void setSimCreditoDisponivel(int simOuZero) {
        Prefs.setSimCreditoDisponivel(activity, simOuZero);
    }

    @JavascriptInterface
    public boolean acessibilidadeAtiva() {
        return UssdAccessibilityService.estaAtivo();
    }

    @JavascriptInterface
    public void abrirConfigAcessibilidade() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.abrirConfigAcessibilidade();
            }
        });
    }

    // =========================================================
    // TRANSFERÊNCIA MANUAL
    // =========================================================

    @JavascriptInterface
    public void transferirManual(final int quantidadeMB, final String numero) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.iniciarTransferenciaManual(quantidadeMB, numero);
            }
        });
    }

    // =========================================================
    // CONSULTAR SALDO MB
    // =========================================================

    @JavascriptInterface
    public void consultarSaldo(final int sim) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.consultarSaldoSim(sim);
            }
        });
    }

    // =========================================================
    // TRANSFERÊNCIA DE CRÉDITO
    // =========================================================

    @JavascriptInterface
    public void transferirCreditoManual(final String valorMT, final String numero) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.iniciarTransferenciaCreditoManual(valorMT, numero);
            }
        });
    }

    // =========================================================
    // TRANSFERÊNCIAS RESTANTES
    // =========================================================

    @JavascriptInterface
    public void ajustarRestantes(int sim, int delta) {
        Prefs.ajustarRestantes(activity, sim, delta);
    }

    @JavascriptInterface
    public void resetarTransferencias(int sim) {
        Prefs.resetarTransferencias(activity, sim);
    }

    // =========================================================
    // NÚMERO FIXO
    // =========================================================

    @JavascriptInterface
    public boolean setNumeroFixo(int sim, String numero) {
        if (numero == null || numero.trim().isEmpty()) {
            Prefs.setNumeroFixo(activity, sim, "");
            return true;
        }

        String limpo = numero.trim().replaceAll("[^0-9]", "");

        if (limpo.length() != 9) {
            return false;
        }

        if (limpo.startsWith("84") || limpo.startsWith("85")) {
            Prefs.setNumeroFixo(activity, sim, limpo);
            return true;
        }

        return false;
    }

    @JavascriptInterface
    public String getNumeroFixo(int sim) {
        return Prefs.getNumeroFixo(activity, sim);
    }

    // =========================================================
    // STATUS
    // =========================================================

    @JavascriptInterface
    public String getStatus() {
        try {
            JSONObject o = new JSONObject();

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

        } catch (Exception e) {
            return "{}";
        }
    }

    // =========================================================
    // PERMISSÃO DE CHAMADAS
    // =========================================================

    @JavascriptInterface
    public boolean temPermissaoChamadas() {
        return activity.temPermissaoChamadas();
    }

    @JavascriptInterface
    public void pedirPermissoesChamadas() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.pedirPermissoesChamadas();
            }
        });
    }

    // =========================================================
    // CONFIGURAÇÃO DE BATERIA
    // =========================================================

    @JavascriptInterface
    public void abrirConfigBateria() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.abrirConfigBateria();
            }
        });
    }

    // =========================================================
    // DEVICE ADMIN
    // =========================================================

    @JavascriptInterface
    public void abrirConfigDeviceAdmin() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.abrirConfigDeviceAdmin();
            }
        });
    }

    // =========================================================
    // NOTIFICAÇÕES
    // =========================================================

    @JavascriptInterface
    public boolean acessoNotificacoesAtivo() {
        return activity.acessoNotificacoesAtivo();
    }

    @JavascriptInterface
    public void abrirConfigNotificacoes() {
        activity.abrirConfigNotificacoes();
    }

}