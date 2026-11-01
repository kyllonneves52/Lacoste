package com.lacoste.verification;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Gráfico local baseado nos SMS de pagamento realmente reconhecidos pelo processador. */
public final class PaymentTrendView extends View {
    private final Paint p = new Paint(3);
    private JSONArray payments;
    private final float[] totals = new float[7];
    private final String[] labels = new String[7];
    private final SimpleDateFormat day = new SimpleDateFormat("dd/MM", Locale.getDefault());
    private final SimpleDateFormat key = new SimpleDateFormat("yyyyMMdd", Locale.US);
    public PaymentTrendView(Context c, JSONArray data) { super(c); setPayments(data); }
    public void setPayments(JSONArray data) { payments = data == null ? new JSONArray() : data; rebuild(); invalidate(); }
    private void rebuild() {
        java.util.Calendar cal = java.util.Calendar.getInstance();
        for (int i=6;i>=0;i--) { java.util.Calendar d=(java.util.Calendar)cal.clone(); d.add(java.util.Calendar.DAY_OF_YEAR,-i); labels[6-i]=day.format(d.getTime()); String k=key.format(d.getTime()); totals[6-i]=0;
            for(int j=0;j<payments.length();j++){ JSONObject o=payments.optJSONObject(j); if(o!=null && key.format(new Date(o.optLong("at",0))).equals(k)) totals[6-i]+=o.optDouble("value",0); }
        }
    }
    @Override protected void onDraw(Canvas c) {
        super.onDraw(c); float w=getWidth(), h=getHeight(); float left=dp(12), right=w-dp(8), top=dp(20), bottom=h-dp(30); float max=1;
        for(float v:totals) max=Math.max(max,v);
        p.setColor(0xff263b32); p.setStrokeWidth(dp(1)); for(int i=0;i<4;i++){float y=top+(bottom-top)*i/3f;c.drawLine(left,y,right,y,p);}
        p.setColor(0xff19d66b); p.setStyle(Paint.Style.FILL); float slot=(right-left)/7f;
        for(int i=0;i<7;i++){float bh=(bottom-top)*(totals[i]/max); RectF r=new RectF(left+i*slot+dp(5),bottom-bh,left+(i+1)*slot-dp(5),bottom); c.drawRoundRect(r,dp(5),dp(5),p); p.setTextSize(dp(10)); p.setColor(0xffd7e8dd); c.drawText(labels[i],left+i*slot+dp(2),h-dp(8),p); p.setColor(0xff19d66b);}
        p.setColor(0xffd7e8dd); p.setTextSize(dp(11)); c.drawText("MT por dia · últimos 7 dias (SMS reconhecidos)",left,dp(13),p);
    }
    private float dp(float x){return x*getResources().getDisplayMetrics().density;}
}
