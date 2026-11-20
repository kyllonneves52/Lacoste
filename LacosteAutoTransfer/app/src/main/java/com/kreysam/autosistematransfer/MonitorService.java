package com.kreysam.autosistematransfer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

import java.util.HashMap;
import java.util.Map;

import org.json.JSONArray;
import org.json.JSONObject;

public class MonitorService extends Service {

    private static final String CANAL_ID = "autosistema_monitor";

    private static final long COOLDOWN_FALHA_MS = 120000;
    private static final long INTERVALO_FILA_MS = 20000;
    private static final long INTERVALO_HEARTBEAT_MS = 30000;
    private static final long INTERVALO_RETRY_ERRO_MS = 6000;

    private static final int MAX_TENTATIVAS_ERRO = 3;
    private static final int NOTIF_ID = 7788;

    private static final String TAG = "MonitorService";

    private static volatile boolean processandoPedido = false;

    private static final Map<String, Long> ultimaFalhaPorPedido =
            new HashMap<>();

    private final Handler handler =
            new Handler(Looper.getMainLooper());

    private final Runnable heartbeatRunnable = new Runnable() {
        @Override
        public void run() {

            try {
                ApiClient.enviarHeartbeat(
                        MonitorService.this.getApplicationContext()
                );
            } catch (Exception e) {
                AppLog.add(
                        MonitorService.this.getApplicationContext(),
                        TAG,
                        "Erro no heartbeat: " + e.getMessage()
                );
            }

            handler.postDelayed(
                    this,
                    INTERVALO_HEARTBEAT_MS
            );
        }
    };

    private final Runnable filaRunnable = new Runnable() {
        @Override
        public void run() {

            Context ctx = MonitorService.this.getApplicationContext();

            try {

                if (Prefs.getComunicacaoAtiva(ctx)
                        && !processandoPedido
                        && temSimDisponivel(ctx)) {

                    consultarFila(ctx);
                }

            } catch (Exception e) {

                AppLog.add(
                        ctx,
                        TAG,
                        "Erro no monitor da fila: " + e.getMessage()
                );
            }

            handler.postDelayed(
                    this,
                    INTERVALO_FILA_MS
            );
        }
    };

    private boolean temSimDisponivel(Context ctx) {

        for (int sim = 1; sim <= 2; sim++) {

            try {

                if (Prefs.getTransferenciasRestantes(ctx, sim) > 0
                        && UssdTransferManager.simEhVodacom(ctx, sim)) {

                    return true;
                }

            } catch (Exception e) {

                AppLog.add(
                        ctx,
                        TAG,
                        "Erro ao verificar SIM " + sim + ": "
                                + e.getMessage()
                );
            }
        }

        AppLog.add(
                ctx,
                TAG,
                "Nenhum SIM disponivel -- a saltar consulta de fila."
        );

        return false;
    }

    @Override
    public void onCreate() {

        super.onCreate();

        criarCanalSeNecessario();

        try {
            startForeground(
                    NOTIF_ID,
                    construirNotificacao()
            );
        } catch (Exception e) {

            AppLog.add(
                    getApplicationContext(),
                    TAG,
                    "Erro ao iniciar foreground: " + e.getMessage()
            );
        }

        handler.post(heartbeatRunnable);
        handler.post(filaRunnable);

        try {
            TtsHelper.iniciar(
                    getApplicationContext()
            );
        } catch (Exception e) {

            AppLog.add(
                    getApplicationContext(),
                    TAG,
                    "Erro ao iniciar TTS: " + e.getMessage()
            );
        }

        AppLog.add(
                getApplicationContext(),
                TAG,
                "MonitorService iniciado."
        );
    }

    @Override
    public int onStartCommand(
            Intent intent,
            int flags,
            int startId
    ) {

        return START_STICKY;
    }

