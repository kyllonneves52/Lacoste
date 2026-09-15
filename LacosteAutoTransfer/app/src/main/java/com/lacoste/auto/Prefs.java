package com.lacoste.auto;

import android.content.Context;
import android.content.SharedPreferences;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

import org.json.JSONObject;

/* JADX INFO: loaded from: classes3.dex */
public class Prefs {

    private static final String FILE = "autosistema_transfer_prefs";
    private static final String KEY_COMUNICACAO_ATIVA = "comunicacao_ativa";
    private static final String KEY_VERIFICACAO_SMS_ATIVA = "verificacao_sms_ativa";
    private static final String KEY_NUMERO_FIXO_SIM1 = "numero_fixo_sim1";
    private static final String KEY_NUMERO_FIXO_SIM2 = "numero_fixo_sim2";
    private static final String KEY_PEDIDOS_ENTREGUES = "pedidos_entregues_json";
    private static final String KEY_SALDO_CREDITO_SIM1 = "saldo_credito_sim1";
    private static final String KEY_SALDO_CREDITO_SIM2 = "saldo_credito_sim2";
    private static final String KEY_SALDO_SIM1 = "saldo_sim1";
    private static final String KEY_SALDO_SIM1_TS = "saldo_sim1_ts";
    private static final String KEY_SALDO_SIM2 = "saldo_sim2";
    private static final String KEY_SALDO_SIM2_TS = "saldo_sim2_ts";
    private static final String KEY_SIM_ATIVO = "sim_ativo";
    private static final String KEY_SIM_CREDITO_DISPONIVEL = "sim_credito_disponivel";
    private static final String KEY_STATUS_DISPOSITIVO = "status_dispositivo";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_ANDROID_ID = "android_id_local";
    private static final String KEY_FCM_TOKEN = "fcm_token";
    private static final String KEY_TOTAL_ENVIADOS = "total_enviados";
    private static final String KEY_TRANSF_DATA = "transf_data_contagem";
    private static final String KEY_TRANSF_USADAS_SIM1 = "transf_usadas_sim1";
    private static final String KEY_TRANSF_USADAS_SIM2 = "transf_usadas_sim2";
    private static final String KEY_ULTIMA_VERIFICACAO_FALHOU = "ultima_verificacao_falhou";
    private static final String KEY_ULTIMO_ENVIO = "ultimo_envio";
    private static final String KEY_ULTIMO_ERRO = "ultimo_erro";
    private static final String KEY_URL_PAINEL = "url_painel";
    private static final String KEY_LICENSE_REQUEST_ID = "license_request_id";
    private static final String KEY_DEVICE_SLOT = "device_slot";
    private static final String KEY_DEVICE_EXPIRES_AT = "device_expires_at";
    // Kreysam: configuração de encaminhamento de SMS/notificações.


    private static final int MAX_PEDIDOS_GUARDADOS = 200;
    public static final int MAX_TRANSFERENCIAS_DIA = 10;
    private static final long PEDIDO_ENTREGUE_EXPIRA_MS = 86400000L;

    private static SharedPreferences sp(Context ctx) {
        return ctx.getApplicationContext()
                .getSharedPreferences(FILE, 0);
    }

    public static String getToken(Context ctx) {
        return sp(ctx).getString(KEY_TOKEN, "");
    }

    public static void setToken(Context ctx, String token) {
        sp(ctx).edit()
                .putString(KEY_TOKEN, token == null ? "" : token.trim())
                .apply();
    }

    public static String getAndroidIdLocal(Context ctx) {
        return sp(ctx).getString(KEY_ANDROID_ID, "");
    }

    public static void setAndroidIdLocal(Context ctx, String value) {
        sp(ctx).edit().putString(KEY_ANDROID_ID, value == null ? "" : value.trim()).apply();
    }

    public static String getFcmToken(Context ctx) {
        return sp(ctx).getString(KEY_FCM_TOKEN, "");
    }

    public static void setFcmToken(Context ctx, String value) {
        sp(ctx).edit().putString(KEY_FCM_TOKEN, value == null ? "" : value.trim()).apply();
    }

    public static int getTotalEnviados(Context ctx) {
        return sp(ctx).getInt(KEY_TOTAL_ENVIADOS, 0);
    }

    public static void incrementarEnviados(Context ctx) {
        SharedPreferences p = sp(ctx);
        int total = p.getInt(KEY_TOTAL_ENVIADOS, 0) + 1;

        p.edit()
                .putInt(KEY_TOTAL_ENVIADOS, total)
                .putLong(KEY_ULTIMO_ENVIO, System.currentTimeMillis())
                .apply();
    }

