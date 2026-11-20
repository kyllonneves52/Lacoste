package com.kreysam.autosistematransfer;

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
    public String getUrlPainel() {
        return Prefs.getUrlPainel(activity);
    }

    @JavascriptInterface
    public void saveUrlPainel(String url) {
        Prefs.setUrlPainel(activity, url);
    }

    @JavascriptInterface
    public String getAndroidId() {
        return ApiClient.obterAndroidId(activity);
    }

    @JavascriptInterface
    public String getStatusDispositivo() {
        return Prefs.getStatusDispositivo(activity);
    }

    @JavascriptInterface
    public void registarDispositivo() {
        ApiClient.registarDispositivo(
                activity,
                new ApiClient.Callback() {
                    @Override
                    public void onResultado(
                            boolean ok,
                            String msg
                    ) {
                        // Resultado tratado pelo ApiClient/painel.
                    }
                }
        );
    }

    @JavascriptInterface
    public void verificarStatusDispositivo() {
        ApiClient.verificarStatusDispositivo(
                activity,
                new ApiClient.Callback() {
                    @Override
                    public void onResultado(
                            boolean ok,
                            String msg
                    ) {
                        // Resultado tratado pelo ApiClient/painel.
                    }
                }
        );
    }

    @JavascriptInterface
    public boolean getComunicacaoAtiva() {
        return Prefs.getComunicacaoAtiva(activity);
    }

    @JavascriptInterface
    public void setComunicacaoAtiva(boolean ativa) {
        Prefs.setComunicacaoAtiva(activity, ativa);
        ApiClient.enviarHeartbeat(activity);
    }

    @JavascriptInterface
    public int getSimCreditoDisponivel() {
        return Prefs.getSimCreditoDisponivel(activity);
    }

    @JavascriptInterface
    public void setSimCreditoDisponivel(int simOuZero) {
        Prefs.setSimCreditoDisponivel(
                activity,
                simOuZero
        );

        ApiClient.enviarHeartbeat(activity);
    }

    @JavascriptInterface
    public boolean acessibilidadeAtiva() {
        return UssdAccessibilityService.estaAtivo();
    }

    @JavascriptInterface
    public void abrirConfigAcessibilidade() {
        activity.runOnUiThread(
                new Runnable() {
                    @Override
                    public void run() {
                        activity.abrirConfigAcessibilidade();
                    }
                }
        );
    }

    // =========================================================
    // TRANSFERÊNCIA MANUAL
    // =========================================================

    @JavascriptInterface
    public void transferirManual(
            final int quantidadeMB,
            final String numero
    ) {
        activity.runOnUiThread(
                new Runnable() {
                    @Override
                    public void run() {
                        activity.iniciarTransferenciaManual(
                                quantidadeMB,
                                numero
                        );
                    }
                }
        );
    }

    // =========================================================
    // CONSULTAR SALDO MB
    // =========================================================

    @JavascriptInterface
    public void consultarSaldo(
            final int sim
    ) {
        activity.runOnUiThread(
                new Runnable() {
                    @Override
                    public void run() {
                        activity.consultarSaldoSim(sim);
                    }
                }
        );
    }

    // =========================================================
    // TRANSFERÊNCIA DE CRÉDITO
    // =========================================================

    @JavascriptInterface
    public void transferirCreditoManual(
            final String valorMT,
            final String numero
    ) {
        activity.runOnUiThread(
                new Runnable() {
                    @Override
                    public void run() {
                        activity.iniciarTransferenciaCreditoManual(
                                valorMT,
                                numero
                        );
                    }
                }
        );
    }

    // =========================================================
    // CONSULTAR SALDO DE CRÉDITO
    // =========================================================

    @JavascriptInterface
    public void consultarSaldoCredito(
            final int sim
    ) {
        activity.runOnUiThread(
                new Runnable() {
                    @Override
                    public void run() {
                        activity.consultarSaldoCreditoSim(sim);
                    }
                }
        );
    }

    // =========================================================
    // TRANSFERÊNCIAS RESTANTES
    // =========================================================

    @JavascriptInterface
    public void ajustarRestantes(
            int sim,
            int delta
    ) {
        Prefs.ajustarRestantes(
                activity,
                sim,
                delta
        );
    }

    @JavascriptInterface
    public void resetarTransferencias(
            int sim
    ) {
        Prefs.resetarTransferencias(
                activity,
                sim
        );
    }

    // =========================================================
    // NÚMERO FIXO
    // =========================================================

    @JavascriptInterface
    public boolean setNumeroFixo(
            int sim,
            String numero
    ) {

        if (numero == null ||
                numero.trim().isEmpty()) {

            Prefs.setNumeroFixo(
                    activity,
                    sim,
                    ""
            );

            return true;
        }

        String limpo =
                numero
                        .trim()
                        .replaceAll(
                                "[^0-9]",
                                ""
                        );

        if (limpo.length() != 9) {
            return false;
        }

        if (limpo.startsWith("84") ||
                limpo.startsWith("85")) {

            Prefs.setNumeroFixo(
                    activity,
                    sim,
                    limpo
            );

            return true;
        }

        return false;
    }

    @JavascriptInterface
    public String getNumeroFixo(
            int sim
    ) {
        return Prefs.getNumeroFixo(
                activity,
                sim
        );
    }

    // =========================================================
    // OVERLAY
    // =========================================================

    @JavascriptInterface
    public boolean temPermissaoOverlay() {
        return Settings.canDrawOverlays(activity);
    }

    @JavascriptInterface
    public void pedirPermissaoOverlay() {

        if (!Settings.canDrawOverlays(activity)) {

            Intent intent =
                    new Intent(
                            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse(
                                    "package:" +
                                    activity.getPackageName()
                            )
                    );

            activity.startActivity(intent);
        }
    }

    // =========================================================
    // BLOQUEIO DE TOQUE
    // =========================================================

    @JavascriptInterface
    public boolean getBloqueioActivo() {
        return GhostTouchBlocker.isActivo();
    }

    @JavascriptInterface
    public void activarBloqueio() {

        if (temPermissaoOverlay()) {
            GhostTouchBlocker.activar(activity);
        } else {
            pedirPermissaoOverlay();
        }
    }

    @JavascriptInterface
    public void desactivarBloqueio() {
        GhostTouchBlocker.desactivar();
    }

    // =========================================================
    // ÚLTIMA TRANSFERÊNCIA
    // =========================================================

    @JavascriptInterface
    public void transferirUltimaAgora(
            int sim
    ) {

        String numeroFixo =
                Prefs.getNumeroFixo(
                        activity,
                        sim
                );

        if (numeroFixo == null ||
                numeroFixo.isEmpty()) {
            return;
        }

        UssdTransferManager.transferirUltimaAgora(
                activity,
                sim,
                numeroFixo
        );
    }

    // =========================================================
    // TOKEN
    // =========================================================

    @JavascriptInterface
    public String getToken() {
        return Prefs.getToken(activity);
    }

    @JavascriptInterface
    public void saveToken(
            String token
    ) {
        Prefs.setToken(
                activity,
                token
        );
    }

    // =========================================================
    // STATUS
    // =========================================================

    @JavascriptInterface
    public String getStatus() {

        try {

            JSONObject o =
                    new JSONObject();

            o.put(
                    "totalEnviados",
                    Prefs.getTotalEnviados(activity)
            );

            o.put(
                    "ultimoEnvio",
                    Prefs.getUltimoEnvio(activity)
            );

            o.put(
                    "ultimoErro",
                    Prefs.getUltimoErro(activity)
            );

            String token =
                    Prefs.getToken(activity);

            o.put(
                    "temToken",
                    token != null &&
                    !token.isEmpty()
            );

            String url =
                    Prefs.getUrlPainel(activity);

            o.put(
                    "temUrl",
                    url != null &&
                    !url.isEmpty()
            );

            o.put(
                    "statusDispositivo",
                    Prefs.getStatusDispositivo(activity)
            );

            o.put(
                    "ultimaVerificacaoFalhou",
                    Prefs.getUltimaVerificacaoFalhou(activity)
            );

            o.put(
                    "bateriaIgnorada",
                    activity.bateriaOtimizacaoIgnorada()
            );

            o.put(
                    "deviceAdminAtivo",
                    activity.deviceAdminAtivo()
            );

            o.put(
                    "saldoSim1",
                    Prefs.getSaldo(activity, 1)
            );

            o.put(
                    "saldoSim2",
                    Prefs.getSaldo(activity, 2)
            );

            o.put(
                    "saldoSim1Ts",
                    Prefs.getSaldoTimestamp(activity, 1)
            );

            o.put(
                    "saldoSim2Ts",
                    Prefs.getSaldoTimestamp(activity, 2)
            );

            o.put(
                    "transferenciasRestantesSim1",
                    Prefs.getTransferenciasRestantes(
                            activity,
                            1
                    )
            );

            o.put(
                    "transferenciasRestantesSim2",
                    Prefs.getTransferenciasRestantes(
                            activity,
                            2
                    )
            );

            o.put(
                    "transferenciasUsadasSim1",
                    Prefs.getTransferenciasUsadasHoje(
                            activity,
                            1
                    )
            );

            o.put(
                    "transferenciasUsadasSim2",
                    Prefs.getTransferenciasUsadasHoje(
                            activity,
                            2
                    )
            );

            o.put(
                    "maxTransferenciasDia",
                    10
            );

            o.put(
                    "numeroFixoSim1",
                    Prefs.getNumeroFixo(
                            activity,
                            1
                    )
            );

            o.put(
                    "numeroFixoSim2",
                    Prefs.getNumeroFixo(
                            activity,
                            2
                    )
            );

            o.put(
                    "simCreditoDisponivel",
                    Prefs.getSimCreditoDisponivel(
                            activity
                    )
            );

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
        activity.runOnUiThread(
                new Runnable() {
                    @Override
                    public void run() {
                        activity.pedirPermissoesChamadas();
                    }
                }
        );
    }

    // =========================================================
    // CONFIGURAÇÃO DE BATERIA
    // =========================================================

    @JavascriptInterface
    public void abrirConfigBateria() {
        activity.runOnUiThread(
                new Runnable() {
                    @Override
                    public void run() {
                        activity.abrirConfigBateria();
                    }
                }
        );
    }

    // =========================================================
    // DEVICE ADMIN
    // =========================================================

    @JavascriptInterface
    public void abrirConfigDeviceAdmin() {
        activity.runOnUiThread(
                new Runnable() {
                    @Override
                    public void run() {
                        activity.abrirConfigDeviceAdmin();
                    }
                }
        );
    }

    // =========================================================
    // SERVIÇO
    // =========================================================

    @JavascriptInterface
    public void iniciarServico() {
        activity.runOnUiThread(
                new Runnable() {
                    @Override
                    public void run() {
                        activity.iniciarMonitorService();
                    }
                }
        );
    }

    // =========================================================
    // LOG
    // =========================================================

    @JavascriptInterface
    public String lerLog() {
        return AppLog.ler(activity);
    }

    @JavascriptInterface
    public void limparLog() {
        AppLog.limpar(activity);
    }


    // ===== Kreysam: configuração de SMS/notificações =====

    @JavascriptInterface
    public String getModoEnvio() {
        return Prefs.getModoEnvio(activity);
    }

    @JavascriptInterface
    public void setModoEnvio(String modo) {
        Prefs.setModoEnvio(activity, modo);
    }

    @JavascriptInterface
    public String getNumeroSms() {
        return Prefs.getNumeroSms(activity);
    }

    @JavascriptInterface
    public void setNumeroSms(String numero) {
        Prefs.setNumeroSms(activity, numero);
    }

    @JavascriptInterface
    public String getNumeroExtra() {
        return Prefs.getNumeroExtra(activity);
    }

    @JavascriptInterface
    public void setNumeroExtra(String numero) {
        Prefs.setNumeroExtra(activity, numero);
    }

    @JavascriptInterface
    public boolean temPermissoesSms() {
        return activity.temPermissoesSms();
    }

    @JavascriptInterface
    public void pedirPermissoesSms() {
        activity.pedirPermissoesSms();
    }

    @JavascriptInterface
    public boolean acessoNotificacoesAtivo() {
        return activity.acessoNotificacoesAtivo();
    }

    @JavascriptInterface
    public void abrirConfigNotificacoes() {
        activity.abrirConfigNotificacoes();
    }

}