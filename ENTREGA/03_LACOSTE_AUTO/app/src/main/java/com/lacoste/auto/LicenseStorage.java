package com.lacoste.auto;

import android.content.Context;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

public class LicenseStorage {

    private static final String ARQUIVO = "license.sys";

    private static File getArquivo(Context ctx) {
        // getFilesDir = /data/data/com.lacoste.auto/files - só o app acessa
        File pasta = ctx.getFilesDir();
        return new File(pasta, ARQUIVO);
    }

    public static boolean existe(Context ctx) {
        return getArquivo(ctx).exists();
    }

    public static void salvar(Context ctx, String dados) {
        try {
            FileOutputStream fos = ctx.openFileOutput(ARQUIVO, Context.MODE_PRIVATE);
            fos.write(dados.getBytes(StandardCharsets.UTF_8));
            fos.close();
        } catch (Exception e) {
            e.printStackTrace();
            AppLog.add(ctx, "LicenseStorage", "Erro salvar: " + e.getMessage());
        }
    }

    public static String ler(Context ctx) {
        try {
            FileInputStream fis = ctx.openFileInput(ARQUIVO);
            byte[] dados = new byte[fis.available()];
            fis.read(dados);
            fis.close();
            return new String(dados, StandardCharsets.UTF_8);
        } catch (Exception e) {
            AppLog.add(ctx, "LicenseStorage", "Erro ler: " + e.getMessage());
            return null;
        }
    }
}