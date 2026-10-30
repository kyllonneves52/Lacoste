package com.lacoste.auto;

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
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final List<String> labels=new ArrayList<>();
    private final List<Float> values=new ArrayList<>();
    public ProfitChartView(Context c){super(c);setMinimumHeight((int)(150*c.getResources().getDisplayMetrics().density));}
    public void setData(JSONArray data){labels.clear();values.clear();if(data!=null)for(int i=0;i<data.length();i++){JSONObject o=data.optJSONObject(i);if(o==null)continue;String d=o.optString("day","");labels.add(d.length()>=10?d.substring(5):d);values.add((float)o.optDouble("total",0));}invalidate();}
    @Override protected void onDraw(Canvas c){super.onDraw(c);float den=getResources().getDisplayMetrics().density,l=10*den,r=getWidth()-10*den,t=10*den,b=getHeight()-22*den;paint.setColor(0xFF26364A);for(int i=0;i<3;i++){float y=t+(b-t)*i/2f;c.drawLine(l,y,r,y,paint);}if(values.isEmpty()){paint.setColor(0xFF94A3B8);paint.setTextSize(11*den);c.drawText("Sem lucros registados ainda",l,t+35*den,paint);return;}float max=1;for(float v:values)max=Math.max(max,v);float slot=(r-l)/values.size();for(int i=0;i<values.size();i++){float h=(b-t)*values.get(i)/max,x=l+i*slot+slot*.18f;paint.setColor(0xFF22C55E);c.drawRoundRect(new RectF(x,b-h,x+slot*.64f,b),4*den,4*den,paint);if(values.size()<=8||i%5==0||i==values.size()-1){paint.setColor(0xFF94A3B8);paint.setTextSize(8*den);c.drawText(labels.get(i),x,b+13*den,paint);}}}
}
