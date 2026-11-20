package com.kreysam.autosistematransfer;

import android.content.Context;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;

public class TtsHelper {

    private static final String TAG = "TtsHelper";

    private static TextToSpeech tts;
    private static boolean pronto = false;

    private static final Random random = new Random();

    private static final String[] UNIDADES = {
            "zero",
            "um",
            "dois",
            "tres",
            "quatro",
            "cinco",
            "seis",
            "sete",
            "oito",
            "nove"
    };

    private static final String[] DEZ_A_DEZANOVE = {
            "dez",
            "onze",
            "doze",
            "treze",
            "catorze",
            "quinze",
            "dezasseis",
            "dezassete",
            "dezoito",
            "dezanove"
    };

    private static final String[] DEZENAS = {
            "",
            "",
            "vinte",
            "trinta",
            "quarenta",
            "cinquenta",
            "sessenta",
            "setenta",
            "oitenta",
            "noventa"
    };

    private static final String[] CENTENAS = {
            "",
            "cem",
            "duzentos",
            "trezentos",
            "quatrocentos",
            "quinhentos",
            "seiscentos",
            "setecentos",
            "oitocentos",
            "novecentos"
    };

    /**
     * Inicializa o TextToSpeech.
     */
    public static synchronized void iniciar(Context context) {

        if (context == null) {
            Log.w(TAG, "Context nulo. Não foi possível iniciar TTS.");
            return;
        }

        if (tts != null) {
            return;
        }

        pronto = false;

        final Context appContext = context.getApplicationContext();

        tts = new TextToSpeech(
                appContext,
                new TextToSpeech.OnInitListener() {
                    @Override
                    public void onInit(int status) {

                        if (status != TextToSpeech.SUCCESS) {
                            pronto = false;

                            Log.w(
                                    TAG,
                                    "TTS falhou ao iniciar. status=" + status
                            );

                            return;
                        }

                        try {

                            int resultado = tts.setLanguage(
                                    new Locale("pt", "PT")
                            );

                            if (resultado == TextToSpeech.LANG_MISSING_DATA
                                    || resultado == TextToSpeech.LANG_NOT_SUPPORTED) {

                                Log.w(
                                        TAG,
                                        "Português de Portugal não disponível. Tentando idioma padrão."
                                );

                                resultado = tts.setLanguage(
                                        Locale.getDefault()
                                );
                            }

                            if (resultado == TextToSpeech.LANG_MISSING_DATA
                                    || resultado == TextToSpeech.LANG_NOT_SUPPORTED) {

                                pronto = false;

                                Log.w(
                                        TAG,
                                        "Nenhum idioma compatível disponível para TTS."
                                );

                                return;
                            }

                            pronto = true;

                            Log.i(
                                    TAG,
                                    "TTS pronto."
                            );

                        } catch (Exception e) {

                            pronto = false;

                            Log.e(
                                    TAG,
                                    "Erro ao configurar TTS.",
                                    e
                            );
                        }
                    }
                }
        );
    }

    /**
     * Faz o aparelho falar o texto.
     */
    public static synchronized void falar(String texto) {

        if (texto == null || texto.trim().isEmpty()) {
            return;
        }

        if (tts == null || !pronto) {
            Log.w(
                    TAG,
                    "TTS ainda não está pronto."
            );
            return;
        }

        try {

            if (android.os.Build.VERSION.SDK_INT >= 21) {

                Bundle parametros = new Bundle();

                tts.speak(
                        texto,
                        TextToSpeech.QUEUE_FLUSH,
                        parametros,
                        "autosistema_" + System.currentTimeMillis()
                );

            } else {

                tts.speak(
                        texto,
                        TextToSpeech.QUEUE_FLUSH,
                        null
                );
            }

        } catch (Exception e) {

            Log.e(
                    TAG,
                    "Falha ao falar.",
                    e
            );
        }
    }

    /**
     * Para a fala atual.
     */
    public static synchronized void parar() {

        try {

            if (tts != null) {
                tts.stop();
            }

        } catch (Exception e) {

            Log.w(
                    TAG,
                    "Erro ao parar TTS: " + e.getMessage()
            );
        }
    }

    /**
     * Libera o TextToSpeech.
     */
    public static synchronized void destruir() {

        try {

            if (tts != null) {

                tts.stop();
                tts.shutdown();
            }

        } catch (Exception e) {

            Log.w(
                    TAG,
                    "Erro ao destruir TTS: " + e.getMessage()
            );

        } finally {

            tts = null;
            pronto = false;
        }
    }

    /**
     * Verifica se o TTS está pronto.
     */
    public static synchronized boolean estaPronto() {
        return tts != null && pronto;
    }

