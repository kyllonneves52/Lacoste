package com.lacoste.auto;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.content.Intent;
import org.json.JSONArray;
import org.json.JSONObject;

public class PollingService {
    private static Handler handler = new Handler(Looper.getMainLooper());
    private static Runnable runnable;
    private static boolean rodando = false;
    private static String ultimoPedidoId = ""; // pra não executar 2x o mesmo

    public static void iniciar(final Context ctx) {
        if (rodando) return;
        rodando = true;
        
        runnable = new Runnable() {
            @Override
            public void run() {
                if (!rodando) return;
                
                // BUSCA PEDIDO NO SERVIDOR
                ApiClient.buscarPedidos(ctx, new ApiClient.PedidosCallback() {
                    @Override
                    public void onPedidos(JSONArray pedidos) {
                        try {
                            if (pedidos.length() > 0) {
                                JSONObject pedido = pedidos.getJSONObject(0); // pega o primeiro da fila
                                String pedidoId = pedido.getString("pedidoId");
                                
                                // só executa se for pedido novo
                                if (!pedidoId.equals(ultimoPedidoId)) {
                                    ultimoPedidoId = pedidoId;
                                    AppLog.add(ctx, "Polling", "NOVO PEDIDO: " + pedidoId);
                                    
                                    // CHAMA O TRANSFER SERVICE NA HORA
                                    // O MonitorService é o executor oficial; o PollingService não deve duplicar a transferência.
                                    Intent i = new Intent(ctx, MonitorService.class);
                                    i.setAction(MonitorService.ACTION_WAKE);
                                    if (android.os.Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
                                }
                            }
                        } catch (Exception e) {
                            AppLog.add(ctx, "Polling", "Erro ao ler pedido: " + e.getMessage());
                        }
                    }

                    @Override
                    public void onErro(String erro) {
                        // não loga pra não poluir
                    }
                });

                // MANDA HEARTBEAT PRA FICAR ONLINE
                ApiClient.enviarHeartbeat(ctx);

                // REPETE EM 1 SEGUNDO
                handler.postDelayed(this, 3000); // 3 segundos
            }
        };
        handler.post(runnable);
        AppLog.add(ctx, "Polling", "Polling iniciado - 1 segundo");
    }

    public static void parar() {
        rodando = false;
        ultimoPedidoId = "";
        if (handler != null && runnable != null) {
            handler.removeCallbacks(runnable);
        }
        AppLog.add(null, "Polling", "Polling parado");
    }
}