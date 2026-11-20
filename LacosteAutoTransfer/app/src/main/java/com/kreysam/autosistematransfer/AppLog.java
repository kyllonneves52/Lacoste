package com.kreysam.autosistematransfer;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class AppLog {

    private static final String TAG = "AppLog";

    private static final SimpleDateFormat FORMATO_HORA =
            new SimpleDateFormat("HH:mm:ss", Locale.getDefault());

    private static final String NOME_FICHEIRO =
            "autosistema_transfer_log.txt";

    private static final long TAMANHO_MAX_BYTES =
            300000L;

    public static synchronized void add(
            Context ctx,
            String tag,
            String msg
    ) {

        Log.d(tag, msg);

        try {

            File f = ficheiro(ctx);

            String linha =
                    FORMATO_HORA.format(new Date()) +
                    " [" +
                    tag +
                    "] " +
                    msg +
                    "\n";

            try (FileWriter fw = new FileWriter(f, true)) {
                fw.write(linha);
            }

            cortarSeNecessario(f);

        } catch (Exception e) {

            Log.e(
                    TAG,
                    "Falha ao escrever log: " +
                    e.getMessage(),
                    e
            );
        }
    }

    public static synchronized String ler(Context ctx) {

        try {

            File f = ficheiro(ctx);

            if (!f.exists()) {
                return "(sem registos ainda)";
            }

            long tamanho = f.length();

            if (tamanho <= 0) {
                return "(sem registos ainda)";
            }

            if (tamanho > Integer.MAX_VALUE) {
                return "Log demasiado grande para leitura.";
            }

            byte[] dados =
                    new byte[(int) tamanho];

            try (FileInputStream fis =
                         new FileInputStream(f)) {

                int total = 0;
                int lidos;

                while (
                        total < dados.length &&
                        (lidos = fis.read(
                                dados,
                                total,
                                dados.length - total
                        )) != -1
                ) {

                    total += lidos;
                }

                return new String(
                        dados,
                        0,
                        total,
                        StandardCharsets.UTF_8
                );
            }

        } catch (Exception e) {

            return "Erro ao ler log: " +
                    e.getMessage();
        }
    }

    public static synchronized void limpar(
            Context ctx
    ) {

        try {

            File f = ficheiro(ctx);

            if (f.exists() && !f.delete()) {

                Log.w(
                        TAG,
                        "Não foi possível apagar o log."
                );
            }

        } catch (Exception e) {

            Log.e(
                    TAG,
                    "Erro ao limpar log: " +
                    e.getMessage(),
                    e
            );
        }
    }

    private static File ficheiro(
            Context ctx
    ) {

        return new File(
                ctx.getApplicationContext()
                        .getFilesDir(),
                NOME_FICHEIRO
        );
    }

    private static void cortarSeNecessario(
            File f
    ) {

        try {

            if (!f.exists() ||
                    f.length() <= TAMANHO_MAX_BYTES) {

                return;
            }

            long cortarAte =
                    f.length() - 150000L;

            if (cortarAte < 0) {
                return;
            }

            byte[] resto;

            try (RandomAccessFile raf =
                         new RandomAccessFile(f, "r")) {

                raf.seek(cortarAte);

                resto =
                        new byte[
                                (int) (
                                        f.length() -
                                        cortarAte
                                )
                        ];

                raf.readFully(resto);
            }

            try (FileOutputStream fos =
                         new FileOutputStream(f, false)) {

                fos.write(resto);
            }

        } catch (Exception e) {

            Log.e(
                    TAG,
                    "Erro ao cortar log: " +
                    e.getMessage(),
                    e
            );
        }
    }
}