    /**
     * Converte um número de telefone em texto para fala.
     *
     * Exemplo:
     * 841234567
     *
     * vira algo como:
     * oito quatro, um dois três, quatro cinco, seis sete
     */
    public static String numeroTelefonePorExtenso(String digitos) {

        if (digitos == null || digitos.isEmpty()) {
            return "";
        }

        StringBuilder frase = new StringBuilder();

        /*
         * Remove caracteres que não sejam números.
         */
        StringBuilder somenteNumeros = new StringBuilder();

        for (int i = 0; i < digitos.length(); i++) {

            char c = digitos.charAt(i);

            if (c >= '0' && c <= '9') {
                somenteNumeros.append(c);
            }
        }

        digitos = somenteNumeros.toString();

        if (digitos.isEmpty()) {
            return "";
        }

        /*
         * Os dois primeiros dígitos são falados
         * individualmente.
         */
        int prefixoTamanho = Math.min(2, digitos.length());

        for (int i = 0; i < prefixoTamanho; i++) {

            if (frase.length() > 0) {
                frase.append(", ");
            }

            int numero = digitos.charAt(i) - '0';

            frase.append(
                    UNIDADES[numero]
            );
        }

        /*
         * O restante é dividido em grupos pequenos
         * para deixar a fala mais natural.
         */
        if (digitos.length() > 2) {

            String resto = digitos.substring(2);

            List<String> blocos =
                    particionarAleatorio(resto.length());

            int posicao = 0;

            for (String bloco : blocos) {

                int tamanho = bloco.length();

                if (posicao + tamanho > resto.length()) {
                    tamanho = resto.length() - posicao;
                }

                if (tamanho <= 0) {
                    break;
                }

                String grupo =
                        resto.substring(
                                posicao,
                                posicao + tamanho
                        );

                posicao += tamanho;

                String extenso =
                        grupoPorExtenso(grupo);

                if (!extenso.isEmpty()) {
                    frase.append(", ");
                    frase.append(extenso);
                }
            }
        }

        return frase.toString();
    }

    /**
     * Divide os dígitos em blocos de 1 a 3 caracteres.
     */
    private static List<String> particionarAleatorio(int totalDigitos) {

        List<String> blocos = new ArrayList<>();

        int restante = totalDigitos;

        while (restante > 0) {

            int max =
                    Math.min(3, restante);

            int tamanho =
                    random.nextInt(max) + 1;

            /*
             * Evita deixar apenas um dígito
             * isolado no final quando possível.
             */
            if (restante - tamanho == 1
                    && tamanho < max) {

                tamanho++;
            }

            blocos.add(
                    repete("X", tamanho)
            );

            restante -= tamanho;
        }

        return blocos;
    }

    private static String repete(
            String texto,
            int quantidade
    ) {

        StringBuilder sb =
                new StringBuilder();

        for (int i = 0; i < quantidade; i++) {
            sb.append(texto);
        }

        return sb.toString();
    }

    /**
     * Converte um grupo de 1 a 3 dígitos para texto.
     */
    private static String grupoPorExtenso(String grupo) {

        if (grupo == null || grupo.isEmpty()) {
            return "";
        }

        /*
         * Garante que o grupo possui apenas números.
         */
        for (int i = 0; i < grupo.length(); i++) {

            char c = grupo.charAt(i);

            if (c < '0' || c > '9') {
                return grupo;
            }
        }

        try {

            int numero =
                    Integer.parseInt(grupo);

            switch (grupo.length()) {

                case 1:

                    return UNIDADES[numero];

                case 2:

                    /*
                     * Exemplo:
                     * 05 -> zero cinco
                     */
                    if (grupo.charAt(0) == '0') {

                        return UNIDADES[0]
                                + " "
                                + UNIDADES[
                                grupo.charAt(1) - '0'
                        ];
                    }

                    return numeroExtenso2(numero);

                case 3:

                    /*
                     * Exemplo:
                     * 005 -> zero cinco
                     */
                    if (grupo.charAt(0) == '0') {

                        String doisDigitos =
                                grupo.substring(1);

                        return UNIDADES[0]
                                + " "
                                + grupoPorExtenso(
                                doisDigitos
                        );
                    }

                    return numeroExtenso3(numero);

                default:

                    return grupo;
            }

        } catch (Exception e) {

            Log.w(
                    TAG,
                    "Erro ao converter grupo: " + grupo
            );

            return grupo;
        }
    }

    /**
     * Converte números de 0 a 99.
     */
    private static String numeroExtenso2(int numero) {

        if (numero < 0 || numero > 99) {
            return String.valueOf(numero);
        }

        if (numero < 10) {
            return UNIDADES[numero];
        }

        if (numero < 20) {
            return DEZ_A_DEZANOVE[
                    numero - 10
            ];
        }

        int dezena =
                numero / 10;

        int unidade =
                numero % 10;

        if (unidade == 0) {
            return DEZENAS[dezena];
        }

        return DEZENAS[dezena]
                + " e "
                + UNIDADES[unidade];
    }

    /**
     * Converte números de 0 a 999.
     */
    private static String numeroExtenso3(int numero) {

        if (numero < 0 || numero > 999) {
            return String.valueOf(numero);
        }

        if (numero < 100) {
            return numeroExtenso2(numero);
        }

        int centena =
                numero / 100;

        int resto =
                numero % 100;

        String base;

        if (centena == 1) {
            base = "cem";
        } else {
            base = CENTENAS[centena];
        }

        if (resto == 0) {
            return base;
        }

        return base
                + " e "
                + numeroExtenso2(resto);
    }
}