package com.lacoste.auto;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

public class TelaHelper {

    private static final String TAG = "TelaHelper";

    /*
     * Tempo máximo de segurança para manter o WakeLock.
     */
    private static final long TIMEOUT_SEGURANCA_MS = 90000L;

    private static final Handler handler =
            new Handler(Looper.getMainLooper());

    private static Runnable timeoutRunnable;

    private static PowerManager.WakeLock wakeLockAtual;

    /**
     * Liga/mantém a tela acordada durante uma operação USSD.
     */
    public static synchronized void ligar(Context ctx) {

        if (ctx == null) {
            Log.e(TAG, "Context nulo. Não foi possível manter a tela ligada.");
            return;
        }

        try {

            /*
             * Se já existe um WakeLock ativo,
             * apenas renovamos o timeout.
             */
            if (wakeLockAtual != null
                    && wakeLockAtual.isHeld()) {

                reagendarTimeout(ctx);

                Log.d(
                        TAG,
                        "WakeLock já estava ativo. Timeout renovado."
                );

                return;
            }

            Context appContext =
                    ctx.getApplicationContext();

            PowerManager pm =
                    (PowerManager) appContext.getSystemService(
                            Context.POWER_SERVICE
                    );

            if (pm == null) {

                Log.e(
                        TAG,
                        "PowerManager não disponível."
                );

                return;
            }

            /*
             * SCREEN_BRIGHT_WAKE_LOCK:
             * mantém a tela ligada.
             *
             * ACQUIRE_CAUSES_WAKEUP:
             * acorda o aparelho quando necessário.
             */
            int flags =
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                            | PowerManager.ACQUIRE_CAUSES_WAKEUP;

            PowerManager.WakeLock novoWakeLock =
                    pm.newWakeLock(
                            flags,
                            "AutosistemaTransfer:UssdTela"
                    );

            novoWakeLock.setReferenceCounted(false);

            wakeLockAtual = novoWakeLock;

            /*
             * Nunca manter o WakeLock indefinidamente.
             */
            novoWakeLock.acquire(
                    TIMEOUT_SEGURANCA_MS
            );

            Log.i(
                    TAG,
                    "Tela ligada para operação USSD."
            );

            AppLog.add(
                    appContext,
                    TAG,
                    "Tela ligada para operação USSD."
            );

            reagendarTimeout(appContext);

        } catch (SecurityException e) {

            Log.e(
                    TAG,
                    "Permissão/limitação do sistema ao ligar a tela: "
                            + e.getMessage(),
                    e
            );

            AppLog.add(
                    ctx,
                    TAG,
                    "Falha ao ligar tela: " + e.getMessage()
            );

        } catch (Exception e) {

            Log.e(
                    TAG,
                    "Falha ao ligar a tela: "
                            + e.getMessage(),
                    e
            );

            AppLog.add(
                    ctx,
                    TAG,
                    "Falha ao ligar tela: " + e.getMessage()
            );
        }
    }

    /**
     * Liberta o WakeLock e cancela o timeout.
     */
    public static synchronized void desligar() {

        /*
         * Cancela primeiro o timeout.
         */
        try {

            if (timeoutRunnable != null) {

                handler.removeCallbacks(
                        timeoutRunnable
                );

                timeoutRunnable = null;
            }

        } catch (Exception e) {

            Log.w(
                    TAG,
                    "Erro ao cancelar timeout: "
                            + e.getMessage()
            );
        }

        /*
         * Liberta o WakeLock.
         */
        try {

            if (wakeLockAtual != null) {

                if (wakeLockAtual.isHeld()) {

                    wakeLockAtual.release();

                    Log.i(
                            TAG,
                            "Tela libertada — operação USSD terminou."
                    );
                }
            }

        } catch (Exception e) {

            Log.e(
                    TAG,
                    "Falha ao libertar a tela: "
                            + e.getMessage(),
                    e
            );

        } finally {

            wakeLockAtual = null;
        }
    }

    /**
     * Verifica se o WakeLock está atualmente ativo.
     */
    public static synchronized boolean estaLigada() {

        try {

            return wakeLockAtual != null
                    && wakeLockAtual.isHeld();

        } catch (Exception e) {

            return false;
        }
    }

    /**
     * Renova o timeout de segurança.
     */
    private static synchronized void reagendarTimeout(
            final Context ctx
    ) {

        /*
         * Remove timeout anterior.
         */
        if (timeoutRunnable != null) {

            handler.removeCallbacks(
                    timeoutRunnable
            );
        }

        /*
         * Cria novo timeout.
         */
        timeoutRunnable = new Runnable() {

            @Override
            public void run() {

                Log.w(
                        TAG,
                        "Timeout de segurança (90s) — "
                                + "libertando a tela mesmo sem "
                                + "confirmação de fim."
                );

                try {

                    if (ctx != null) {

                        AppLog.add(
                                ctx.getApplicationContext(),
                                TAG,
                                "Timeout de segurança (90s) — "
                                        + "libertando a tela mesmo sem "
                                        + "confirmação de fim."
                        );
                    }

                } catch (Exception e) {

                    Log.w(
                            TAG,
                            "Não foi possível registrar timeout: "
                                    + e.getMessage()
                    );
                }

                desligar();
            }
        };

        handler.postDelayed(
                timeoutRunnable,
                TIMEOUT_SEGURANCA_MS
        );
    }
}