    public static long getUltimoEnvio(Context ctx) {
        return sp(ctx).getLong(KEY_ULTIMO_ENVIO, 0L);
    }

    public static void setUltimoErro(Context ctx, String erro) {
        sp(ctx).edit()
                .putString(KEY_ULTIMO_ERRO, erro)
                .apply();
    }

    public static String getUrlPainel(Context ctx) {
        return sp(ctx).getString(KEY_URL_PAINEL, "https://lacoste-site.vercel.app");
    }

    public static String getLicenseRequestId(Context ctx) {
        return sp(ctx).getString(KEY_LICENSE_REQUEST_ID, "");
    }

    public static void setLicenseRequestId(Context ctx, String id) {
        sp(ctx).edit().putString(KEY_LICENSE_REQUEST_ID, id == null ? "" : id.trim()).apply();
    }

    public static int getDeviceSlot(Context ctx) {
        return sp(ctx).getInt(KEY_DEVICE_SLOT, 0);
    }

    public static void setDeviceSlot(Context ctx, int slot) {
        sp(ctx).edit().putInt(KEY_DEVICE_SLOT, Math.max(0, slot)).apply();
    }

    public static String getDeviceExpiresAt(Context ctx) {
        return sp(ctx).getString(KEY_DEVICE_EXPIRES_AT, "");
    }

    public static void setDeviceExpiresAt(Context ctx, String value) {
        sp(ctx).edit().putString(KEY_DEVICE_EXPIRES_AT, value == null ? "" : value).apply();
    }

    public static void setUrlPainel(Context ctx, String url) {
        String limpo = url == null ? "" : url.trim();

        if (limpo.endsWith("/")) {
            limpo = limpo.substring(0, limpo.length() - 1);
        }

        sp(ctx).edit()
                .putString(KEY_URL_PAINEL, limpo)
                .apply();
    }

    public static String getStatusDispositivo(Context ctx) {
        return sp(ctx).getString(
                KEY_STATUS_DISPOSITIVO,
                "nao_registado"
        );
    }

    public static void setStatusDispositivo(Context ctx, String status) {
        sp(ctx).edit()
                .putString(
                        KEY_STATUS_DISPOSITIVO,
                        status == null ? "nao_registado" : status
                )
                .apply();
    }

    public static boolean getUltimaVerificacaoFalhou(Context ctx) {
        return sp(ctx).getBoolean(
                KEY_ULTIMA_VERIFICACAO_FALHOU,
                false
        );
    }

    public static void setUltimaVerificacaoFalhou(
            Context ctx,
            boolean falhou
    ) {
        sp(ctx).edit()
                .putBoolean(KEY_ULTIMA_VERIFICACAO_FALHOU, falhou)
                .apply();
    }

    public static boolean getComunicacaoAtiva(Context ctx) {
        return sp(ctx).getBoolean(
                KEY_COMUNICACAO_ATIVA,
                true
        );
    }

    public static void setComunicacaoAtiva(
            Context ctx,
            boolean ativa
    ) {
        sp(ctx).edit()
                .putBoolean(KEY_COMUNICACAO_ATIVA, ativa)
                .apply();
    }

    /**
     * Controla se o MonitorService deve exigir confirmação do pagamento por SMS
     * antes de executar um pedido automático.
     * Padrão: ligado.
     */
    public static boolean getVerificacaoSmsAtiva(Context ctx) {
        return sp(ctx).getBoolean(KEY_VERIFICACAO_SMS_ATIVA, true);
    }

    public static void setVerificacaoSmsAtiva(Context ctx, boolean ativa) {
        sp(ctx).edit()
                .putBoolean(KEY_VERIFICACAO_SMS_ATIVA, ativa)
                .apply();
    }

    public static int getSimAtivo(Context ctx) {
        return sp(ctx).getInt(KEY_SIM_ATIVO, 1);
    }

    public static void setSimAtivo(Context ctx, int sim) {
        sp(ctx).edit()
                .putInt(KEY_SIM_ATIVO, sim)
                .apply();
    }

    public static String getUltimoErro(Context ctx) {
        return sp(ctx).getString(KEY_ULTIMO_ERRO, "");
    }

    public static int getSimCreditoDisponivel(Context ctx) {
        return sp(ctx).getInt(
                KEY_SIM_CREDITO_DISPONIVEL,
                1
        );
    }

