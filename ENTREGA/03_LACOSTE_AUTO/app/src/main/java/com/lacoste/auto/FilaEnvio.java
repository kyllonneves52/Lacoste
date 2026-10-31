package com.lacoste.auto;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.nio.charset.StandardCharsets;

public class FilaEnvio {

    private static final int MAX_ITENS = 500;
    private static final String NOME_FICHEIRO = "fila_envio_pendente.json";
    private static final String TAG = "FilaEnvio";

    public FilaEnvio() {
    }

    public static synchronized void adicionar(Context ctx, String texto) {
        try {
            JSONArray fila = ler(ctx);

            // Evita duplicados
            for (int i = 0; i < fila.length(); i++) {
                JSONObject item = fila.optJSONObject(i);

                if (item != null &&
                        texto.equals(item.optString("texto"))) {
                    return;
                }
            }

            // Se chegou a 500, remove o item mais antigo
            if (fila.length() >= MAX_ITENS) {
                Log.w(TAG,
                        "Fila cheia (500) -- descartando o item mais antigo.");

                JSONArray nova = new JSONArray();

                for (int i = 1; i < fila.length(); i++) {
                    nova.put(fila.get(i));
                }

                fila = nova;
            }

            JSONObject item = new JSONObject();

            item.put("texto", texto);
            item.put("tentativas", 0);
            item.put("adicionadoEm", System.currentTimeMillis());

            fila.put(item);

            gravar(ctx, fila);

            Log.i(TAG,
                    "Mensagem guardada na fila pendente (total agora: "
                            + fila.length() + ")");

        } catch (Exception e) {
            Log.e(TAG,
                    "Falha ao adicionar à fila: "
                            + e.getMessage());
        }
    }

    private static File ficheiro(Context ctx) {
        return new File(
                ctx.getApplicationContext().getFilesDir(),
                NOME_FICHEIRO
        );
    }

    private static void gravar(Context ctx, JSONArray fila)
            throws Exception {

        File f = ficheiro(ctx);

        FileWriter fw = new FileWriter(f, false);

        try {
            fw.write(fila.toString());
        } finally {
            fw.close();
        }
    }

    public static synchronized void incrementarTentativas(
            Context ctx,
            String texto) {

        try {
            JSONArray fila = ler(ctx);

            for (int i = 0; i < fila.length(); i++) {

                JSONObject item = fila.optJSONObject(i);

                if (item != null &&
                        texto.equals(item.optString("texto"))) {

                    int tentativas =
                            item.optInt("tentativas", 0);

                    item.put("tentativas", tentativas + 1);
                }
            }

            gravar(ctx, fila);

        } catch (Exception e) {
            Log.e(TAG,
                    "Falha ao incrementar tentativas: "
                            + e.getMessage());
        }
    }

    public static synchronized JSONArray ler(Context ctx) {

        try {
            File f = ficheiro(ctx);

            if (!f.exists()) {
                return new JSONArray();
            }

            int tamanho = (int) f.length();
            byte[] dados = new byte[tamanho];

            FileInputStream fis = new FileInputStream(f);

            try {
                fis.read(dados);
            } finally {
                fis.close();
            }

            String conteudo =
                    new String(
                            dados,
                            StandardCharsets.UTF_8
                    ).trim();

            if (conteudo.isEmpty()) {
                return new JSONArray();
            }

            return new JSONArray(conteudo);

        } catch (Exception e) {
            return new JSONArray();
        }
    }

    public static synchronized void remover(
            Context ctx,
            String texto) {

        try {
            JSONArray fila = ler(ctx);
            JSONArray nova = new JSONArray();

            for (int i = 0; i < fila.length(); i++) {

                JSONObject item =
                        fila.optJSONObject(i);

                if (item != null &&
                        !texto.equals(
                                item.optString("texto"))) {

                    nova.put(item);
                }
            }

            gravar(ctx, nova);

        } catch (Exception e) {
            Log.e(TAG,
                    "Falha ao remover da fila: "
                            + e.getMessage());
        }
    }

    public static synchronized int tamanho(Context ctx) {
        JSONArray fila = ler(ctx);
        return fila.length();
    }
}