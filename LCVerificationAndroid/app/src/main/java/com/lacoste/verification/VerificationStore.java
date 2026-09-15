package com.lacoste.verification;
import android.content.*;import org.json.*;
public final class VerificationStore {
 private static final String P="lc_verification"; private VerificationStore(){}
 static SharedPreferences p(Context c){return c.getSharedPreferences(P,0);}
 public static String deviceId(Context c){String x=p(c).getString("device_id","");if(x.isEmpty()){x=android.provider.Settings.Secure.getString(c.getContentResolver(),"android_id");if(x==null||x.isEmpty())x="LCV-"+java.util.UUID.randomUUID();p(c).edit().putString("device_id",x).apply();}return x;}
 public static void setToken(Context c,String x){p(c).edit().putString("token",x==null?"":x).apply();} public static String token(Context c){return p(c).getString("token","");}
 public static void setLicense(Context c,String x){p(c).edit().putString("license",x==null?"":x).apply();} public static String license(Context c){return p(c).getString("license","");}
 public static void setRequestId(Context c,String x){p(c).edit().putString("request",x==null?"":x).apply();} public static String requestId(Context c){return p(c).getString("request","");}
 public static void setExpires(Context c,String x){p(c).edit().putString("expires",x==null?"":x).apply();} public static String expires(Context c){return p(c).getString("expires","");}
 public static void setPending(Context c,String id,String paymentId,double value,String provider,long deadline){try{JSONObject o=new JSONObject();o.put("pedidoId",id);o.put("paymentId",paymentId);o.put("value",value);o.put("provider",provider);o.put("deadline",deadline);p(c).edit().putString("pending",o.toString()).apply();}catch(Exception ignored){}}
 public static JSONObject pending(Context c){try{String x=p(c).getString("pending","");return x.isEmpty()?null:new JSONObject(x);}catch(Exception e){return null;}}
 public static void clearPending(Context c){p(c).edit().remove("pending").apply();}
}
