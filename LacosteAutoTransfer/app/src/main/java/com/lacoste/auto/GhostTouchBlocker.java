package com.lacoste.auto;

import android.content.Context;
import android.os.Build;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;

/* JADX INFO: loaded from: classes3.dex */
public class GhostTouchBlocker {
    private static final String TAG = "GhostTouchBlocker";
    private static boolean activo = false;
    private static View btnView;
    private static View overlayView;
    private static WindowManager windowManager;

    public static boolean isActivo() {
        return activo;
    }

    public static void activar(Context ctx) {
        int type;
        if (activo) {
            return;
        }
        try {
            windowManager = (WindowManager) ctx.getSystemService("window");
            if (Build.VERSION.SDK_INT >= 26) {
                type = 2038;
            } else {
                type = 2002;
            }
            View view = new View(ctx) { // from class: com.lacoste.auto.GhostTouchBlocker.1
                @Override // android.view.View
                public boolean onTouchEvent(MotionEvent e) {
                    return true;
                }
            };
            overlayView = view;
            view.setBackgroundColor(0);
            WindowManager.LayoutParams p = new WindowManager.LayoutParams(-1, -1, type, 776, -3);
            p.gravity = 8388659;
            windowManager.addView(overlayView, p);
            Button btn = new Button(ctx);
            btn.setText("🔒");
            btn.setTextSize(22.0f);
            btn.setBackgroundColor(-856734652);
            btn.setPadding(8, 8, 8, 8);
            btn.setOnClickListener(new View.OnClickListener() { // from class: com.lacoste.auto.GhostTouchBlocker$$ExternalSyntheticLambda0
                @Override // android.view.View.OnClickListener
                public final void onClick(View view2) {
                    GhostTouchBlocker.desactivar();
                }
            });
            WindowManager.LayoutParams bp = new WindowManager.LayoutParams(130, 130, type, 8, -3);
            bp.gravity = 8388661;
            bp.x = 16;
            bp.y = 48;
            windowManager.addView(btn, bp);
            btnView = btn;
            activo = true;
            Log.i(TAG, "Ghost touch blocker ACTIVADO.");
        } catch (Exception e) {
            Log.e(TAG, "Erro ao activar: " + e.getMessage());
        }
    }

    public static void desactivar() {
        WindowManager windowManager2;
        if (!activo || (windowManager2 = windowManager) == null) {
            return;
        }
        try {
            View view = btnView;
            if (view != null) {
                windowManager2.removeView(view);
                btnView = null;
            }
            View view2 = overlayView;
            if (view2 != null) {
                windowManager.removeView(view2);
                overlayView = null;
            }
            activo = false;
            Log.i(TAG, "Ghost touch blocker DESACTIVADO.");
        } catch (Exception e) {
            Log.e(TAG, "Erro ao desactivar: " + e.getMessage());
        }
    }
}
