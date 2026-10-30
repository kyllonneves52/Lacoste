package com.lacoste.verification;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public final class ProfitChartView extends View {
    private static final int GREEN = 0xFF22C55E;
    private static final int MUTED = 0xFF8193A8;
    private static final int GRID = 0xFF26364A;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final List<String> labels = new ArrayList<>();
    private final List<Float> values = new ArrayList<>();

    public ProfitChartView(Context context) {
        super(context);
        setMinimumHeight((int)(190 * getResources().getDisplayMetrics().density));
    }

    public void setData(JSONArray data) {
        labels.clear(); values.clear();
        if (data != null) {
            for (int i=0;i<data.length();i++) {
                JSONObject o=data.optJSONObject(i);
                if(o==null) continue;
                String day=o.optString("day", "");
                labels.add(day.length()>=10?day.substring(5):day);
                values.add((float)o.optDouble("total",0));
            }
        }
        invalidate();
    }

    @Override protected void onDraw(Canvas c) {
        super.onDraw(c);
        float density=getResources().getDisplayMetrics().density;
        float left=12*density, right=getWidth()-12*density, top=18*density, bottom=getHeight()-28*density;
        paint.setColor(GRID); paint.setStrokeWidth(1*density);
        for(int i=0;i<4;i++){float y=top+(bottom-top)*i/3f;c.drawLine(left,y,right,y,paint);}
        if(values.isEmpty()){
            paint.setColor(MUTED);paint.setTextSize(12*density);c.drawText("As vendas concluídas aparecerão aqui",left,top+42*density,paint);return;
        }
        float max=1f;for(float v:values)max=Math.max(max,v);
        float slot=(right-left)/Math.max(1,values.size());
        for(int i=0;i<values.size();i++){
            float v=values.get(i), h=(bottom-top)*(v/max);
            float x=left+i*slot+slot*.20f;
            RectF r=new RectF(x,bottom-h,x+slot*.60f,bottom);
            paint.setColor(GREEN);c.drawRoundRect(r,5*density,5*density,paint);
            if(values.size()<=10 || i%4==0 || i==values.size()-1){
                paint.setColor(MUTED);paint.setTextSize(9*density);
                c.drawText(labels.get(i),x,bottom+16*density,paint);
            }
        }
    }
}
