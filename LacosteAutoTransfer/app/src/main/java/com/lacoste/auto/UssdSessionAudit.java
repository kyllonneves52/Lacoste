package com.lacoste.auto;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** Diagnóstico local de sessões USSD. Não altera respostas nem decisões da transferência. */
public final class UssdSessionAudit {
    private static final String PREFS = "lacoste_ussd_audit";
    private static final String KEY = "events";
    private static final int MAX_EVENTS = 100;

    private UssdSessionAudit() {}

    private static String redact(String text) {
        if (text == null) return "";
        return text.replaceAll("(?<!\\d)(?:258)?8[4-7]\\d{7}(?!\\d)", "[NUMERO_OCULTO]")
                .replaceAll("(?i)(token|senha|password)\\s*[:=]\\s*\\S+", "$1=[OCULTO]");
    }

    private static String classify(String text) {
        String t = text == null ? "" : text.toLowerCase(java.util.Locale.ROOT);
        if (t.contains("transferiste com sucesso") || t.contains("efectuada com sucesso") || t.contains("efetuada com sucesso")) return "RESULTADO_SUCESSO";
        if (t.contains("saldo insuficiente")) return "ERRO_SALDO";
        if (t.contains("limite diario") || t.contains("limite diário")) return "ERRO_LIMITE";
        if (t.contains("codigo mmi invalido") || t.contains("código mmi inválido")) return "ERRO_MMI";
        if (t.contains("numero do recipiente") || t.contains("número do recipiente")) return "CAMPO_DESTINO";
        if (t.contains("quantos megas") || t.contains("saldo de dados")) return "CAMPO_QUANTIDADE_OU_SALDO";
        if (t.contains("transferir megas")) return "MENU_TRANSFERENCIA";
        if (t.contains("servicos de internet") || t.contains("serviços de internet")) return "MENU_INTERNET";
        return "MENU_NAO_CLASSIFICADO";
    }

    public static synchronized void record(Context context, int attempt, String operation, String state, String screenText) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray old;
            try { old = new JSONArray(prefs.getString(KEY, "[]")); }
            catch (Exception ignored) { old = new JSONArray(); }
            JSONArray next = new JSONArray();
            JSONObject event = new JSONObject();
            event.put("at", System.currentTimeMillis());
            event.put("attempt", attempt);
            event.put("operation", operation == null ? "" : operation);
            event.put("state", state == null ? "" : state);
            event.put("classification", classify(screenText));
            event.put("screen", redact(screenText));
            next.put(event);
            for (int i = 0; i < old.length() && i < MAX_EVENTS - 1; i++) {
                JSONObject item = old.optJSONObject(i);
                if (item != null) next.put(item);
            }
            prefs.edit().putString(KEY, next.toString()).apply();
        } catch (Exception ignored) {}
    }

    public static synchronized String exportText(Context context) {
        try {
            JSONArray rows = new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"));
            StringBuilder out = new StringBuilder("LACOSTE AUTO — DIAGNÓSTICO USSD\nEventos recentes: ").append(rows.length()).append("\n\n");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject e = rows.optJSONObject(i);
                if (e == null) continue;
                out.append(new java.text.SimpleDateFormat("dd/MM HH:mm:ss", java.util.Locale.getDefault()).format(new java.util.Date(e.optLong("at"))))
                        .append(" | tentativa=").append(e.optInt("attempt"))
                        .append(" | ").append(e.optString("operation"))
                        .append(" / ").append(e.optString("state"))
                        .append(" | ").append(e.optString("classification"))
                        .append("\n").append(e.optString("screen")).append("\n\n");
            }
            return out.toString();
        } catch (Exception e) {
            return "Não foi possível ler o diagnóstico USSD: " + e.getMessage();
        }
    }

    public static void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).apply();
    }
}
