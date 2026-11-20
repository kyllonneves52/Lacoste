package com.kreysam.autosistematransfer;

import java.util.Locale;

public class SmsFilter {

    private SmsFilter() {
        // Classe utilitária
    }

    public static boolean deveEncaminhar(
            String remetente,
            String texto,
            String numeroExtraConfigurado
    ) {

        // Primeiro: o texto precisa ser uma confirmação válida.
        if (!isConfirmacaoRecebimento(texto)) {
            return false;
        }

        // Se o remetente for M-Pesa/E-Mola, aceita diretamente.
        if (remetenteReconhecido(remetente)) {
            return true;
        }

        // Caso contrário, verifica o número extra configurado.
        if (numeroExtraConfigurado != null
                && !numeroExtraConfigurado.trim().isEmpty()) {

            String extraLimpo =
                    numeroExtraConfigurado.replaceAll("\\D", "");

            String remetenteLimpo =
                    remetente == null
                            ? ""
                            : remetente.replaceAll("\\D", "");

            if (!extraLimpo.isEmpty()
                    && remetenteLimpo.endsWith(extraLimpo)) {
                return true;
            }
        }

        return false;
    }

    public static boolean isConfirmacaoRecebimento(String texto) {

        if (texto == null || texto.trim().isEmpty()) {
            return false;
        }

        String t = texto.toLowerCase(Locale.getDefault());

        // Evita confundir uma mensagem de envio
        // com uma mensagem de recebimento.
        if (t.contains("transferiste")) {
            return false;
        }

        boolean temMT = t.contains("mt");

        /*
         * Formato antigo:
         *
         * "recebeste"
         * +
         * "id da transacao"
         *
         * OU
         *
         * "recebeste"
         * +
         * "confirmado"
         */
        boolean formatoAntigo =
                t.contains("recebeste")
                        && (
                        t.contains("id da transacao")
                                || t.contains("confirmado")
                );

        /*
         * Formato novo:
         *
         * "recebeu"
         * +
         * "id trans"
         */
        boolean formatoNovo =
                t.contains("recebeu")
                        && t.contains("id trans");

        return temMT && (formatoAntigo || formatoNovo);
    }

    public static boolean remetenteReconhecido(String remetente) {

        if (remetente == null) {
            return false;
        }

        String r = remetente.toLowerCase(Locale.getDefault());

        return r.contains("mpesa")
                || r.contains("m-pesa")
                || r.contains("emola")
                || r.contains("e-mola");
    }
}