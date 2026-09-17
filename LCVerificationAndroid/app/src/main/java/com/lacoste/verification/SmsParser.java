package com.lacoste.verification;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parser de SMS de RECEBIMENTO (dinheiro a entrar).
 * Não usa comprovativo de envio (Transferiste).
 *
 * M-Pesa / Vodacom MZ (receber):
 *   Confirmado CI24H3X8Y9.
 *   Recebeste 150.00MT de JOAO SILVA 841234567.
 *
 * E-Mola / Movitel (receber):
 *   Recebeste 100.00 MT de MARIA.
 *   ID da transacao CI24.H3.X8Y9.
 */
public final class SmsParser {

    private static final Pattern P_EMOLA_ID = Pattern.compile(
            "ID\\s+da\\s+transa(?:c|ç)[aã]o\\s*[:#.-]?\\s*([A-Z0-9.]+)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern P_VODA_ID = Pattern.compile(
            "Confirmado\\s+([A-Z0-9.]+)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern P_RECEBEU = Pattern.compile(
            "\\b(recebeste|recebeu|recebido|recebesteu|you have received)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern P_ENVIO = Pattern.compile(
            "\\btransferiste\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern P_VALOR_RECEBEU = Pattern.compile(
            "\\b(?:recebeste|recebeu|recebido|you have received)\\b[^\\d]{0,80}([0-9]+(?:[.,][0-9]+)?)\\s*MT",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern P_VALOR_ANTES = Pattern.compile(
            "([0-9]+(?:[.,][0-9]+)?)\\s*MT[^\\n]{0,80}\\b(?:recebeste|recebeu|recebido)\\b",
            Pattern.CASE_INSENSITIVE);

    private SmsParser() {}

    public static boolean isIncoming(String t) {
        if (t == null || t.trim().isEmpty()) return false;
        if (!P_RECEBEU.matcher(t).find()) return false;
        return !P_ENVIO.matcher(t).find() || P_RECEBEU.matcher(t).find();
    }

    public static String provider(String t) {
        if (!isIncoming(t)) return null;
        if (P_VODA_ID.matcher(t).find()) return "vodacom";
        if (P_EMOLA_ID.matcher(t).find()) return "emola";
        String low = t.toLowerCase();
        if (low.contains("m-pesa") || low.contains("mpesa") || low.contains("vodacom")) return "vodacom";
        if (low.contains("e-mola") || low.contains("emola") || low.contains("movitel")) return "emola";
        return null;
    }

    public static String id(String t) {
        if (t == null) return "";
        Matcher m = P_EMOLA_ID.matcher(t);
        if (m.find()) return clean(m.group(1));
        m = P_VODA_ID.matcher(t);
        return m.find() ? clean(m.group(1)) : "";
    }

    public static String normalizeId(String id) {
        return id == null ? "" : id.replace(".", "").trim();
    }

    public static double value(String t) {
        if (t == null) return -1;
        Matcher m = P_VALOR_RECEBEU.matcher(t);
        if (!m.find()) m = P_VALOR_ANTES.matcher(t);
        if (!m.find()) return -1;
        try {
            return Double.parseDouble(m.group(1).replace(',', '.'));
        } catch (Exception e) {
            return -1;
        }
    }

    private static String clean(String s) {
        if (s == null) return "";
        return s.replaceAll("[.]$", "").trim();
    }
}