    public static void setSimCreditoDisponivel(
            Context ctx,
            int sim
    ) {
        sp(ctx).edit()
                .putInt(KEY_SIM_CREDITO_DISPONIVEL, sim)
                .apply();
    }

    public static double getSaldoCredito(
            Context ctx,
            int sim
    ) {
        String raw = sp(ctx).getString(
                sim == 1
                        ? KEY_SALDO_CREDITO_SIM1
                        : KEY_SALDO_CREDITO_SIM2,
                "-1"
        );

        try {
            return Double.parseDouble(raw);
        } catch (Exception e) {
            return -1.0d;
        }
    }

    public static void setSaldoCredito(
            Context ctx,
            int sim,
            double saldo
    ) {
        sp(ctx).edit()
                .putString(
                        sim == 1
                                ? KEY_SALDO_CREDITO_SIM1
                                : KEY_SALDO_CREDITO_SIM2,
                        String.valueOf(saldo)
                )
                .apply();
    }

    public static long getSaldo(Context ctx, int sim) {
        return sp(ctx).getLong(
                sim == 1
                        ? KEY_SALDO_SIM1
                        : KEY_SALDO_SIM2,
                -1L
        );
    }

    public static long getSaldoTimestamp(
            Context ctx,
            int sim
    ) {
        return sp(ctx).getLong(
                sim == 1
                        ? KEY_SALDO_SIM1_TS
                        : KEY_SALDO_SIM2_TS,
                0L
        );
    }

    public static void setSaldo(
            Context ctx,
            int sim,
            long saldoMB
    ) {
        sp(ctx).edit()
                .putLong(
                        sim == 1
                                ? KEY_SALDO_SIM1
                                : KEY_SALDO_SIM2,
                        saldoMB
                )
                .putLong(
                        sim == 1
                                ? KEY_SALDO_SIM1_TS
                                : KEY_SALDO_SIM2_TS,
                        System.currentTimeMillis()
                )
                .apply();
    }

    private static String hojeMaputo() {
        SimpleDateFormat sdf =
                new SimpleDateFormat(
                        "yyyy-MM-dd",
                        Locale.US
                );

        sdf.setTimeZone(
                TimeZone.getTimeZone("Africa/Maputo")
        );

        return sdf.format(new Date());
    }

    private static void garantirDiaAtual(Context ctx) {
        SharedPreferences p = sp(ctx);

        String hoje = hojeMaputo();
        String guardado = p.getString(
                KEY_TRANSF_DATA,
                ""
        );

        if (!hoje.equals(guardado)) {
            p.edit()
                    .putString(KEY_TRANSF_DATA, hoje)
                    .putInt(KEY_TRANSF_USADAS_SIM1, 0)
                    .putInt(KEY_TRANSF_USADAS_SIM2, 0)
                    .apply();
        }
    }

    public static int getTransferenciasUsadasHoje(
            Context ctx,
            int sim
    ) {
        garantirDiaAtual(ctx);

        return sp(ctx).getInt(
                sim == 1
                        ? KEY_TRANSF_USADAS_SIM1
                        : KEY_TRANSF_USADAS_SIM2,
                0
        );
    }

    public static int getTransferenciasRestantes(
            Context ctx,
            int sim
    ) {
        int usadas =
                getTransferenciasUsadasHoje(ctx, sim);

        int restantes =
                MAX_TRANSFERENCIAS_DIA - usadas;

        return Math.max(restantes, 0);
    }

    public static void registrarTransferenciaUsada(
            Context ctx,
            int sim
    ) {
        garantirDiaAtual(ctx);

        SharedPreferences p = sp(ctx);

        String key =
                sim == 1
                        ? KEY_TRANSF_USADAS_SIM1
                        : KEY_TRANSF_USADAS_SIM2;

        p.edit()
                .putInt(
                        key,
                        p.getInt(key, 0) + 1
                )
                .apply();
    }

    public static String getNumeroFixo(
            Context ctx,
            int sim
    ) {
        return sp(ctx).getString(
                sim == 1
                        ? KEY_NUMERO_FIXO_SIM1
                        : KEY_NUMERO_FIXO_SIM2,
                ""
        );
    }

    public static void setNumeroFixo(
            Context ctx,
            int sim,
            String numero
    ) {
        String val =
                numero == null
                        ? ""
                        : numero.trim();

        sp(ctx).edit()
                .putString(
                        sim == 1
                                ? KEY_NUMERO_FIXO_SIM1
                                : KEY_NUMERO_FIXO_SIM2,
                        val
                )
                .apply();
    }