    @Override
    public void onDestroy() {

        handler.removeCallbacks(
                heartbeatRunnable
        );

        handler.removeCallbacks(
                filaRunnable
        );

        AppLog.add(
                getApplicationContext(),
                TAG,
                "MonitorService parado."
        );

        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void consultarFila(final Context ctx) {

        AppLog.add(
                ctx,
                TAG,
                "A consultar fila..."
        );

        ApiClient.buscarPedidos(
                ctx,
                new ApiClient.PedidosCallback() {

                    @Override
                    public void onPedidos(JSONArray pedidos) {

                        if (pedidos == null
                                || pedidos.length() == 0) {

                            return;
                        }

                        for (int i = 0;
                             i < pedidos.length();
                             i++) {

                            JSONObject pedido =
                                    pedidos.optJSONObject(i);

                            if (pedido == null) {
                                continue;
                            }

                            String pedidoId =
                                    pedido.optString(
                                            "pedidoId",
                                            ""
                                    );

                            if (pedidoId.isEmpty()) {
                                continue;
                            }

                            Long ultimaFalha =
                                    ultimaFalhaPorPedido.get(
                                            pedidoId
                                    );

                            boolean podeTentar =
                                    ultimaFalha == null
                                            || System.currentTimeMillis()
                                            - ultimaFalha
                                            >= COOLDOWN_FALHA_MS;

                            if (podeTentar) {

                                processarPedido(
                                        ctx,
                                        pedido
                                );

                                return;
                            }
                        }
                    }

                    @Override
                    public void onErro(String motivo) {

                        AppLog.add(
                                ctx,
                                TAG,
                                "Falha ao consultar fila: "
                                        + motivo
                        );
                    }
                }
        );
    }

    private void processarPedido(
            final Context ctx,
            JSONObject pedido
    ) {

        final String pedidoId =
                pedido.optString(
                        "pedidoId",
                        ""
                );

        if (pedidoId.isEmpty()) {
            return;
        }

        if (Prefs.pedidoJaEntregue(
                ctx,
                pedidoId
        )) {

            AppLog.add(
                    ctx,
                    TAG,
                    "Pedido " + pedidoId
                            + " ja foi entregue antes -- "
                            + "NAO vou redisscar, "
                            + "so reenvio a confirmacao ao painel."
            );

            ApiClient.concluirPedido(
                    ctx,
                    pedidoId,
                    new ApiClient.ConcluirCallback() {

                        @Override
                        public void onResultado(boolean ok) {

                            AppLog.add(
                                    ctx,
                                    TAG,
                                    "Reenvio de confirmacao do pedido "
                                            + pedidoId
                                            + ": "
                                            + ok
                            );
                        }
                    }
            );

            return;
        }

        String tipo =
                pedido.optString(
                        "tipo",
                        "megas"
                );

        if ("credito".equalsIgnoreCase(tipo)) {

            processarPedidoCredito(
                    ctx,
                    pedido,
                    pedidoId
            );

            return;
        }

        String numero =
                pedido.optString(
                        "numero",
                        ""
                );

        int quantidadeMB =
                pedido.optInt(
                        "quantidadeMB",
                        0
                );

        String quantidadeLabel =
                pedido.optString(
                        "quantidadeLabel",
                        quantidadeMB + "MB"
                );

        if (numero.isEmpty()
                || quantidadeMB <= 0) {

            AppLog.add(
                    ctx,
                    TAG,
                    "Pedido " + pedidoId
                            + " ignorado -- dados invalidos "
                            + "(numero=" + numero
                            + " mb=" + quantidadeMB
                            + ")"
            );

            ApiClient.falharPedido(
                    ctx,
                    pedidoId,
                    "Dados do pedido invalidos "
                            + "(numero ou quantidade em falta)."
            );

            ultimaFalhaPorPedido.put(
                    pedidoId,
                    System.currentTimeMillis()
            );

            return;
        }

        if (processandoPedido) {
            return;
        }

        processandoPedido = true;

        AppLog.add(
                ctx,
                TAG,
                "Pedido recebido: "
                        + quantidadeLabel
                        + " para "
                        + numero
                        + " (id="
                        + pedidoId
                        + ")"
        );

        tentarTransferencia(
                ctx,
                pedidoId,
                numero,
                quantidadeMB,
                1
        );
    }

    private void processarPedidoCredito(
            Context ctx,
            JSONObject pedido,
            String pedidoId
    ) {

        String numero =
                pedido.optString(
                        "numero",
                        ""
                );

        String valorMT =
                pedido.optString(
                        "valorMT",
                        pedido.optString(
                                "valor",
                                ""
                        )
                );

        if (numero.isEmpty()
                || valorMT.isEmpty()) {

            AppLog.add(
                    ctx,
                    TAG,
                    "Pedido de credito "
                            + pedidoId
                            + " ignorado -- dados invalidos "
                            + "(numero="
                            + numero
                            + " valorMT="
                            + valorMT
                            + ")"
            );

            ApiClient.falharPedido(
                    ctx,
                    pedidoId,
                    "Dados do pedido de credito invalidos "
                            + "(numero ou valorMT em falta)."
            );

            ultimaFalhaPorPedido.put(
                    pedidoId,
                    System.currentTimeMillis()
            );

            return;
        }

        if (processandoPedido) {
            return;
        }

        processandoPedido = true;

        AppLog.add(
                ctx,
                TAG,
                "Pedido de credito recebido: "
                        + valorMT
                        + "MT para "
                        + numero
                        + " (id="
                        + pedidoId
                        + ")"
        );

        tentarTransferenciaCredito(
                ctx,
                pedidoId,
                numero,
                valorMT,
                1
        );
    }

    private void tentarTransferenciaCredito(
            final Context ctx,
            final String pedidoId,
            final String numero,
            final String valorMT,
            final int tentativa
    ) {

        UssdTransferManager.transferirCredito(
                ctx,
                valorMT,
                numero,
                new UssdTransferManager.ResultadoCreditoCallback() {

                    @Override
                    public void onSucesso(int sim) {

                        AppLog.add(
                                ctx,
                                TAG,
                                "Pedido de credito concluido "
                                        + "(id="
                                        + pedidoId
                                        + ", via SIM "
                                        + sim
                                        + ") -- "
                                        + "a confirmar ao painel..."
                        );

                        ultimaFalhaPorPedido.remove(
                                pedidoId
                        );

                        Prefs.marcarPedidoEntregue(
                                ctx,
                                pedidoId
                        );

                        liberarProcessamentoDepois(
                                ctx,
                                pedidoId,
                                true
                        );

                        ApiClient.concluirPedido(
                                ctx,
                                pedidoId,
                                new ApiClient.ConcluirCallback() {

                                    @Override
                                    public void onResultado(
                                            boolean ok
                                    ) {

                                        AppLog.add(
                                                ctx,
                                                TAG,
                                                "Pedido de credito "
                                                        + pedidoId
                                                        + " confirmado ao painel: "
                                                        + ok
                                        );

                                        liberarProcessamento();
                                    }
                                }
                        );
                    }

                    @Override
                    public void onErro(String motivo) {

                        String m =
                                motivo == null
                                        ? ""
                                        : motivo.toLowerCase();

                        boolean definitivo =
                                m.contains(
                                        "saldo insuficiente"
                                )
                                || m.contains(
                                        "numero invalido"
                                )
                                || m.contains(
                                        "valor de credito invalido"
                                )
                                || m.contains(
                                        "proprio numero"
                                );

                        if (definitivo
                                || tentativa
                                >= MAX_TENTATIVAS_ERRO) {

                            AppLog.add(
                                    ctx,
                                    TAG,
                                    "Pedido de credito "
                                            + pedidoId
                                            + ": falhou ("
                                            + motivo
                                            + ")"
                            );

                            ApiClient.falharPedido(
                                    ctx,
                                    pedidoId,
                                    motivo
                            );

                            ultimaFalhaPorPedido.put(
                                    pedidoId,
                                    System.currentTimeMillis()
                            );

                            liberarProcessamento();

                            return;
                        }

                        final int proximaTentativa =
                                tentativa + 1;

                        AppLog.add(
                                ctx,
                                TAG,
                                "Pedido de credito "
                                        + pedidoId
                                        + ": erro tecnico ("
                                        + motivo
                                        + ") -- tentativa "
                                        + proximaTentativa
                                        + "/"
                                        + MAX_TENTATIVAS_ERRO
                                        + " em 6s..."
                        );

                        handler.postDelayed(
                                new Runnable() {

                                    @Override
                                    public void run() {

                                        tentarTransferenciaCredito(
                                                ctx,
                                                pedidoId,
                                                numero,
                                                valorMT,
                                                proximaTentativa
                                        );
                                    }
                                },
                                INTERVALO_RETRY_ERRO_MS
                        );
                    }
                }
        );
    }

    private void tentarTransferencia(
            final Context ctx,
            final String pedidoId,
            final String numero,
            final int quantidadeMB,
            final int tentativa
    ) {

        UssdTransferManager.transferir(
                ctx,
                quantidadeMB,
                numero,
                new UssdTransferManager.ResultadoCallback() {

                    @Override
                    public void onSucesso(
                            int sim,
                            int saldoRestanteMB
                    ) {

                        AppLog.add(
                                ctx,
                                TAG,
                                "Pedido concluido "
                                        + "(id="
                                        + pedidoId
                                        + ", via SIM "
                                        + sim
                                        + ", saldo restante "
                                        + saldoRestanteMB
                                        + "MB) -- "
                                        + "a confirmar ao painel..."
                        );

                        ultimaFalhaPorPedido.remove(
                                pedidoId
                        );

                        Prefs.marcarPedidoEntregue(
                                ctx,
                                pedidoId
                        );

                        ApiClient.concluirPedido(
                                ctx,
                                pedidoId,
                                new ApiClient.ConcluirCallback() {

                                    @Override
                                    public void onResultado(
                                            boolean ok
                                    ) {

                                        AppLog.add(
                                                ctx,
                                                TAG,
                                                "Pedido "
                                                        + pedidoId
                                                        + " confirmado ao painel: "
                                                        + ok
                                        );

                                        liberarProcessamento();
                                    }
                                }
                        );

                        handler.postDelayed(
                                new Runnable() {

                                    @Override
                                    public void run() {

                                        liberarProcessamento();
                                    }
                                },
                                INTERVALO_HEARTBEAT_MS
                        );
                    }

                    @Override
                    public void onFalhaSaldoInsuficiente(
                            String detalhes
                    ) {

                        AppLog.add(
                                ctx,
                                TAG,
                                "Pedido falhou (id="
                                        + pedidoId
                                        + "): "
                                        + detalhes
                        );

                        ApiClient.falharPedido(
                                ctx,
                                pedidoId,
                                detalhes
                        );

                        ultimaFalhaPorPedido.put(
                                pedidoId,
                                System.currentTimeMillis()
                        );

                        liberarProcessamento();
                    }

                    @Override
                    public void onErro(String motivo) {

                        if (tentativa
                                < MAX_TENTATIVAS_ERRO) {

                            final int proximaTentativa =
                                    tentativa + 1;

                            AppLog.add(
                                    ctx,
                                    TAG,
                                    "Pedido "
                                            + pedidoId
                                            + ": erro tecnico ("
                                            + motivo
                                            + ") -- tentativa "
                                            + proximaTentativa
                                            + "/"
                                            + MAX_TENTATIVAS_ERRO
                                            + " em 6s..."
                            );

                            handler.postDelayed(
                                    new Runnable() {

                                        @Override
                                        public void run() {

                                            tentarTransferencia(
                                                    ctx,
                                                    pedidoId,
                                                    numero,
                                                    quantidadeMB,
                                                    proximaTentativa
                                            );
                                        }
                                    },
                                    INTERVALO_RETRY_ERRO_MS
                            );

                            return;
                        }

                        AppLog.add(
                                ctx,
                                TAG,
                                "Pedido "
                                        + pedidoId
                                        + ": falhou apos "
                                        + MAX_TENTATIVAS_ERRO
                                        + " tentativas: "
                                        + motivo
                        );

                        ApiClient.falharPedido(
                                ctx,
                                pedidoId,
                                motivo
                        );

                        ultimaFalhaPorPedido.put(
                                pedidoId,
                                System.currentTimeMillis()
                        );

                        liberarProcessamento();
                    }
                }
        );
    }

    private void liberarProcessamento() {
        processandoPedido = false;
    }

    private void liberarProcessamentoDepois(
            Context ctx,
            String pedidoId,
            boolean sucesso
    ) {

        handler.postDelayed(
                new Runnable() {

                    @Override
                    public void run() {

                        if (processandoPedido) {

                            AppLog.add(
                                    ctx,
                                    TAG,
                                    "Liberando processamento do pedido "
                                            + pedidoId
                            );

                            processandoPedido = false;
                        }
                    }
                },
                INTERVALO_HEARTBEAT_MS
        );
    }

    private void criarCanalSeNecessario() {

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {

            NotificationChannel canal =
                    new NotificationChannel(
                            CANAL_ID,
                            "Monitor Autosistema",
                            NotificationManager.IMPORTANCE_LOW
                    );

            canal.setDescription(
                    "Mantém o monitor de SMS M-Pesa/E-Mola sempre ativo."
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
    }

    private Notification construirNotificacao() {

        int total = 0;

        try {
            total = Prefs.getTotalEnviados(this);
        } catch (Exception ignored) {
        }

        return new NotificationCompat.Builder(
                this,
                CANAL_ID
        )
                .setContentTitle(
                        "Autosistema Transfer ativo"
                )
                .setContentText(
                        "A monitorizar M-Pesa/E-Mola • "
                                + total
                                + " enviados"
                )
                .setSmallIcon(
                        android.R.drawable.stat_sys_download_done
                )
                .setOngoing(true)
                .setPriority(
                        NotificationCompat.PRIORITY_LOW
                )
                .build();
    }
}