package com.lacoste.auto;

import android.content.Context;
import android.os.Build;
import android.provider.Settings;
import org.json.JSONObject;
import java.util.Locale;

public class LicenseManager {
    private static volatile String ultimoMotivo = "Chave inválida";

    public interface Callback { void onResultado(boolean ok, String mensagem); }

    public static String getUltimoMotivo() { return ultimoMotivo; }

    public static boolean estaAtivado(Context context) {
        if (!LicenseStorage.existe(context)) return false;
        try {
            String dados = LicenseStorage.ler(context);
            if (dados == null) return false;
            String androidId = Settings.Secure.getString(context.getContentResolver(), "android_id");
            String guardado = pegar(dados, "ANDROID_ID");
            if (guardado.isEmpty() || !androidId.equals(guardado)) return false;
            long fim = Long.parseLong(pegar(dados, "DATA_FINAL"));
            return System.currentTimeMillis() < fim;
        } catch (Exception e) { return false; }
    }

    public static void solicitar(final Context context, final String chave, final Callback cb) {
        new Thread(() -> {
            try {
                String base = Prefs.getUrlPainel(context); if (base.isEmpty() || base.contains("SEU-LINK-VERCEL-AQUI")) { fail(context, cb, "Configure o link da Vercel no app."); return; }
                JSONObject b = new JSONObject();
                b.put("licenseKey", chave.trim().toUpperCase(Locale.ROOT));
                b.put("androidId", androidId(context));
                b.put("model", Build.MANUFACTURER + " " + Build.MODEL);
                JSONObject r = post(base + "/api/licenca/request", b);
                if (r == null) { fail(context, cb, "Sem resposta do servidor."); return; }
                boolean ok = r.optBoolean("ok", false);
                if (!ok) { fail(context, cb, r.optString("message", "Não foi possível enviar o pedido.")); return; }
                String status = r.optString("status", "pending");
                String rid = r.optString("requestId", "");
                if (!rid.isEmpty()) Prefs.setLicenseRequestId(context, rid);
                if ("approved".equals(status)) {
                    salvarAprovacao(context, chave, r);
                    ultimoMotivo = "Licença aprovada.";
                    cb.onResultado(true, "Licença aprovada.");
                } else {
                    ultimoMotivo = "Pedido enviado para análise.";
                    cb.onResultado(true, "Pedido enviado para análise. ID: " + rid);
                }
            } catch (Exception e) { fail(context, cb, "Erro de rede: " + e.getMessage()); }
        }).start();
    }

    public static void verificarOnline(final Context context, final Callback cb) {
        new Thread(() -> {
            try {
                String base = Prefs.getUrlPainel(context);
                String aid = androidId(context);
                String rid = Prefs.getLicenseRequestId(context);
                String u = base + "/api/licenca/status?androidId=" + java.net.URLEncoder.encode(aid,"UTF-8") + (rid.isEmpty()?"":"&requestId="+java.net.URLEncoder.encode(rid,"UTF-8"));
                JSONObject r = get(u);
                if (r == null) { if(cb!=null) cb.onResultado(false,"Sem resposta do servidor."); return; }
                String status=r.optString("status","not_registered");
                if ("approved".equals(status) && r.has("expiresAt")) {
                    JSONObject a=new JSONObject(); a.put("expiresAt",r.optString("expiresAt")); a.put("deviceToken",r.optString("deviceToken",Prefs.getToken(context))); a.put("requestId",r.optString("requestId",rid)); a.put("slot",r.optInt("slot",Prefs.getDeviceSlot(context)));
                    salvarAprovacao(context, pegar(LicenseStorage.ler(context),"CHAVE"), a);
                    if(cb!=null) cb.onResultado(true,"Licença ativa.");
                } else if ("expired".equals(status) || "rejected".equals(status)) {
                    ultimoMotivo = "Licença " + status + ".";
                    if(cb!=null) cb.onResultado(false,ultimoMotivo);
                } else if(cb!=null) cb.onResultado(false,"Estado: "+status);
            } catch(Exception e){ if(cb!=null) cb.onResultado(false,"Erro: "+e.getMessage()); }
        }).start();
    }

    private static void salvarAprovacao(Context c,String chave,JSONObject r)throws Exception{
        String iso=r.optString("expiresAt","");
        long fim=new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX",java.util.Locale.US).parse(iso).getTime();
        long inicio=System.currentTimeMillis();
        String aid=androidId(c); String token=r.optString("deviceToken","");
        if(!token.isEmpty()) Prefs.setToken(c,token);
        String rid=r.optString("requestId",Prefs.getLicenseRequestId(c)); Prefs.setLicenseRequestId(c,rid);
        if (r.has("slot")) Prefs.setDeviceSlot(c, r.optInt("slot", 0));
        Prefs.setDeviceExpiresAt(c, iso);
        LicenseStorage.salvar(c,"CHAVE="+chave+"\nANDROID_ID="+aid+"\nDATA_INICIO="+inicio+"\nDATA_FINAL="+fim+"\nPEDIDO_ID="+rid+"\nDEVICE_SLOT="+Prefs.getDeviceSlot(c)+"\nSERVER="+Prefs.getUrlPainel(c));
    }
    private static String androidId(Context c){String x=Settings.Secure.getString(c.getContentResolver(),"android_id");return x==null?"desconhecido":x;}
    private static void fail(Context c,Callback cb,String m){ultimoMotivo=m;if(cb!=null)cb.onResultado(false,m);}
    private static JSONObject post(String u,JSONObject b)throws Exception{return request(u,"POST",b);}
    private static JSONObject get(String u)throws Exception{return request(u,"GET",null);}
    private static JSONObject request(String us,String method,JSONObject b)throws Exception{java.net.HttpURLConnection c=(java.net.HttpURLConnection)new java.net.URL(us).openConnection();c.setRequestMethod(method);c.setConnectTimeout(15000);c.setReadTimeout(15000);c.setRequestProperty("Content-Type","application/json");if(b!=null){c.setDoOutput(true);try(java.io.OutputStream o=c.getOutputStream()){o.write(b.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}}java.io.InputStream in=c.getResponseCode()>=400?c.getErrorStream():c.getInputStream();if(in==null)return null;java.io.BufferedReader br=new java.io.BufferedReader(new java.io.InputStreamReader(in));StringBuilder s=new StringBuilder();String l;while((l=br.readLine())!=null)s.append(l);c.disconnect();return new JSONObject(s.toString());}
    public static long millisRestantes(Context c){try{String d=LicenseStorage.ler(c);return Math.max(0,Long.parseLong(pegar(d,"DATA_FINAL"))-System.currentTimeMillis());}catch(Exception e){return 0;}}
    public static String tempoRestante(Context c){long r=millisRestantes(c);if(r<=0)return "EXPIRADO";return (r/86400000L)+" dias "+((r%86400000L)/3600000L)+" horas "+((r%3600000L)/60000L)+" minutos";}
    private static String pegar(String t,String k){if(t==null)return "";for(String l:t.split("\\n"))if(l.startsWith(k+"="))return l.substring((k+"=").length()).trim();return "";}
}
