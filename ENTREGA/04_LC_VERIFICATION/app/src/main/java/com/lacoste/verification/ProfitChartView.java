package com.lacoste.verification;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.View;
import java.util.ArrayList;
import java.util.List;

/** Gráfico de barras simples (lucros / MB) — Canvas nativo, sem libs. */
public class ProfitChartView extends View {
    public static class Bar {
        public final String label;
        public final float value;
        public Bar(String label, float value) { this.label = label; this.value = value; }
    }

    private final List<Bar> bars = new ArrayList<>();
    private final Paint barPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint gridPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint titlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private String title = "Lucros (7 dias)";

    public ProfitChartView(Context c) { super(c); init(); }
    public ProfitChartView(Context c, AttributeSet a) { super(c, a); init(); }

    private void init() {
        barPaint.setColor(0xFF22C55E);
        textPaint.setColor(0xFF94A3B8);
        textPaint.setTextSize(sp(10));
        gridPaint.setColor(0x33FFFFFF);
        gridPaint.setStrokeWidth(1f);
        titlePaint.setColor(0xFFE5E9F0);
        titlePaint.setTextSize(sp(12));
        titlePaint.setFakeBoldText(true);
        setMinimumHeight(dp(160));
    }

    public void setTitle(String t) { title = t == null ? "" : t; invalidate(); }

    public void setData(List<Bar> data) {
        bars.clear();
        if (data != null) bars.addAll(data);
        invalidate();
    }

    public void setSampleWeek() {
        List<Bar> d = new ArrayList<>();
        d.add(new Bar("25", 12));
        d.add(new Bar("26", 20));
        d.add(new Bar("27", 18));
        d.add(new Bar("28", 25));
        d.add(new Bar("29", 30));
        d.add(new Bar("30", 22));
        d.add(new Bar("31", 42));
        setData(d);
    }

    @Override protected void onMeasure(int wSpec, int hSpec) {
        int w = MeasureSpec.getSize(wSpec);
        int h = Math.max(dp(160), MeasureSpec.getSize(hSpec));
        if (MeasureSpec.getMode(hSpec) == MeasureSpec.UNSPECIFIED) h = dp(180);
        setMeasuredDimension(w, h);
    }

    @Override protected void onDraw(Canvas c) {
        super.onDraw(c);
        int w = getWidth(), h = getHeight();
        int padL = dp(8), padR = dp(8), padT = dp(28), padB = dp(28);
        c.drawText(title, padL, dp(18), titlePaint);
        if (bars.isEmpty()) {
            textPaint.setTextAlign(Paint.Align.CENTER);
            c.drawText("Sem dados de lucro ainda", w / 2f, h / 2f, textPaint);
            textPaint.setTextAlign(Paint.Align.LEFT);
            return;
        }
        float max = 1f;
        for (Bar b : bars) if (b.value > max) max = b.value;
        float chartW = w - padL - padR;
        float chartH = h - padT - padB;
        float gap = dp(6);
        float barW = (chartW - gap * (bars.size() + 1)) / bars.size();
        for (int i = 0; i < 4; i++) {
            float y = padT + chartH * i / 3f;
            c.drawLine(padL, y, w - padR, y, gridPaint);
        }
        textPaint.setTextAlign(Paint.Align.CENTER);
        for (int i = 0; i < bars.size(); i++) {
            Bar b = bars.get(i);
            float left = padL + gap + i * (barW + gap);
            float bh = (b.value / max) * chartH;
            float top = padT + chartH - bh;
            RectF r = new RectF(left, top, left + barW, padT + chartH);
            c.drawRoundRect(r, dp(6), dp(6), barPaint);
            c.drawText(b.label, left + barW / 2f, h - dp(10), textPaint);
            if (b.value > 0) {
                textPaint.setColor(0xFF22C55E);
                c.drawText(String.valueOf((int) b.value), left + barW / 2f, top - dp(4), textPaint);
                textPaint.setColor(0xFF94A3B8);
            }
        }
        textPaint.setTextAlign(Paint.Align.LEFT);
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private float sp(int v) { return v * getResources().getDisplayMetrics().scaledDensity; }
}
