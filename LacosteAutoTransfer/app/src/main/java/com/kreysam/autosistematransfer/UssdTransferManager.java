package com.kreysam.autosistematransfer;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.util.Log;

import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class UssdTransferManager {

    public static final int MAX_MB_TRANSFERENCIA = 10240;
    public static final int MIN_MB_TRANSFERENCIA = 100;

    private static final int MAX_TENTATIVAS_MMI = 2;
    private static final int MAX_TENTATIVAS_ULTIMA = 3;

    private static final String TAG = "UssdTransferManager";

    private static final String USSD_MENU = "*162#";
    private static final String USSD_CREDITO_MENU = "*111#";
    private static final String USSD_CREDITO_SALDO = "*100#";

    private static final Handler handler =
            new Handler(Looper.getMainLooper());

    private interface ErroSimples {
        void onErro(String mensagem);
    }

    public interface ResultadoCallback {

        void onErro(String mensagem);

        void onFalhaSaldoInsuficiente(String detalhes);

        void onSucesso(int sim, int saldoRestanteMB);
    }

    public interface ResultadoCreditoCallback {

        void onErro(String mensagem);

        void onSucesso(int sim);
    }

    public interface SaldoCallback {

        void onErro(int sim, String mensagem);

        void onSaldoLido(int sim, int saldoMB);
    }

    public interface SaldoCreditoCallback {

        void onErro(int sim, String mensagem);

        void onSaldoLido(int sim, double saldoMT);
    }

    // =========================================================
    // TRANSFERÊNCIA DE MB
    // =========================================================

    public static void transferir(
            final Context ctx,
            int quantidadeMB,
            String numero,
            final ResultadoCallback callback
    ) {

        Objects.requireNonNull(callback);

        String numeroLimpo = limparNumero(numero);

        if (numeroLimpo == null) {

            callback.onErro(
                    "Numero invalido: " + numero +
                    " -- deve ter 9 digitos e comecar com 84 ou 85."
            );

            return;
        }

        if (quantidadeMB < MIN_MB_TRANSFERENCIA) {

            callback.onErro(
                    "Quantidade insuficiente: " +
                    quantidadeMB +
                    "MB -- minimo e 100MB."
            );

            return;
        }

        if (quantidadeMB > MAX_MB_TRANSFERENCIA) {
            quantidadeMB = MAX_MB_TRANSFERENCIA;
        }

        final int quantidadeFinal = quantidadeMB;
        final String numeroFinal = numeroLimpo;

        if (!temPermissoesENecessario(
                ctx,
                new ErroSimples() {
                    @Override
                    public void onErro(String mensagem) {
                        callback.onErro(mensagem);
                    }
                }
        )) {
            return;
        }

        TelaHelper.ligar(ctx);

        TtsHelper.falar(
                "A transferir " +
                quantidadeFinal +
                " megabytes para " +
                TtsHelper.numeroTelefonePorExtenso(numeroFinal)
        );

        ResultadoCallback callbackComTela =
                new ResultadoCallback() {

                    @Override
                    public void onSucesso(
                            final int sim,
                            int saldoRestanteMB
                    ) {

                        TelaHelper.desligar();

                        int restantes =
                                Prefs.getTransferenciasRestantes(
                                        ctx,
                                        sim
                                );

                        final String numeroFixo =
                                Prefs.getNumeroFixo(
                                        ctx,
                                        sim
                                );

                        if (restantes == 0) {

                            TtsHelper.falar(
                                    "Transferido com sucesso. " +
                                    "Atencao, nao ha mais transferencias " +
                                    "disponiveis hoje neste Sim."
                            );

                            callback.onSucesso(
                                    sim,
                                    saldoRestanteMB
                            );

                            return;
                        }

                        if (restantes == 1 &&
                                numeroFixo != null &&
                                !numeroFixo.isEmpty()) {

                            TtsHelper.falar(
                                    "Transferido com sucesso. " +
                                    "Resta apenas uma transferencia. " +
                                    "A transferir saldo restante para " +
                                    "o numero fixo."
                            );

                            AppLog.add(
                                    ctx,
                                    TAG,
                                    "Ultima transferencia do SIM " +
                                    sim +
                                    " -- confirmando pedido e iniciando para " +
                                    numeroFixo
                            );

                            callback.onSucesso(
                                    sim,
                                    saldoRestanteMB
                            );

                            handler.postDelayed(
                                    new Runnable() {
                                        @Override
                                        public void run() {

                                            tentarComSimUltima(
                                                    ctx,
                                                    numeroFixo,
                                                    sim,
                                                    1
                                            );
                                        }
                                    },
                                    3500L
                            );

                            return;
                        }

                        if (restantes == 1) {

                            TtsHelper.falar(
                                    "Transferido com sucesso. " +
                                    "Resta apenas uma transferencia " +
                                    "hoje neste Sim."
                            );

                        } else {

                            TtsHelper.falar(
                                    "Transferido com sucesso. " +
                                    "Restam " +
                                    restantes +
                                    " transferencias hoje."
                            );
                        }

                        callback.onSucesso(
                                sim,
                                saldoRestanteMB
                        );
                    }

                    @Override
                    public void onFalhaSaldoInsuficiente(
                            String detalhes
                    ) {

                        TelaHelper.desligar();

                        TtsHelper.falar(
                                "Falha na transferencia. " +
                                "Nenhum Sim disponivel."
                        );

                        callback.onFalhaSaldoInsuficiente(
                                detalhes
                        );
                    }

                    @Override
                    public void onErro(
                            String motivo
                    ) {

                        TelaHelper.desligar();

                        TtsHelper.falar(
                                "Falha na transferencia."
                        );

                        callback.onErro(motivo);
                    }
                };

        int simInicial =
                Prefs.getSimAtivo(ctx);

        tentarComSim(
                ctx,
                quantidadeFinal,
                numeroFinal,
                simInicial,
                callbackComTela,
                0,
                null
        );
    }

    // =========================================================
    // ÚLTIMA TRANSFERÊNCIA
    // =========================================================

    public static void transferirUltimaAgora(
            final Context ctx,
            int sim,
            String numeroFixo
    ) {

        if (!temPermissoesENecessario(
                ctx,
                new ErroSimples() {
                    @Override
                    public void onErro(String mensagem) {

                        TtsHelper.falar(
                                "Nao foi possivel iniciar. " +
                                mensagem
                        );

                        AppLog.add(
                                ctx,
                                TAG,
                                "transferirUltimaAgora falhou: " +
                                mensagem
                        );
                    }
                }
        )) {
            return;
        }

        String numeroLimpo = limparNumero(numeroFixo);

        if (numeroLimpo == null) {

            TtsHelper.falar(
                    "Numero fixo invalido."
            );

            AppLog.add(
                    ctx,
                    TAG,
                    "transferirUltimaAgora: numero invalido."
            );

            return;
        }

        TtsHelper.falar(
                "A iniciar transferencia para o numero fixo."
        );

        AppLog.add(
                ctx,
                TAG,
                "transferirUltimaAgora: SIM " +
                sim +
                " para " +
                numeroLimpo
        );

        tentarComSimUltima(
                ctx,
                numeroLimpo,
                sim,
                1
        );
    }

    // =========================================================
    // ÚLTIMA TRANSFERÊNCIA - PROCESSAMENTO
    // =========================================================

    private static void tentarComSimUltima(
            final Context ctx,
            final String numeroFixo,
            final int sim,
            final int tentativa
    ) {

        if (!simEhVodacom(ctx, sim)) {

            TtsHelper.falar(
                    "Este SIM nao e Vodacom. " +
                    "Transferencia final cancelada."
            );

            AppLog.add(
                    ctx,
                    TAG,
                    "tentarComSimUltima: SIM " +
                    sim +
                    " nao e Vodacom."
            );

            return;
        }

        if (Prefs.getTransferenciasRestantes(ctx, sim) <= 0) {

            TtsHelper.falar(
                    "Sem transferencias disponiveis " +
                    "para a transferencia final."
            );

            AppLog.add(
                    ctx,
                    TAG,
                    "tentarComSimUltima: SIM " +
                    sim +
                    " sem transferencias restantes."
            );

            return;
        }

        AppLog.add(
                ctx,
                TAG,
                "tentarComSimUltima: tentativa " +
                tentativa +
                "/" +
                MAX_TENTATIVAS_ULTIMA +
                " para " +
                numeroFixo
        );

        TelaHelper.ligar(ctx);

        String erroDiscagem =
                discar(
                        ctx,
                        USSD_MENU,
                        sim
                );

        if (erroDiscagem != null) {

            TelaHelper.desligar();

            if (tentativa < MAX_TENTATIVAS_ULTIMA) {

                AppLog.add(
                        ctx,
                        TAG,
                        "tentarComSimUltima: falha ao discar -- " +
                        "nova tentativa em 6s."
                );

                handler.postDelayed(
                        new Runnable() {
                            @Override
                            public void run() {

                                tentarComSimUltima(
                                        ctx,
                                        numeroFixo,
                                        sim,
                                        tentativa + 1
                                );
                            }
                        },
                        6000L
                );

                return;
            }

            TtsHelper.falar(
                    "Falha na transferencia final " +
                    "apos 3 tentativas."
            );

            return;
        }

        handler.postDelayed(
                new Runnable() {
                    @Override
                    public void run() {

                        UssdAccessibilityService
                                .iniciarTransferenciaComSaldoReal(
                                        numeroFixo,
                                        new UssdAccessibilityService.TransferenciaCallback() {

                                            @Override
                                            public void onSaldoLido(
                                                    int saldoMB
                                            ) {

                                                TtsHelper.falar(
                                                        "A transferir " +
                                                        Math.min(
                                                                saldoMB,
                                                                MAX_MB_TRANSFERENCIA
                                                        ) +
                                                        " megabytes para o numero fixo."
                                                );

                                                AppLog.add(
                                                        ctx,
                                                        TAG,
                                                        "Ultima transferencia: saldo=" +
                                                        saldoMB +
                                                        "MB, enviando=" +
                                                        Math.min(
                                                                saldoMB,
                                                                MAX_MB_TRANSFERENCIA
                                                        ) +
                                                        "MB para " +
                                                        numeroFixo
                                                );
                                            }

                                            @Override
                                            public void onSucesso(
                                                    int saldoFinal
                                            ) {

                                                TelaHelper.desligar();

                                                Prefs.setSaldo(
                                                        ctx,
                                                        sim,
                                                        saldoFinal
                                                );

                                                Prefs.registrarTransferenciaUsada(
                                                        ctx,
                                                        sim
                                                );

                                                Prefs.setSimAtivo(
                                                        ctx,
                                                        sim
                                                );

                                                Prefs.setNumeroFixo(
                                                        ctx,
                                                        sim,
                                                        ""
                                                );

                                                TtsHelper.falar(
                                                        "Transferencia final concluida. " +
                                                        "Nao ha mais transferencias " +
                                                        "disponiveis hoje neste Sim."
                                                );

                                                AppLog.add(
                                                        ctx,
                                                        TAG,
                                                        "Ultima transferencia " +
                                                        "concluida para " +
                                                        numeroFixo
                                                );
                                            }

                                            @Override
                                            public void onSaldoInsuficiente(
                                                    int saldoAtual
                                            ) {

                                                TelaHelper.desligar();

                                                TtsHelper.falar(
                                                        "Saldo restante " +
                                                        saldoAtual +
                                                        " megabytes, " +
                                                        "insuficiente para transferir."
                                                );

                                                AppLog.add(
                                                        ctx,
                                                        TAG,
                                                        "Ultima transferencia cancelada -- " +
                                                        "saldo " +
                                                        saldoAtual +
                                                        "MB abaixo de 100MB."
                                                );
                                            }

                                            @Override
                                            public void onLimiteDiarioAtingido() {

                                                TelaHelper.desligar();

                                                Prefs.forcarLimiteAtingido(
                                                        ctx,
                                                        sim
                                                );

                                                Prefs.setNumeroFixo(
                                                        ctx,
                                                        sim,
                                                        ""
                                                );

                                                TtsHelper.falar(
                                                        "Limite diario atingido."
                                                );

                                                AppLog.add(
                                                        ctx,
                                                        TAG,
                                                        "Ultima transferencia: " +
                                                        "limite diario atingido."
                                                );
                                            }

                                            @Override
                                            public void onErro(
                                                    String motivo
                                            ) {

                                                TelaHelper.desligar();

                                                AppLog.add(
                                                        ctx,
                                                        TAG,
                                                        "Ultima transferencia erro " +
                                                        "(tentativa " +
                                                        tentativa +
                                                        "): " +
                                                        motivo
                                                );

                                                if (tentativa <
                                                        MAX_TENTATIVAS_ULTIMA) {

                                                    TtsHelper.falar(
                                                            "Falha na transferencia final. " +
                                                            "A tentar novamente."
                                                    );

                                                    handler.postDelayed(
                                                            new Runnable() {
                                                                @Override
                                                                public void run() {

                                                                    tentarComSimUltima(
                                                                            ctx,
                                                                            numeroFixo,
                                                                            sim,
                                                                            tentativa + 1
                                                                    );
                                                                }
                                                            },
                                                            6000L
                                                    );

                                                    return;
                                                }

                                                TtsHelper.falar(
                                                        "Falha na transferencia final " +
                                                        "apos 3 tentativas."
                                                );
                                            }
                                        }
                                );
                    }
                },
                1200L
        );
    }

    // =========================================================
    // LIMPAR NÚMERO
    // =========================================================

    private static String limparNumero(
            String bruto
    ) {

        if (bruto == null) {
            return null;
        }

        String digitos =
                bruto.replaceAll(
                        "[^0-9]",
                        ""
                );

        if (digitos.length() == 12 &&
                digitos.startsWith("258")) {

            digitos =
                    digitos.substring(3);
        }

        if (digitos.length() != 9) {
            return null;
        }

        if (!digitos.startsWith("84") &&
                !digitos.startsWith("85")) {

            return null;
        }

        return digitos;
    }

    // =========================================================
    // CONSULTAR SALDO MB
    // =========================================================

    public static void consultarSaldo(
            final Context ctx,
            final int sim,
            final SaldoCallback callback
    ) {

        Objects.requireNonNull(callback);

        if (!temPermissoesENecessario(
                ctx,
                new ErroSimples() {
                    @Override
                    public void onErro(String mensagem) {
                        callback.onErro(
                                sim,
                                mensagem
                        );
                    }
                }
        )) {
            return;
        }

        if (!simEhVodacom(ctx, sim)) {

            callback.onErro(
                    sim,
                    "Este SIM nao e Vodacom -- " +
                    "o *162# so funciona na rede Vodacom."
            );

            return;
        }

        TelaHelper.ligar(ctx);

        TtsHelper.falar(
                "A consultar saldo do Sim " +
                sim +
                "."
        );

        String erroDiscagem =
                discar(
                        ctx,
                        USSD_MENU,
                        sim
                );

        if (erroDiscagem != null) {

            TelaHelper.desligar();

            callback.onErro(
                    sim,
                    "Falha ao discar *162# no SIM " +
                    sim +
                    ": " +
                    erroDiscagem
            );

            return;
        }

        handler.postDelayed(
                new Runnable() {
                    @Override
                    public void run() {

                        UssdAccessibilityService
                                .iniciarConsultaSaldo(
                                        new UssdAccessibilityService.TransferenciaCallback() {

                                            @Override
                                            public void onSaldoLido(
                                                    int saldoMB
                                            ) {
                                                // Não utilizado.
                                            }

                                            @Override
                                            public void onSucesso(
                                                    int saldoLido
                                            ) {

                                                TelaHelper.desligar();

                                                Prefs.setSaldo(
                                                        ctx,
                                                        sim,
                                                        saldoLido
                                                );

                                                callback.onSaldoLido(
                                                        sim,
                                                        saldoLido
                                                );
                                            }

                                            @Override
                                            public void onSaldoInsuficiente(
                                                    int saldoAtual
                                            ) {

                                                TelaHelper.desligar();

                                                callback.onErro(
                                                        sim,
                                                        "Resposta inesperada " +
                                                        "da operadora ao " +
                                                        "consultar saldo."
                                                );
                                            }

                                            @Override
                                            public void onLimiteDiarioAtingido() {

                                                TelaHelper.desligar();

                                                Prefs.forcarLimiteAtingido(
                                                        ctx,
                                                        sim
                                                );

                                                AppLog.add(
                                                        ctx,
                                                        TAG,
                                                        "Consulta ao SIM " +
                                                        sim +
                                                        " voltou limite diario " +
                                                        "atingido -- contador " +
                                                        "local sincronizado."
                                                );

                                                callback.onErro(
                                                        sim,
                                                        "Limite diario de 10 " +
                                                        "transferencias ja atingido " +
                                                        "neste SIM."
                                                );
                                            }

                                            @Override
                                            public void onErro(
                                                    String motivo
                                            ) {

                                                TelaHelper.desligar();

                                                if ("MMI_INVALIDO".equals(
                                                        motivo
                                                )) {

                                                    callback.onErro(
                                                            sim,
                                                            "Codigo MMI invalido " +
                                                            "-- tenta consultar de novo."
                                                    );

                                                } else {

                                                    callback.onErro(
                                                            sim,
                                                            motivo
                                                    );
                                                }
                                            }
                                        }
                                );
                    }
                },
                1200L
        );
    }

    // =========================================================
    // PERMISSÕES
    // =========================================================

    private static boolean temPermissoesENecessario(
            Context ctx,
            ErroSimples onErro
    ) {

        if (ContextCompat.checkSelfPermission(
                ctx,
                "android.permission.CALL_PHONE"
        ) != 0) {

            onErro.onErro(
                    "Falta permissao CALL_PHONE -- " +
                    "toca em 'Permitir chamadas (USSD)' " +
                    "e aceita o popup do sistema."
            );

            return false;
        }

        if (!UssdAccessibilityService.estaAtivo()) {

            onErro.onErro(
                    "Servico de acessibilidade nao esta ativo. " +
                    "Ativa em Definicoes > Acessibilidade > " +
                    "Autosistema Transfer."
            );

            return false;
        }

        return true;
    }

    // =========================================================
    // COMBINAR ERROS
    // =========================================================

    private static String combinarMotivos(
            String motivoAnterior,
            String motivoAtual
    ) {

        if (motivoAnterior == null ||
                motivoAnterior.isEmpty()) {

            return motivoAtual;
        }

        return motivoAnterior +
                " | " +
                motivoAtual;
    }

    // =========================================================
    // TENTAR TRANSFERÊNCIA EM UM SIM
    // =========================================================

    private static void tentarComSim(
            final Context ctx,
            final int quantidadeMB,
            final String numero,
            final int sim,
            final ResultadoCallback callback,
            final int tentativaMmi,
            final String motivoSimAnterior
    ) {

        final int outroSim =
                3 - sim;

        final boolean primeiraTentativa =
                motivoSimAnterior == null;

        if (!simEhVodacom(ctx, sim)) {

            String meuMotivo =
                    "SIM " +
                    sim +
                    ": nao e Vodacom";

            AppLog.add(
                    ctx,
                    TAG,
                    meuMotivo
            );

            if (primeiraTentativa) {

                Prefs.setSimAtivo(
                        ctx,
                        outroSim
                );

                tentarComSim(
                        ctx,
                        quantidadeMB,
                        numero,
                        outroSim,
                        callback,
                        0,
                        meuMotivo
                );

                return;
            }

            callback.onErro(
                    combinarMotivos(
                            motivoSimAnterior,
                            meuMotivo
                    )
            );

            return;
        }

        if (Prefs.getTransferenciasRestantes(
                ctx,
                sim
        ) <= 0) {

            String meuMotivo =
                    "SIM " +
                    sim +
                    ": sem transferencias restantes hoje";

            AppLog.add(
                    ctx,
                    TAG,
                    meuMotivo +
                    " -- recusando SEM discar."
            );

            if (primeiraTentativa) {

                Prefs.setSimAtivo(
                        ctx,
                        outroSim
                );

                tentarComSim(
                        ctx,
                        quantidadeMB,
                        numero,
                        outroSim,
                        callback,
                        0,
                        meuMotivo
                );

                return;
            }

            callback.onFalhaSaldoInsuficiente(
                    combinarMotivos(
                            motivoSimAnterior,
                            meuMotivo
                    )
            );

            return;
        }

        Log.i(
                TAG,
                "Tentando SIM " +
                sim +
                " — " +
                quantidadeMB +
                "MB para " +
                numero +
                " (tentativaMmi=" +
                tentativaMmi +
                ")"
        );

        AppLog.add(
                ctx,
                TAG,
                "Tentando SIM " +
                sim +
                " -- " +
                quantidadeMB +
                "MB para " +
                numero +
                " (tentativaMmi=" +
                tentativaMmi +
                ")"
        );

        String erroDiscagem =
                discar(
                        ctx,
                        USSD_MENU,
                        sim
                );

        if (erroDiscagem != null) {

            callback.onErro(
                    combinarMotivos(
                            motivoSimAnterior,
                            "SIM " +
                            sim +
                            ": falha ao discar (" +
                            erroDiscagem +
                            ")"
                    )
            );

            return;
        }

        handler.postDelayed(
                new Runnable() {
                    @Override
                    public void run() {

                        UssdAccessibilityService
                                .iniciarProcessamento(
                                        quantidadeMB,
                                        numero,
                                        new UssdAccessibilityService.TransferenciaCallback() {

                                            @Override
                                            public void onSaldoLido(
                                                    int saldoMB
                                            ) {

                                                Prefs.setSaldo(
                                                        ctx,
                                                        sim,
                                                        saldoMB
                                                );

                                                Log.i(
                                                        TAG,
                                                        "Saldo lido no SIM " +
                                                        sim +
                                                        ": " +
                                                        saldoMB +
                                                        "MB"
                                                );

                                                AppLog.add(
                                                        ctx,
                                                        TAG,
                                                        "Saldo lido no SIM " +
                                                        sim +
                                                        ": " +
                                                        saldoMB +
                                                        "MB"
                                                );
                                            }

                                            @Override
                                            public void onSucesso(
                                                    int saldoRestanteMB
                                            ) {

                                                Prefs.setSaldo(
                                                        ctx,
                                                        sim,
                                                        saldoRestanteMB
                                                );

                                                Prefs.registrarTransferenciaUsada(
                                                        ctx,
                                                        sim
                                                );

                                                Prefs.setSimAtivo(
                                                        ctx,
                                                        sim
                                                );

                                                if (Prefs.getTransferenciasRestantes(
                                                        ctx,
                                                        sim
                                                ) == 0) {

                                                    Prefs.setNumeroFixo(
                                                            ctx,
                                                            sim,
                                                            ""
                                                    );
                                                }

                                                callback.onSucesso(
                                                        sim,
                                                        saldoRestanteMB
                                                );
                                            }

                                            @Override
                                            public void onSaldoInsuficiente(
                                                    int saldoAtual
                                            ) {

                                                String meuMotivo =
                                                        "SIM " +
                                                        sim +
                                                        ": saldo insuficiente (" +
                                                        saldoAtual +
                                                        "MB)";

                                                if (primeiraTentativa) {

                                                    Log.w(
                                                            TAG,
                                                            "SIM " +
                                                            sim +
                                                            " sem saldo (" +
                                                            saldoAtual +
                                                            "MB) — tentando SIM " +
                                                            outroSim +
                                                            "..."
                                                    );

                                                    AppLog.add(
                                                            ctx,
                                                            TAG,
                                                            "SIM " +
                                                            sim +
                                                            " sem saldo (" +
                                                            saldoAtual +
                                                            "MB) -- tentando SIM " +
                                                            outroSim +
                                                            "..."
                                                    );

                                                    Prefs.setSimAtivo(
                                                            ctx,
                                                            outroSim
                                                    );

                                                    tentarComSim(
                                                            ctx,
                                                            quantidadeMB,
                                                            numero,
                                                            outroSim,
                                                            callback,
                                                            0,
                                                            meuMotivo
                                                    );

                                                    return;
                                                }

                                                Log.w(
                                                        TAG,
                                                        "SIM " +
                                                        sim +
                                                        " também sem saldo — " +
                                                        "nenhum SIM disponível."
                                                );

                                                AppLog.add(
                                                        ctx,
                                                        TAG,
                                                        "SIM " +
                                                        sim +
                                                        " tambem sem saldo -- " +
                                                        "nenhum SIM disponivel."
                                                );

                                                callback.onFalhaSaldoInsuficiente(
                                                        combinarMotivos(
                                                                motivoSimAnterior,
                                                                meuMotivo
                                                        )
                                                );
                                            }

                                            @Override
                                            public void onLimiteDiarioAtingido() {

                                                Prefs.forcarLimiteAtingido(
                                                        ctx,
                                                        sim
                                                );

                                                Prefs.setNumeroFixo(
                                                        ctx,
                                                        sim,
                                                        ""
                                                );

                                                String meuMotivo =
                                                        "SIM " +
                                                        sim +
                                                        ": limite diario atingido";

                                                Log.w(
                                                        TAG,
                                                        "SIM " +
                                                        sim +
                                                        " confirmou limite diario " +
                                                        "atingido -- contador local " +
                                                        "sincronizado."
                                                );

                                                AppLog.add(
                                                        ctx,
                                                        TAG,
                                                        meuMotivo +
                                                        " -- contador local sincronizado."
                                                );

                                                if (!primeiraTentativa) {

                                                    callback.onFalhaSaldoInsuficiente(
                                                            combinarMotivos(
                                                                    motivoSimAnterior,
                                                                    meuMotivo
                                                            )
                                                    );

                                                } else {

                                                    Prefs.setSimAtivo(
                                                            ctx,
                                                            outroSim
                                                    );

                                                    tentarComSim(
                                                            ctx,
                                                            quantidadeMB,
                                                            numero,
                                                            outroSim,
                                                            callback,
                                                            0,
                                                            meuMotivo
                                                    );
                                                }
                                            }

                                            @Override
                                            public void onErro(
                                                    String motivo
                                            ) {

                                                if ("MMI_INVALIDO".equals(
                                                        motivo
                                                )) {

                                                    if (tentativaMmi <
                                                            MAX_TENTATIVAS_MMI) {

                                                        handler.postDelayed(
                                                                new Runnable() {
                                                                    @Override
                                                                    public void run() {

                                                                        tentarComSim(
                                                                                ctx,
                                                                                quantidadeMB,
                                                                                numero,
                                                                                sim,
                                                                                callback,
                                                                                tentativaMmi + 1,
                                                                                motivoSimAnterior
                                                                        );
                                                                    }
                                                                },
                                                                3000L
                                                        );

                                                        return;
                                                    }

                                                    String meuMotivo =
                                                            "SIM " +
                                                            sim +
                                                            ": MMI invalido " +
                                                            (tentativaMmi + 1) +
                                                            "x seguidas";

                                                    Log.w(
                                                            TAG,
                                                            meuMotivo
                                                    );

                                                    callback.onErro(
                                                            combinarMotivos(
                                                                    motivoSimAnterior,
                                                                    meuMotivo
                                                            )
                                                    );

                                                    return;
                                                }

                                                if (!"PROPRIO_NUMERO".equals(
                                                        motivo
                                                )) {

                                                    if (
                                                        "MMI_INVALIDO_POS_NUMERO"
                                                                .equals(motivo)
                                                        ||
                                                        motivo.startsWith(
                                                                "ERRO_POS_NUMERO:"
                                                        )
                                                    ) {

                                                        reconciliarAposErroAmbiguo(
                                                                ctx,
                                                                sim,
                                                                quantidadeMB,
                                                                numero,
                                                                motivo,
                                                                callback,
                                                                motivoSimAnterior
                                                        );

                                                        return;
                                                    }

                                                    callback.onErro(
                                                            combinarMotivos(
                                                                    motivoSimAnterior,
                                                                    "SIM " +
                                                                    sim +
                                                                    ": " +
                                                                    motivo
                                                            )
                                                    );

                                                    return;
                                                }

                                                String meuMotivo =
                                                        "SIM " +
                                                        sim +
                                                        ": numero e o proprio " +
                                                        "numero deste SIM";

                                                if (!primeiraTentativa) {

                                                    callback.onErro(
                                                            combinarMotivos(
                                                                    motivoSimAnterior,
                                                                    meuMotivo
                                                            )
                                                    );

                                                    return;
                                                }

                                                AppLog.add(
                                                        ctx,
                                                        TAG,
                                                        meuMotivo +
                                                        " -- tentando SIM " +
                                                        outroSim +
                                                        "..."
                                                );

                                                Prefs.setSimAtivo(
                                                        ctx,
                                                        outroSim
                                                );

                                                tentarComSim(
                                                        ctx,
                                                        quantidadeMB,
                                                        numero,
                                                        outroSim,
                                                        callback,
                                                        0,
                                                        meuMotivo
                                                );
                                            }
                                        }
                                );
                    }
                },
                1200L
        );
    }

    // =========================================================
    // RECONCILIAÇÃO DE MB
    // =========================================================

    private static void reconciliarAposErroAmbiguo(
            final Context ctx,
            final int sim,
            final int quantidadeMB,
            String numero,
            final String motivoOriginal,
            final ResultadoCallback callback,
            final String motivoSimAnterior
    ) {

        AppLog.add(
                ctx,
                TAG,
                "SIM " +
                sim +
                ": erro ambiguo APOS enviar o numero (" +
                motivoOriginal +
                ") -- a consultar saldo para confirmar se saiu."
        );

        final long saldoAntes =
                Prefs.getSaldo(
                        ctx,
                        sim
                );

        consultarSaldo(
                ctx,
                sim,
                new SaldoCallback() {

                    @Override
                    public void onSaldoLido(
                            int simRetornado,
                            int saldoAtual
                    ) {

                        if (
                            saldoAntes >= 0 &&
                            saldoAtual ==
                            saldoAntes - quantidadeMB
                        ) {

                            AppLog.add(
                                    ctx,
                                    TAG,
                                    "Reconciliacao SIM " +
                                    sim +
                                    ": saldo baixou exatamente " +
                                    quantidadeMB +
                                    "MB -- transferencia CONFIRMADA."
                            );

                            Prefs.registrarTransferenciaUsada(
                                    ctx,
                                    sim
                            );

                            Prefs.setSimAtivo(
                                    ctx,
                                    sim
                            );

                            callback.onSucesso(
                                    sim,
                                    saldoAtual
                            );

                            return;
                        }

                        callback.onErro(
                                combinarMotivos(
                                        motivoSimAnterior,
                                        "SIM " +
                                        sim +
                                        ": " +
                                        motivoOriginal +
                                        " (confirmado que nao saiu -- " +
                                        "saldo atual " +
                                        saldoAtual +
                                        "MB)"
                                )
                        );
                    }

                    @Override
                    public void onErro(
                            int simRetornado,
                            String motivoConsulta
                    ) {

                        String motivoBaixo =
                                motivoConsulta == null
                                ? ""
                                : motivoConsulta.toLowerCase();

                        if (
                            motivoBaixo.contains("limite") &&
                            motivoBaixo.contains("atingido")
                        ) {

                            AppLog.add(
                                    ctx,
                                    TAG,
                                    "Reconciliacao SIM " +
                                    sim +
                                    ": consulta retornou limite diario " +
                                    "atingido -- transferencia CONFIRMADA."
                            );

                            Prefs.registrarTransferenciaUsada(
                                    ctx,
                                    sim
                            );

                            Prefs.setSimAtivo(
                                    ctx,
                                    sim
                            );

                            callback.onSucesso(
                                    sim,
                                    -1
                            );

                            return;
                        }

                        callback.onErro(
                                combinarMotivos(
                                        motivoSimAnterior,
                                        "SIM " +
                                        sim +
                                        ": " +
                                        motivoOriginal +
                                        " (nao foi possivel confirmar via " +
                                        "consulta: " +
                                        motivoConsulta +
                                        ")"
                                )
                        );
                    }
                }
        );
    }

    // =========================================================
    // VERIFICAR OPERADORA
    // =========================================================

    public static boolean simEhVodacom(
            Context ctx,
            int sim
    ) {

        try {

            SubscriptionManager sm =
                    (SubscriptionManager)
                    ctx.getSystemService(
                            Context.TELEPHONY_SUBSCRIPTION_SERVICE
                    );

            if (sm == null) {
                return true;
            }

            List<SubscriptionInfo> infos =
                    sm.getActiveSubscriptionInfoList();

            if (infos == null) {
                return true;
            }

            for (SubscriptionInfo info : infos) {

                if (
                    info.getSimSlotIndex() ==
                    sim - 1
                ) {

                    CharSequence nomeOperadora =
                            info.getCarrierName();

                    boolean ehVodacom =
                            nomeOperadora != null &&
                            nomeOperadora
                                    .toString()
                                    .toLowerCase()
                                    .contains("vodacom");

                    if (!ehVodacom) {

                        Log.w(
                                TAG,
                                "SIM " +
                                sim +
                                " nao e Vodacom " +
                                "(operadora: " +
                                nomeOperadora +
                                ")"
                        );
                    }

                    return ehVodacom;
                }
            }

            return true;

        } catch (SecurityException e) {

            Log.w(
                    TAG,
                    "Sem permissao para verificar operadora " +
                    "do SIM " +
                    sim
            );

            return true;

        } catch (Exception e) {

            Log.w(
                    TAG,
                    "Erro ao verificar operadora do SIM " +
                    sim +
                    ": " +
                    e.getMessage()
            );

            return true;
        }
    }

    // =========================================================
    // CONSULTAR SALDO DE CRÉDITO
    // =========================================================

    public static void consultarSaldoCredito(
            final Context ctx,
            final int sim,
            final SaldoCreditoCallback callback
    ) {

        Objects.requireNonNull(callback);

        if (!temPermissoesENecessario(
                ctx,
                new ErroSimples() {
                    @Override
                    public void onErro(String mensagem) {
                        callback.onErro(sim, mensagem);
                    }
                }
        )) {
            return;
        }

        TelaHelper.ligar(ctx);

        TtsHelper.falar(
                "A consultar saldo de credito do Sim " +
                sim +
                "."
        );

        String erroDiscagem =
                discar(
                        ctx,
                        USSD_CREDITO_SALDO,
                        sim
                );

        if (erroDiscagem != null) {

            TelaHelper.desligar();

            callback.onErro(
                    sim,
                    "Falha ao discar *100# no SIM " +
                    sim +
                    ": " +
                    erroDiscagem
            );

            return;
        }

        handler.postDelayed(
                new Runnable() {
                    @Override
                    public void run() {

                        UssdAccessibilityService
                                .iniciarConsultaSaldoCredito(
                                        new UssdAccessibilityService.CreditoCallback() {

                                            @Override
                                            public void onSaldoLido(
                                                    double saldoMT
                                            ) {

                                                TelaHelper.desligar();

                                                TtsHelper.falar(
                                                        "Saldo de credito do Sim " +
                                                        sim +
                                                        ": " +
                                                        saldoMT +
                                                        " meticais."
                                                );

                                                AppLog.add(
                                                        ctx,
                                                        TAG,
                                                        "Saldo credito SIM " +
                                                        sim +
                                                        ": " +
                                                        saldoMT +
                                                        "MT"
                                                );

                                                callback.onSaldoLido(
                                                        sim,
                                                        saldoMT
                                                );
                                            }

                                            @Override
                                            public void onSucesso() {
                                                // Não utilizado.
                                            }

                                            @Override
                                            public void onErro(
                                                    String motivo
                                            ) {

                                                TelaHelper.desligar();

                                                callback.onErro(
                                                        sim,
                                                        motivo
                                                );
                                            }
                                        }
                                );
                    }
                },
                1200L
        );
    }

    // =========================================================
    // TRANSFERIR CRÉDITO
    // =========================================================

    public static void transferirCredito(
            final Context ctx,
            String valorMT,
            String numero,
            final ResultadoCreditoCallback callback
    ) {

        Objects.requireNonNull(callback);

        String numeroLimpo =
                limparNumero(numero);

        if (numeroLimpo == null) {

            callback.onErro(
                    "Numero invalido: " +
                    numero +
                    " -- deve ter 9 digitos e comecar com 84 ou 85."
            );

            return;
        }

        if (valorMT == null ||
                valorMT.trim().isEmpty()) {

            callback.onErro(
                    "Valor de credito invalido."
            );

            return;
        }

        final double valor;

        try {

            valor =
                    Double.parseDouble(
                            valorMT
                                    .replace(",", ".")
                                    .trim()
                    );

        } catch (NumberFormatException e) {

            callback.onErro(
                    "Valor de credito invalido: " +
                    valorMT
            );

            return;
        }

        if (valor <= 0) {

            callback.onErro(
                    "O valor de credito deve ser maior que zero."
            );

            return;
        }

        int simDisponivel =
                Prefs.getSimCreditoDisponivel(ctx);

        if (simDisponivel == 0) {

            AppLog.add(
                    ctx,
                    TAG,
                    "App indisponivel para transferir credito " +
                    "(toggle definido para Nenhum)."
            );

            ApiClient.enviarHeartbeat(ctx);

            callback.onErro(
                    "App indisponivel para transferir credito " +
                    "(toggle definido para Nenhum)."
            );

            return;
        }

        final String valorFinal = valorMT;
        final String numeroFinal = numeroLimpo;
        final int simFinal = simDisponivel;

        if (!temPermissoesENecessario(
                ctx,
                new ErroSimples() {
                    @Override
                    public void onErro(String mensagem) {
                        callback.onErro(mensagem);
                    }
                }
        )) {
            return;
        }

        precheckEtentarCredito(
                ctx,
                valorFinal,
                valor,
                numeroFinal,
                simFinal,
                callback
        );
    }

    // =========================================================
    // PRÉ-CHECK DE CRÉDITO
    // =========================================================

    private static void precheckEtentarCredito(
            final Context ctx,
            final String valorMT,
            final double valor,
            final String numero,
            final int sim,
            final ResultadoCreditoCallback callback
    ) {

        TelaHelper.ligar(ctx);

        String erroDisc =
                discar(
                        ctx,
                        USSD_CREDITO_SALDO,
                        sim
                );

        if (erroDisc != null) {

            TelaHelper.desligar();

            callback.onErro(
                    "SIM " +
                    sim +
                    ": falha ao discar *100# (" +
                    erroDisc +
                    ")"
            );

            return;
        }

        handler.postDelayed(
                new Runnable() {
                    @Override
                    public void run() {

                        UssdAccessibilityService
                                .iniciarConsultaSaldoCredito(
                                        new UssdAccessibilityService.CreditoCallback() {

                                            @Override
                                            public void onSaldoLido(
                                                    double saldoMT
                                            ) {

                                                TelaHelper.desligar();

                                                if (saldoMT < valor) {

                                                    String meuMotivo =
                                                            "SIM " +
                                                            sim +
                                                            ": saldo insuficiente (" +
                                                            saldoMT +
                                                            "MT < " +
                                                            valor +
                                                            "MT)";

                                                    TtsHelper.falar(
                                                            "Saldo insuficiente no Sim " +
                                                            sim +
                                                            ": " +
                                                            saldoMT +
                                                            " meticais."
                                                    );

                                                    callback.onErro(
                                                            meuMotivo
                                                    );

                                                    return;
                                                }

                                                Prefs.setSaldoCredito(
                                                        ctx,
                                                        sim,
                                                        saldoMT
                                                );

                                                TtsHelper.falar(
                                                        "A transferir " +
                                                        valorMT +
                                                        " meticais para " +
                                                        TtsHelper.numeroTelefonePorExtenso(
                                                                numero
                                                        ) +
                                                        "."
                                                );

                                                executarTransferenciaCredito(
                                                        ctx,
                                                        valorMT,
                                                        valor,
                                                        numero,
                                                        sim,
                                                        callback
                                                );
                                            }

                                            @Override
                                            public void onSucesso() {
                                                // Não utilizado.
                                            }

                                            @Override
                                            public void onErro(
                                                    String motivo
                                            ) {

                                                TelaHelper.desligar();

                                                callback.onErro(
                                                        "SIM " +
                                                        sim +
                                                        ": erro ao verificar saldo (" +
                                                        motivo +
                                                        ")"
                                                );
                                            }
                                        }
                                );
                    }
                },
                1200L
        );
    }

    // =========================================================
    // EXECUTAR TRANSFERÊNCIA DE CRÉDITO
    // =========================================================

    private static void executarTransferenciaCredito(
            final Context ctx,
            final String valorMT,
            final double valor,
            final String numero,
            final int sim,
            final ResultadoCreditoCallback callback
    ) {

        TelaHelper.ligar(ctx);

        String erroDisc =
                discar(
                        ctx,
                        USSD_CREDITO_MENU,
                        sim
                );

        if (erroDisc != null) {

            TelaHelper.desligar();

            callback.onErro(
                    "SIM " +
                    sim +
                    ": falha ao discar *111# (" +
                    erroDisc +
                    ")"
            );

            return;
        }

        handler.postDelayed(
                new Runnable() {
                    @Override
                    public void run() {

                        UssdAccessibilityService
                                .iniciarTransferenciaCredito(
                                        valorMT,
                                        numero,
                                        new UssdAccessibilityService.CreditoCallback() {

                                            @Override
                                            public void onSaldoLido(
                                                    double saldoMT
                                            ) {
                                                // Não utilizado.
                                            }

                                            @Override
                                            public void onSucesso() {

                                                TelaHelper.desligar();

                                                TtsHelper.falar(
                                                        "Credito transferido " +
                                                        "com sucesso."
                                                );

                                                AppLog.add(
                                                        ctx,
                                                        TAG,
                                                        "Credito " +
                                                        valorMT +
                                                        "MT para " +
                                                        numero +
                                                        " via SIM " +
                                                        sim +
                                                        " -- sucesso."
                                                );

                                                callback.onSucesso(sim);
                                            }

                                            @Override
                                            public void onErro(
                                                    String motivo
                                            ) {

                                                TelaHelper.desligar();

                                                if (
                                                    "MMI_INVALIDO_POS_NUMERO"
                                                            .equals(motivo)
                                                    ||
                                                    motivo.startsWith(
                                                            "ERRO_POS_NUMERO:"
                                                    )
                                                ) {

                                                    reconciliarCreditoAposErro(
                                                            ctx,
                                                            valorMT,
                                                            valor,
                                                            numero,
                                                            sim,
                                                            motivo,
                                                            callback
                                                    );

                                                } else {

                                                    callback.onErro(
                                                            "SIM " +
                                                            sim +
                                                            ": " +
                                                            motivo
                                                    );
                                                }
                                            }
                                        }
                                );
                    }
                },
                1200L
        );
    }

    // =========================================================
    // RECONCILIAÇÃO DE CRÉDITO
    // =========================================================

    private static void reconciliarCreditoAposErro(
            final Context ctx,
            final String valorMT,
            final double valor,
            final String numero,
            final int sim,
            final String motivoOriginal,
            final ResultadoCreditoCallback callback
    ) {

        final double saldoAntes =
                Prefs.getSaldoCredito(
                        ctx,
                        sim
                );

        TelaHelper.ligar(ctx);

        String erroDisc =
                discar(
                        ctx,
                        USSD_CREDITO_SALDO,
                        sim
                );

        if (erroDisc != null) {

            TelaHelper.desligar();

            callback.onErro(
                    "SIM " +
                    sim +
                    ": " +
                    motivoOriginal +
                    " (nao foi possivel confirmar via *100#)"
            );

            return;
        }

        handler.postDelayed(
                new Runnable() {
                    @Override
                    public void run() {

                        UssdAccessibilityService
                                .iniciarConsultaSaldoCredito(
                                        new UssdAccessibilityService.CreditoCallback() {

                                            @Override
                                            public void onSaldoLido(
                                                    double saldoAtual
                                            ) {

                                                TelaHelper.desligar();

                                                if (
                                                    saldoAntes >= 0.0 &&
                                                    saldoAtual <=
                                                    saldoAntes - valor
                                                ) {

                                                    AppLog.add(
                                                            ctx,
                                                            TAG,
                                                            "Reconciliacao credito SIM " +
                                                            sim +
                                                            ": transferencia CONFIRMADA."
                                                    );

                                                    Prefs.setSaldoCredito(
                                                            ctx,
                                                            sim,
                                                            saldoAtual
                                                    );

                                                    TtsHelper.falar(
                                                            "Credito transferido " +
                                                            "com sucesso."
                                                    );

                                                    callback.onSucesso(sim);

                                                } else {

                                                    callback.onErro(
                                                            "SIM " +
                                                            sim +
                                                            ": " +
                                                            motivoOriginal +
                                                            " (confirmado que nao saiu " +
                                                            "-- saldo atual " +
                                                            saldoAtual +
                                                            "MT)"
                                                    );
                                                }
                                            }

                                            @Override
                                            public void onSucesso() {
                                                // Não utilizado.
                                            }

                                            @Override
                                            public void onErro(
                                                    String motivoConsulta
                                            ) {

                                                TelaHelper.desligar();

                                                callback.onErro(
                                                        "SIM " +
                                                        sim +
                                                        ": " +
                                                        motivoOriginal +
                                                        " (nao foi possivel confirmar: " +
                                                        motivoConsulta +
                                                        ")"
                                                );
                                            }
                                        }
                                );
                    }
                },
                1200L
        );
    }

    // =========================================================
    // DISCAR USSD
    // =========================================================

    private static String discar(
            Context ctx,
            String codigo,
            int sim
    ) {

        try {

            Intent intent =
                    new Intent(
                            Intent.ACTION_CALL
                    );

            intent.setData(
                    Uri.parse(
                            "tel:" +
                            Uri.encode(codigo)
                    )
            );

            intent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
            );

            TelecomManager tm =
                    (TelecomManager)
                    ctx.getSystemService(
                            Context.TELECOM_SERVICE
                    );

            if (tm == null) {

                return "TelecomManager indisponivel no sistema.";
            }

            List<PhoneAccountHandle> todas =
                    tm.getCallCapablePhoneAccounts();

            if (todas == null) {
                todas = new ArrayList<>();
            }

            List<PhoneAccountHandle> simsDisponiveis =
                    new ArrayList<>();

            for (
                    PhoneAccountHandle handle :
                    todas
            ) {

                PhoneAccount account =
                        tm.getPhoneAccount(handle);

                if (
                    account != null &&
                    account.hasCapabilities(
                            PhoneAccount.CAPABILITY_CALL_PROVIDER
                    )
                ) {

                    simsDisponiveis.add(handle);
                }
            }

            if (simsDisponiveis.isEmpty()) {

                return
                        "Nenhum SIM com capacidade de chamada " +
                        "foi detectado (todas=" +
                        todas.size() +
                        ").";
            }

            int indice = sim - 1;

            if (
                indice >= 0 &&
                indice < simsDisponiveis.size()
            ) {

                intent.putExtra(
                        TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE,
                        simsDisponiveis.get(indice)
                );

            } else {

                intent.putExtra(
                        TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE,
                        simsDisponiveis.get(0)
                );
            }

            ctx.startActivity(intent);

            return null;

        } catch (SecurityException e) {

            Log.e(
                    TAG,
                    "SecurityException ao discar: " +
                    e.getMessage(),
                    e
            );

            return
                    "SecurityException -- permissao CALL_PHONE " +
                    "nao concedida em tempo real: " +
                    e.getMessage();

        } catch (Exception e) {

            Log.e(
                    TAG,
                    "Erro ao discar: " +
                    e.getMessage(),
                    e
            );

            return
                    e.getClass().getSimpleName() +
                    ": " +
                    e.getMessage();
        }
    }
}