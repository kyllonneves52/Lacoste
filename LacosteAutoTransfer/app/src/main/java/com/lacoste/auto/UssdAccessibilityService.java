package com.lacoste.auto;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import androidx.core.app.NotificationCompat;
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class UssdAccessibilityService extends AccessibilityService {

    private static final String TAG = "UssdAccessibility";

    private static final String CANAL_ID = "autosistema_monitor";

    private static final long DEBOUNCE_MS = 800L;
    private static final long REDE_SEGURANCA_MS = 1500L;
    private static final long TIMEOUT_TOTAL_MS = 45000L;
    private static final long STALE_THRESHOLD_MS = 60000L;

    private static final int NOTIF_ID_USSD = 7789;

    private static final String KW_CANCELAR = "cancelar";
    private static final String KW_ENVIAR = "enviar";
    private static final String KW_OK = "ok";

    private static final String KW_INTERNET = "servicos de internet";
    private static final String KW_TRANSFERIR = "transferir megas";
    private static final String KW_SALDO_DLG = "saldo de dados";
    private static final String KW_QUANTOS = "quantos megas";
    private static final String KW_RECIPIENTE = "numero do recipiente";

    private static final String KW_SUCESSO = "transferiste com sucesso";
    private static final String KW_LIMITE = "limite diario";
    private static final String KW_INSUF = "saldo insuficiente";
    private static final String KW_MMI = "codigo mmi invalido";
    private static final String KW_PROPRIO_NUMERO = "proprio numero";
    private static final String KW_PROPRIO_NUMERO_ALT = "nao estas permitido";

    private static final String KW_CRED_MENU_PRINCIPAL = "super jackpot";
    private static final String KW_CRED_TRANSFERIR = "transferir credito";
    private static final String KW_CRED_INTRODUZ_VALOR = "introduz valor";
    private static final String KW_CRED_SUCESSO = "efectuada com sucesso";
    private static final String KW_CRED_SALDO_LABEL = "saldo:";
    private static final String KW_CRED_OFERTA_REJEITAR = "rejeitar";
    private static final String KW_CRED_PROMO_INTERSTICIAL =
            "couldnt guess the best offer";

    private static volatile long inicioOperacaoMs = 0L;

    private static UssdAccessibilityService instancia;

    private final Handler handler = new Handler(Looper.getMainLooper());

    private volatile Estado estado = Estado.IDLE;

    private volatile TipoOperacao tipoOperacaoAtual = TipoOperacao.MEGAS;

    private TransferenciaCallback callbackAtual;
    private CreditoCallback creditoCallbackAtual;

    private String numeroAtual;
    private int quantidadeMBAtual;

    private String valorCreditoAtual;

    private Runnable timeoutRunnable;

    private PowerManager.WakeLock wakeLock;

    private long lastEventMs = 0L;

    private int numeroTentativa = 0;

    private int saldoInicialLido = -1;

    private boolean apenasConsulta = false;

    private volatile boolean ultimoPassoEnviado = false;


    public interface TransferenciaCallback {

        void onErro(String erro);

        void onLimiteDiarioAtingido();

        void onSaldoInsuficiente(int saldo);

        void onSaldoLido(int saldo);

        void onSucesso(int saldoRestante);
    }


    public interface CreditoCallback {

        void onErro(String erro);

        void onSaldoLido(double saldo);

        void onSucesso();
    }


    private enum Estado {

        IDLE,

        MENU_PRINCIPAL,

        SUBMENU,

        SALDO,

        NUMERO,

        RESULTADO,

        CREDITO_MENU,

        CREDITO_SUBMENU,

        CREDITO_VALOR_NUMERO,

        CREDITO_RESULTADO,

        CREDITO_CONSULTA_SALDO
    }


    private enum TipoOperacao {

        MEGAS,

        CREDITO
    }


    // =========================================================
    // SERVIÇO
    // =========================================================

    @Override
    protected void onServiceConnected() {

        super.onServiceConnected();

        instancia = this;

        AccessibilityServiceInfo info = getServiceInfo();

        if (info == null) {
            info = new AccessibilityServiceInfo();
        }

        info.eventTypes =
                AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                        | AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED;

        info.feedbackType =
                AccessibilityServiceInfo.FEEDBACK_GENERIC;

        info.flags =
                AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                        | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;

        info.notificationTimeout = 200L;

        setServiceInfo(info);

        Log.i(TAG, "Serviço de acessibilidade pronto.");
    }


    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {

        if (estado == Estado.IDLE) {
            return;
        }

        long agora = System.currentTimeMillis();

        if (agora - lastEventMs < DEBOUNCE_MS) {
            return;
        }

        lastEventMs = agora;

        handler.postDelayed(
                new Runnable() {
                    @Override
                    public void run() {
                        processarEcraAtual();
                    }
                },
                500L
        );
    }


    @Override
    public void onInterrupt() {

        Log.w(TAG, "Serviço de acessibilidade interrompido.");
    }


    @Override
    public boolean onUnbind(Intent intent) {

        Log.w(
                TAG,
                "Serviço de acessibilidade a ser desativado."
        );

        if (estado != Estado.IDLE) {

            TransferenciaCallback cbMegas =
                    callbackAtual;

            CreditoCallback cbCredito =
                    creditoCallbackAtual;

            estado = Estado.IDLE;

            callbackAtual = null;
            creditoCallbackAtual = null;

            cancelarTimeout();

            voltarAoBackground();

            if (cbMegas != null) {

                cbMegas.onErro(
                        "Serviço de acessibilidade foi desativado durante a operação."
                );
            }

            if (cbCredito != null) {

                cbCredito.onErro(
                        "Serviço de acessibilidade foi desativado durante a operação."
                );
            }
        }

        return super.onUnbind(intent);
    }


    @Override
    public void onDestroy() {

        cancelarTimeout();

        voltarAoBackground();

        instancia = null;

        super.onDestroy();

        Log.w(
                TAG,
                "Serviço de acessibilidade destruído pelo sistema."
        );
    }


    // =========================================================
    // ESTADO
    // =========================================================

    public static boolean estaAtivo() {

        return instancia != null;
    }


    // =========================================================
    // INICIAR MEGAS
    // =========================================================

    public static void iniciarProcessamento(
            int quantidadeMB,
            String numero,
            TransferenciaCallback callback) {

        UssdAccessibilityService service = instancia;

        if (service == null) {

            if (callback != null) {

                callback.onErro(
                        "Serviço de acessibilidade não está ativo. "
                                + "Ativa em Definições → Acessibilidade."
                );
            }

            return;
        }

        service.iniciarMegas(
                quantidadeMB,
                numero,
                callback,
                false
        );
    }


    public static void iniciarTransferenciaComSaldoReal(
            String numero,
            TransferenciaCallback callback) {

        UssdAccessibilityService service = instancia;

        if (service == null) {

            if (callback != null) {

                callback.onErro(
                        "Serviço de acessibilidade não está ativo. "
                                + "Ativa em Definições → Acessibilidade."
                );
            }

            return;
        }

        service.iniciarMegas(
                -1,
                numero,
                callback,
                false
        );
    }


    public static void iniciarConsultaSaldo(
            TransferenciaCallback callback) {

        UssdAccessibilityService service = instancia;

        if (service == null) {

            if (callback != null) {

                callback.onErro(
                        "Serviço de acessibilidade não está ativo. "
                                + "Ativa em Definições → Acessibilidade."
                );
            }

            return;
        }

        service.iniciarMegas(
                0,
                "",
                callback,
                true
        );
    }


    // =========================================================
    // INICIAR CRÉDITO
    // =========================================================

    public static void iniciarTransferenciaCredito(
            String valorMT,
            String numero,
            CreditoCallback callback) {

        UssdAccessibilityService service = instancia;

        if (service == null) {

            if (callback != null) {

                callback.onErro(
                        "Serviço de acessibilidade não está ativo. "
                                + "Ativa em Definições → Acessibilidade."
                );
            }

            return;
        }

        service.iniciarCredito(
                valorMT,
                numero,
                callback,
                false
        );
    }


    public static void iniciarConsultaSaldoCredito(
            CreditoCallback callback) {

        UssdAccessibilityService service = instancia;

        if (service == null) {

            if (callback != null) {

                callback.onErro(
                        "Serviço de acessibilidade não está ativo. "
                                + "Ativa em Definições → Acessibilidade."
                );
            }

            return;
        }

        service.iniciarCredito(
                null,
                null,
                callback,
                true
        );
    }


    // =========================================================
    // FOREGROUND
    // =========================================================

    private void promoverParaForeground(
            String mensagem) {

        try {

            PowerManager pm =
                    (PowerManager) getSystemService(POWER_SERVICE);

            if (pm != null) {

                if (wakeLock != null &&
                        wakeLock.isHeld()) {

                    wakeLock.release();
                }

                wakeLock =
                        pm.newWakeLock(
                                PowerManager.PARTIAL_WAKE_LOCK,
                                "Autosistema:UssdWakeLock"
                        );

                wakeLock.acquire(STALE_THRESHOLD_MS);
            }


            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {

                NotificationChannel canal =
                        new NotificationChannel(
                                CANAL_ID,
                                "Monitor Autosistema",
                                NotificationManager.IMPORTANCE_LOW
                        );

                canal.setShowBadge(false);

                NotificationManager nm =
                        (NotificationManager)
                                getSystemService(
                                        NotificationManager.class
                                );

                if (nm != null) {
                    nm.createNotificationChannel(canal);
                }
            }


            Notification notif =
                    new NotificationCompat.Builder(
                            this,
                            CANAL_ID
                    )
                            .setContentTitle(
                                    "Autosistema Transfer"
                            )
                            .setContentText(mensagem)
                            .setSmallIcon(
                                    android.R.drawable.stat_sys_download_done
                            )
                            .setOngoing(true)
                            .setPriority(
                                    NotificationCompat.PRIORITY_LOW
                            )
                            .build();

            startForeground(
                    NOTIF_ID_USSD,
                    notif
            );

        } catch (Exception e) {

            Log.w(
                    TAG,
                    "promoverParaForeground falhou: "
                            + e.getMessage()
            );
        }
    }


    private void voltarAoBackground() {

        try {

            if (wakeLock != null &&
                    wakeLock.isHeld()) {

                wakeLock.release();
            }

            wakeLock = null;

            if (Build.VERSION.SDK_INT >= 24) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }

        } catch (Exception e) {

            Log.w(
                    TAG,
                    "voltarAoBackground falhou: "
                            + e.getMessage()
            );
        }
    }


    // =========================================================
    // INICIAR OPERAÇÃO MEGAS
    // =========================================================

    private void iniciarMegas(
            int quantidadeMB,
            String numero,
            TransferenciaCallback callback,
            boolean somenteConsulta) {

        cancelarOperacaoEmCurso();

        tipoOperacaoAtual = TipoOperacao.MEGAS;

        quantidadeMBAtual = quantidadeMB;

        numeroAtual = numero;

        callbackAtual = callback;

        saldoInicialLido = -1;

        apenasConsulta = somenteConsulta;

        ultimoPassoEnviado = false;

        estado = Estado.MENU_PRINCIPAL;

        inicioOperacaoMs =
                System.currentTimeMillis();

        numeroTentativa++;

        AppLog.add(
                this,
                TAG,
                "INICIAR[MEGAS] tentativa="
                        + numeroTentativa
                        + " consulta="
                        + somenteConsulta
                        + " mb="
                        + quantidadeMB
                        + " numero="
                        + numero
        );

        promoverParaForeground(
                somenteConsulta
                        ? "A consultar saldo..."
                        : "A transferir "
                        + quantidadeMB
                        + "MB..."
        );

        timeoutRunnable =
                new Runnable() {

                    @Override
                    public void run() {

                        finalizarComErro(
                                "Timeout — a rede/USSD pode estar instável. Tenta novamente."
                        );
                    }
                };

        handler.postDelayed(
                timeoutRunnable,
                TIMEOUT_TOTAL_MS
        );

        agendarPollingContinuo();
    }


    // =========================================================
    // INICIAR CRÉDITO
    // =========================================================

    private void iniciarCredito(
            String valorMT,
            String numero,
            CreditoCallback callback,
            boolean somenteConsultaSaldo) {

        cancelarOperacaoEmCurso();

        tipoOperacaoAtual = TipoOperacao.CREDITO;

        valorCreditoAtual = valorMT;

        numeroAtual = numero;

        creditoCallbackAtual = callback;

        ultimoPassoEnviado = false;

        estado =
                somenteConsultaSaldo
                        ? Estado.CREDITO_CONSULTA_SALDO
                        : Estado.CREDITO_MENU;

        inicioOperacaoMs =
                System.currentTimeMillis();

        numeroTentativa++;

        AppLog.add(
                this,
                TAG,
                "INICIAR[CREDITO] tentativa="
                        + numeroTentativa
                        + " consultaSaldo="
                        + somenteConsultaSaldo
                        + " valor="
                        + valorMT
                        + " numero="
                        + numero
        );

        promoverParaForeground(
                somenteConsultaSaldo
                        ? "A consultar saldo crédito..."
                        : "A transferir crédito "
                        + valorMT
                        + "MT..."
        );

        timeoutRunnable =
                new Runnable() {

                    @Override
                    public void run() {

                        finalizarComErro(
                                "Timeout — a rede/USSD pode estar instável. Tenta novamente."
                        );
                    }
                };

        handler.postDelayed(
                timeoutRunnable,
                TIMEOUT_TOTAL_MS
        );

        agendarPollingContinuo();
    }


    // =========================================================
    // POLLING
    // =========================================================

    private void agendarPollingContinuo() {

        handler.postDelayed(
                new Runnable() {

                    @Override
                    public void run() {

                        if (estado != Estado.IDLE) {

                            Log.d(
                                    TAG,
                                    "Polling continuo -- relendo ecra. estado="
                                            + estado
                            );

                            processarEcraAtual();

                            agendarPollingContinuo();
                        }
                    }
                },
                2000L
        );
    }


    // =========================================================
    // CANCELAR OPERAÇÃO
    // =========================================================

    private void cancelarOperacaoEmCurso() {

        if (estado == Estado.IDLE) {
            return;
        }

        Log.w(
                TAG,
                "Nova operação pedida -- cancelando a anterior. estado="
                        + estado
        );

        cancelarTimeout();

        TransferenciaCallback cbMegasAntigo =
                callbackAtual;

        CreditoCallback cbCreditoAntigo =
                creditoCallbackAtual;

        estado = Estado.IDLE;

        callbackAtual = null;

        creditoCallbackAtual = null;

        if (cbMegasAntigo != null) {

            cbMegasAntigo.onErro(
                    "Operação cancelada -- uma nova foi iniciada."
            );
        }

        if (cbCreditoAntigo != null) {

            cbCreditoAntigo.onErro(
                    "Operação cancelada -- uma nova foi iniciada."
            );
        }
    }


    // =========================================================
    // PROCESSAMENTO DO ECRÃ
    // =========================================================

    private void processarEcraAtual() {

        if (estado == Estado.IDLE) {
            return;
        }

        AccessibilityNodeInfo root =
                getRootInActiveWindow();

        if (root == null) {
            return;
        }

        try {

            String textoOriginal =
                    coletarTexto(root);

            if (textoOriginal == null ||
                    textoOriginal.trim().isEmpty()) {

                return;
            }

            String norm =
                    normalizar(textoOriginal);


            if (getPackageName() != null &&
                    getPackageName().equals(
                            root.getPackageName()
                    ) &&
                    !pareceRespostaOperadora(norm)) {

                AppLog.add(
                        this,
                        TAG,
                        "tentativa="
                                + numeroTentativa
                                + " ignorado -- janela da própria app."
                );

                return;
            }


            if (pareceTelaPropriaApp(norm)) {

                AppLog.add(
                        this,
                        TAG,
                        "tentativa="
                                + numeroTentativa
                                + " ignorado -- texto da própria app."
                );

                return;
            }


            AppLog.add(
                    this,
                    TAG,
                    "tentativa="
                            + numeroTentativa
                            + " tipo="
                            + tipoOperacaoAtual
                            + " estado="
                            + estado
                            + " | texto="
                            + norm.replace(
                                    "\n",
                                    " | "
                            )
            );


            if (norm.contains(
                    KW_CRED_PROMO_INTERSTICIAL
            )) {

                clicarOK(root);

                AppLog.add(
                        this,
                        TAG,
                        "Promoção descartada -- aguardando ecrã real."
                );

                return;
            }


            if (!norm.contains(KW_MMI) &&
                    !norm.contains("codigo invalido")) {

                if (tipoOperacaoAtual ==
                        TipoOperacao.CREDITO) {

                    processarEcraCredito(
                            root,
                            textoOriginal,
                            norm
                    );

                } else {

                    processarEcraMegas(
                            root,
                            textoOriginal,
                            norm
                    );
                }

                return;
            }


            clicarOK(root);

            Log.w(
                    TAG,
                    "Código MMI inválido."
            );

            finalizarComErro(
                    "MMI_INVALIDO"
            );

        } finally {

            root.recycle();
        }
    }


    // =========================================================
    // IDENTIFICAÇÃO DA OPERADORA
    // =========================================================

    private boolean pareceRespostaOperadora(
            String norm) {

        return norm.contains(KW_MMI)
                || norm.contains("codigo invalido")
                || norm.contains(KW_SUCESSO)
                || norm.contains(KW_LIMITE)
                || norm.contains(KW_INSUF)
                || norm.contains(KW_PROPRIO_NUMERO)
                || norm.contains(KW_PROPRIO_NUMERO_ALT)
                || norm.contains(KW_INTERNET)
                || norm.contains(KW_TRANSFERIR)
                || norm.contains(KW_SALDO_DLG)
                || norm.contains(KW_QUANTOS)
                || norm.contains(KW_RECIPIENTE)
                || norm.contains(KW_CRED_MENU_PRINCIPAL)
                || norm.contains(KW_CRED_TRANSFERIR)
                || norm.contains(KW_CRED_INTRODUZ_VALOR)
                || norm.contains(KW_CRED_SUCESSO)
                || norm.contains(KW_CRED_SALDO_LABEL)
                || norm.contains(KW_CRED_PROMO_INTERSTICIAL);
    }


    private boolean pareceTelaPropriaApp(
            String norm) {

        return norm.contains(
                "autosistema transfer"
        )
                || norm.contains(
                "automacao de transferencia"
        )
                || norm.contains(
                "saldo e transferencias"
        )
                || norm.contains(
                "toca pra consultar"
        )
                || norm.contains(
                "restantes hoje"
        )
                || norm.contains(
                "resetar / n"
        )
                || norm.contains(
                "link do painel"
        )
                || norm.contains(
                "token do painel"
        )
                || norm.contains(
                "log detalhado"
        );
    }


    // =========================================================
    // MEGAS
    // =========================================================

    private void processarEcraMegas(
            AccessibilityNodeInfo root,
            String textoOriginal,
            String norm) {

        if (norm.contains(KW_SUCESSO)) {

            if (!numeroConfereNaMensagem(
                    textoOriginal
            )) {

                Log.w(
                        TAG,
                        "Sucesso encontrado mas número não confere."
                );

                return;
            }

            int saldoRestante;

            if (saldoInicialLido >= 0) {

                saldoRestante =
                        saldoInicialLido
                                - quantidadeMBAtual;

            } else {

                saldoRestante =
                        parseSaldoMegas(
                                textoOriginal
                        );
            }

            clicarOK(root);

            finalizarComSucesso(
                    saldoRestante
            );

            return;
        }


        if (norm.contains(KW_LIMITE)) {

            clicarOK(root);

            finalizarComLimiteDiario();

            return;
        }


        if (norm.contains(KW_INSUF)) {

            clicarOK(root);

            finalizarComSaldoInsuficiente(-1);

            return;
        }


        if (norm.contains(KW_PROPRIO_NUMERO) ||
                norm.contains(KW_PROPRIO_NUMERO_ALT)) {

            clicarOK(root);

            finalizarComErro(
                    "PROPRIO_NUMERO"
            );

            return;
        }


        switch (estado) {

            case MENU_PRINCIPAL:

                if (norm.contains(KW_INTERNET) &&
                        responder(root, "8")) {

                    estado = Estado.SUBMENU;
                }

                break;


            case SUBMENU:

                if (norm.contains(KW_TRANSFERIR) &&
                        responder(root, "2")) {

                    estado = Estado.SALDO;
                }

                break;


            case SALDO:

                if (norm.contains(KW_SALDO_DLG) ||
                        norm.contains(KW_QUANTOS)) {

                    int saldo =
                            parseSaldoMegas(
                                    textoOriginal
                            );

                    if (saldo >= 0) {

                        saldoInicialLido =
                                saldo;

                        if (callbackAtual != null) {

                            callbackAtual.onSaldoLido(
                                    saldo
                            );
                        }
                    }


                    if (apenasConsulta) {

                        clicarCancelar(root);

                        finalizarComSucesso(
                                saldo
                        );

                        break;
                    }


                    if (quantidadeMBAtual == -1) {

                        if (saldo < 0) {

                            clicarCancelar(root);

                            finalizarComErro(
                                    "Nao foi possível ler o saldo do ecra."
                            );

                            break;
                        }


                        if (saldo < 100) {

                            clicarCancelar(root);

                            finalizarComSaldoInsuficiente(
                                    saldo
                            );

                            break;
                        }


                        quantidadeMBAtual =
                                Math.min(
                                        saldo,
                                        UssdTransferManager.MAX_MB_TRANSFERENCIA
                                );

                        AppLog.add(
                                this,
                                TAG,
                                "Modo saldo real: saldo="
                                        + saldo
                                        + "MB, transferindo="
                                        + quantidadeMBAtual
                        );
                    }


                    if (saldo >= 0 &&
                            saldo < quantidadeMBAtual) {

                        clicarCancelar(root);

                        finalizarComSaldoInsuficiente(
                                saldo
                        );

                    } else if (
                            responder(
                                    root,
                                    String.valueOf(
                                            quantidadeMBAtual
                                    )
                            )
                    ) {

                        estado = Estado.NUMERO;
                    }
                }

                break;


            case NUMERO:

                if (norm.contains(KW_RECIPIENTE) &&
                        responder(
                                root,
                                numeroAtual
                        )) {

                    estado = Estado.RESULTADO;

                    ultimoPassoEnviado = true;
                }

                break;


            default:
                break;
        }
    }


    // =========================================================
    // CRÉDITO
    // =========================================================

    private void processarEcraCredito(
            AccessibilityNodeInfo root,
            String textoOriginal,
            String norm) {

        if (norm.contains(KW_CRED_SUCESSO)) {

            if (!numeroConfereNaMensagem(
                    textoOriginal
            )) {

                Log.w(
                        TAG,
                        "[CREDITO] Número não confere."
                );

                return;
            }

            clicarOK(root);

            finalizarComSucessoCredito();

            return;
        }


        if (norm.contains(KW_PROPRIO_NUMERO) ||
                norm.contains(KW_PROPRIO_NUMERO_ALT)) {

            clicarOK(root);

            finalizarComErro(
                    "PROPRIO_NUMERO"
            );

            return;
        }


        switch (estado) {

            case CREDITO_MENU:

                if (norm.contains(
                        KW_CRED_MENU_PRINCIPAL
                ) &&
                        responder(root, "11")) {

                    estado =
                            Estado.CREDITO_SUBMENU;
                }

                break;


            case CREDITO_SUBMENU:

                if (norm.contains(
                        KW_CRED_TRANSFERIR
                ) &&
                        responder(root, "4")) {

                    estado =
                            Estado.CREDITO_VALOR_NUMERO;
                }

                break;


            case CREDITO_VALOR_NUMERO:

                if (norm.contains(
                        KW_CRED_INTRODUZ_VALOR
                )) {

                    String resposta =
                            valorCreditoAtual
                                    + " "
                                    + numeroAtual;

                    if (responder(
                            root,
                            resposta
                    )) {

                        estado =
                                Estado.CREDITO_RESULTADO;

                        ultimoPassoEnviado = true;
                    }
                }

                break;


            case CREDITO_CONSULTA_SALDO:

                if (norm.contains(
                        KW_CRED_SALDO_LABEL
                )) {

                    double saldo =
                            parseSaldoCredito(
                                    textoOriginal
                            );

                    if (creditoCallbackAtual != null &&
                            saldo >= 0) {

                        creditoCallbackAtual
                                .onSaldoLido(saldo);
                    }

                    clicarCancelar(root);

                    finalizarComSucessoCredito();
                }

                break;


            default:
                break;
        }
    }


    // =========================================================
    // RESPONDER USSD
    // =========================================================

    private boolean responder(
            AccessibilityNodeInfo root,
            String texto) {

        return tentarResponder(
                texto,
                0
        );
    }


    private boolean tentarResponder(
            final String texto,
            final int tentativa) {

        AccessibilityNodeInfo root =
                getRootInActiveWindow();

        if (root == null) {

            if (tentativa >= 3) {
                return false;
            }

            handler.postDelayed(
                    new Runnable() {

                        @Override
                        public void run() {

                            tentarResponder(
                                    texto,
                                    tentativa + 1
                            );
                        }
                    },
                    300L
            );

            return true;
        }


        try {

            AccessibilityNodeInfo campo =
                    encontrarPorId(
                            root,
                            "android:id/edit"
                    );

            if (campo == null) {

                campo =
                        root.findFocus(
                                AccessibilityNodeInfo.FOCUS_INPUT
                        );
            }


            if (campo != null) {

                Bundle args =
                        new Bundle();

                args.putCharSequence(
                        AccessibilityNodeInfoCompat
                                .ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                        texto
                );

                boolean preenchido =
                        campo.performAction(
                                AccessibilityNodeInfo.ACTION_SET_TEXT,
                                args
                        );

                if (!preenchido) {

                    Log.w(
                            TAG,
                            "Não foi possível preencher o campo USSD."
                    );
                }


                handler.postDelayed(
                        new Runnable() {

                            @Override
                            public void run() {

                                clicarEnviarAtual();
                            }
                        },
                        500L
                );

                return true;
            }


            if (tentativa >= 3) {

                Log.w(
                        TAG,
                        "Campo de texto não encontrado."
                );

                return false;
            }


            handler.postDelayed(
                    new Runnable() {

                        @Override
                        public void run() {

                            tentarResponder(
                                    texto,
                                    tentativa + 1
                            );
                        }
                    },
                    300L
            );

            return true;

        } finally {

            root.recycle();
        }
    }


    private void clicarEnviarAtual() {

        AccessibilityNodeInfo root =
                getRootInActiveWindow();

        if (root != null) {

            try {

                clicarEnviar(root);

            } finally {

                root.recycle();
            }
        }


        handler.postDelayed(
                new Runnable() {

                    @Override
                    public void run() {

                        if (estado != Estado.IDLE) {

                            processarEcraAtual();
                        }
                    }
                },
                REDE_SEGURANCA_MS
        );
    }


    // =========================================================
    // CLIQUES
    // =========================================================

    private void clicarEnviar(
            AccessibilityNodeInfo root) {

        if (clicarPorTexto(
                root,
                KW_ENVIAR
        )) {
            return;
        }

        if (clicarPorId(
                root,
                "android:id/button2"
        )) {
            return;
        }

        clicarPorId(
                root,
                "android:id/button1"
        );
    }


    private void clicarCancelar(
            AccessibilityNodeInfo root) {

        if (clicarPorTexto(
                root,
                KW_CANCELAR
        )) {
            return;
        }

        if (clicarPorId(
                root,
                "android:id/button1"
        )) {
            return;
        }

        clicarPorId(
                root,
                "android:id/button2"
        );
    }


    private void clicarOK(
            AccessibilityNodeInfo root) {

        if (clicarPorTexto(
                root,
                KW_OK
        )) {
            return;
        }

        clicarPorId(
                root,
                "android:id/button1"
        );
    }


    private boolean clicarPorTexto(
            AccessibilityNodeInfo root,
            String texto) {

        List<AccessibilityNodeInfo> nodes =
                root.findAccessibilityNodeInfosByText(
                        texto
                );

        if (nodes == null) {
            return false;
        }


        for (AccessibilityNodeInfo n : nodes) {

            if (n == null) {
                continue;
            }

            try {

                if (n.isClickable() &&
                        n.performAction(
                                AccessibilityNodeInfo.ACTION_CLICK
                        )) {

                    return true;
                }


                AccessibilityNodeInfo pai =
                        n.getParent();

                if (pai != null) {

                    try {

                        if (pai.isClickable() &&
                                pai.performAction(
                                        AccessibilityNodeInfo.ACTION_CLICK
                                )) {

                            return true;
                        }

                    } finally {

                        pai.recycle();
                    }
                }

            } finally {

                n.recycle();
            }
        }

        return false;
    }


    private boolean clicarPorId(
            AccessibilityNodeInfo root,
            String id) {

        List<AccessibilityNodeInfo> nodes =
                root.findAccessibilityNodeInfosByViewId(id);

        if (nodes == null ||
                nodes.isEmpty()) {

            return false;
        }


        for (AccessibilityNodeInfo n : nodes) {

            if (n == null) {
                continue;
            }

            try {

                if (n.isClickable() ||
                        n.isEnabled()) {

                    if (n.performAction(
                            AccessibilityNodeInfo.ACTION_CLICK
                    )) {

                        return true;
                    }
                }

            } finally {

                n.recycle();
            }
        }

        return false;
    }


    private AccessibilityNodeInfo encontrarPorId(
            AccessibilityNodeInfo root,
            String id) {

        List<AccessibilityNodeInfo> nodes =
                root.findAccessibilityNodeInfosByViewId(id);

        if (nodes == null ||
                nodes.isEmpty()) {

            return null;
        }

        return nodes.get(0);
    }


    // =========================================================
    // TEXTO
    // =========================================================

    private String coletarTexto(
            AccessibilityNodeInfo node) {

        StringBuilder sb =
                new StringBuilder();

        coletarTextoRec(
                node,
                sb
        );

        return sb.toString();
    }


    private void coletarTextoRec(
            AccessibilityNodeInfo node,
            StringBuilder sb) {

        if (node == null) {
            return;
        }


        CharSequence texto =
                node.getText();

        if (texto != null) {

            sb.append(texto)
                    .append("\n");
        }


        for (int i = 0;
             i < node.getChildCount();
             i++) {

            AccessibilityNodeInfo filho =
                    node.getChild(i);

            if (filho != null) {

                coletarTextoRec(
                        filho,
                        sb
                );

                filho.recycle();
            }
        }
    }


    private String normalizar(String s) {

        if (s == null) {
            return "";
        }

        return s
                .toLowerCase()
                .replace('ç', 'c')
                .replace('ã', 'a')
                .replace('â', 'a')
                .replace('á', 'a')
                .replace('à', 'a')
                .replace('é', 'e')
                .replace('ê', 'e')
                .replace('í', 'i')
                .replace('ó', 'o')
                .replace('ô', 'o')
                .replace('õ', 'o')
                .replace('ú', 'u')
                .replace('ü', 'u');
    }


    // =========================================================
    // NÚMERO
    // =========================================================

    private boolean numeroConfereNaMensagem(
            String texto) {

        String numero =
                numeroAtual;

        if (numero == null ||
                numero.isEmpty() ||
                texto == null) {

            return true;
        }


        Matcher m =
                Pattern.compile(
                        "(\\d{9,12})"
                ).matcher(texto);

        boolean encontrou =
                false;


        while (m.find()) {

            encontrou = true;

            String candidato =
                    m.group(1);

            if (candidato.length() == 12 &&
                    candidato.startsWith("258")) {

                candidato =
                        candidato.substring(3);
            }


            if (candidato.equals(numero)) {

                return true;
            }
        }


        return !encontrou;
    }


    // =========================================================
    // SALDO MB
    // =========================================================

    private int parseSaldoMegas(
            String texto) {

        if (texto == null) {
            return -1;
        }


        for (String linha :
                texto.split("\\n")) {

            String low =
                    linha.toLowerCase();

            if (!low.contains("mb")) {
                continue;
            }


            String numeros =
                    low.replaceAll(
                            "[^0-9 ]",
                            " "
                    ).trim();


            if (numeros.isEmpty()) {
                continue;
            }


            String[] partes =
                    numeros.split("\\s+");


            for (String parte :
                    partes) {

                try {

                    int valor =
                            Integer.parseInt(parte);

                    if (valor >= 0) {

                        return valor;
                    }

                } catch (NumberFormatException ignored) {
                }
            }
        }


        return -1;
    }


    // =========================================================
    // SALDO CRÉDITO
    // =========================================================

    private double parseSaldoCredito(
            String texto) {

        if (texto == null) {
            return -1.0d;
        }


        Matcher m =
                Pattern.compile(
                        "saldo\\s*:\\s*([0-9]+(?:[\\.,][0-9]+)?)",
                        Pattern.CASE_INSENSITIVE
                ).matcher(texto);


        if (m.find()) {

            try {

                return Double.parseDouble(
                        m.group(1)
                                .replace(',', '.')
                );

            } catch (NumberFormatException ignored) {
            }
        }


        return -1.0d;
    }


    // =========================================================
    // FINALIZAÇÕES
    // =========================================================

    private void finalizarComSucesso(
            int saldoRestante) {

        AppLog.add(
                this,
                TAG,
                "FIM -> SUCESSO saldoRestante="
                        + saldoRestante
        );

        cancelarTimeout();

        voltarAoBackground();

        estado = Estado.IDLE;

        TransferenciaCallback cb =
                callbackAtual;

        callbackAtual = null;

        if (cb != null) {

            cb.onSucesso(
                    saldoRestante
            );
        }
    }


    private void finalizarComSaldoInsuficiente(
            int saldoAtual) {

        AppLog.add(
                this,
                TAG,
                "FIM -> SALDO_INSUFICIENTE saldo="
                        + saldoAtual
        );

        cancelarTimeout();

        voltarAoBackground();

        estado = Estado.IDLE;

        TransferenciaCallback cb =
                callbackAtual;

        callbackAtual = null;

        if (cb != null) {

            cb.onSaldoInsuficiente(
                    saldoAtual
            );
        }
    }


    private void finalizarComLimiteDiario() {

        AppLog.add(
                this,
                TAG,
                "FIM -> LIMITE_DIARIO"
        );

        cancelarTimeout();

        voltarAoBackground();

        estado = Estado.IDLE;

        TransferenciaCallback cb =
                callbackAtual;

        callbackAtual = null;

        if (cb != null) {

            cb.onLimiteDiarioAtingido();
        }
    }


    private void finalizarComSucessoCredito() {

        AppLog.add(
                this,
                TAG,
                "[CREDITO] FIM -> SUCESSO"
        );

        cancelarTimeout();

        voltarAoBackground();

        estado = Estado.IDLE;

        CreditoCallback cb =
                creditoCallbackAtual;

        creditoCallbackAtual = null;

        if (cb != null) {

            cb.onSucesso();
        }
    }


    private void finalizarComErro(
            String motivo) {

        String motivoFinal =
                motivo;

        if (ultimoPassoEnviado) {

            if ("MMI_INVALIDO".equals(
                    motivo
            )) {

                motivoFinal =
                        "MMI_INVALIDO_POS_NUMERO";

            } else if (
                    !"PROPRIO_NUMERO".equals(
                            motivo
                    )
            ) {

                motivoFinal =
                        "ERRO_POS_NUMERO:"
                                + motivo;
            }
        }


        AppLog.add(
                this,
                TAG,
                "FIM -> ERRO motivo="
                        + motivoFinal
                        + " ultimoPassoEnviado="
                        + ultimoPassoEnviado
        );

        cancelarTimeout();

        voltarAoBackground();

        estado = Estado.IDLE;

        TransferenciaCallback cbMegas =
                callbackAtual;

        CreditoCallback cbCredito =
                creditoCallbackAtual;

        callbackAtual = null;

        creditoCallbackAtual = null;


        if (cbMegas != null) {

            cbMegas.onErro(
                    motivoFinal
            );
        }


        if (cbCredito != null) {

            cbCredito.onErro(
                    motivoFinal
            );
        }
    }


    private void cancelarTimeout() {

        if (timeoutRunnable != null) {

            handler.removeCallbacks(
                    timeoutRunnable
            );

            timeoutRunnable = null;
        }
    }
}