    public static void resetarTransferencias(
            Context ctx,
            int sim
    ) {
        garantirDiaAtual(ctx);

        String key =
                sim == 1
                        ? KEY_TRANSF_USADAS_SIM1
                        : KEY_TRANSF_USADAS_SIM2;

        sp(ctx).edit()
                .putInt(key, 0)
                .apply();
    }

    public static void ajustarRestantes(
            Context ctx,
            int sim,
            int delta
    ) {
        garantirDiaAtual(ctx);

        SharedPreferences p = sp(ctx);

        String key =
                sim == 1
                        ? KEY_TRANSF_USADAS_SIM1
                        : KEY_TRANSF_USADAS_SIM2;

        int usadasAtual =
                p.getInt(key, 0);

        int novoUsadas =
                usadasAtual - delta;

        p.edit()
                .putInt(
                        key,
                        Math.max(
                                0,
                                Math.min(
                                        MAX_TRANSFERENCIAS_DIA,
                                        novoUsadas
                                )
                        )
                )
                .apply();
    }

    public static void marcarPedidoEntregue(
            Context ctx,
            String pedidoId
    ) {
        try {
            JSONObject mapa =
                    lerPedidosEntregues(ctx);

            limparPedidosAntigos(mapa);

            mapa.put(
                    pedidoId,
                    System.currentTimeMillis()
            );

            while (
                    mapa.length()
                            > MAX_PEDIDOS_GUARDADOS
            ) {
                String maisAntigo = null;
                long menorTs = Long.MAX_VALUE;

                Iterator<String> it =
                        mapa.keys();

                while (it.hasNext()) {
                    String k = it.next();

                    long ts =
                            mapa.optLong(k, 0L);

                    if (ts < menorTs) {
                        menorTs = ts;
                        maisAntigo = k;
                    }
                }

                if (maisAntigo == null) {
                    break;
                } else {
                    mapa.remove(maisAntigo);
                }
            }

            sp(ctx).edit()
                    .putString(
                            KEY_PEDIDOS_ENTREGUES,
                            mapa.toString()
                    )
                    .apply();

        } catch (Exception e) {
            // Ignorar erro para não interromper o fluxo.
        }
    }

    public static boolean pedidoJaEntregue(
            Context ctx,
            String pedidoId
    ) {
        try {
            JSONObject mapa =
                    lerPedidosEntregues(ctx);

            if (!mapa.has(pedidoId)) {
                return false;
            }

            long ts =
                    mapa.optLong(
                            pedidoId,
                            0L
                    );

            return System.currentTimeMillis() - ts
                    < PEDIDO_ENTREGUE_EXPIRA_MS;

        } catch (Exception e) {
            return false;
        }
    }

    private static JSONObject lerPedidosEntregues(
            Context ctx
    ) {
        try {
            String bruto =
                    sp(ctx).getString(
                            KEY_PEDIDOS_ENTREGUES,
                            "{}"
                    );

            return new JSONObject(bruto);

        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private static void limparPedidosAntigos(
            JSONObject mapa
    ) {
        try {
            long agora =
                    System.currentTimeMillis();

            List<String> expirados =
                    new ArrayList<>();

            Iterator<String> it =
                    mapa.keys();

            while (it.hasNext()) {
                String k = it.next();

                long ts =
                        mapa.optLong(k, 0L);

                if (
                        agora - ts
                                >= PEDIDO_ENTREGUE_EXPIRA_MS
                ) {
                    expirados.add(k);
                }
            }

            Iterator<String> it2 =
                    expirados.iterator();

            while (it2.hasNext()) {
                mapa.remove(it2.next());
            }

        } catch (Exception e) {
            // Ignorar erro de limpeza.
        }
    }

    public static void forcarLimiteAtingido(
            Context ctx,
            int sim
    ) {
        garantirDiaAtual(ctx);

        String key =
                sim == 1
                        ? KEY_TRANSF_USADAS_SIM1
                        : KEY_TRANSF_USADAS_SIM2;

        sp(ctx).edit()
                .putInt(
                        key,
                        MAX_TRANSFERENCIAS_DIA
                )
                .apply();
    }


        // ===== Sistemas integrados do Kreysam =====

    public static String getNumeroExtra(Context ctx) {
        return sp(ctx).getString("numero_extra", "");
    }

    public static void setNumeroExtra(Context ctx, String numero) {
        sp(ctx).edit().putString("numero_extra", numero == null ? "" : numero.trim()).apply();
    }
}