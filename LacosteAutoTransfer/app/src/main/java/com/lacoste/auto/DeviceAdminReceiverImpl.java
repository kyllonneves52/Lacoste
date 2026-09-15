package com.lacoste.auto;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

/* JADX INFO: loaded from: classes3.dex */
public class DeviceAdminReceiverImpl extends DeviceAdminReceiver {
    @Override // android.app.admin.DeviceAdminReceiver
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Toast.makeText(context, "Autosistema Transfer: administrador ativado", 0).show();
    }

    @Override // android.app.admin.DeviceAdminReceiver
    public void onDisabled(Context context, Intent intent) {
        super.onDisabled(context, intent);
        Toast.makeText(context, "Autosistema Transfer: administrador desativado", 0).show();
    }
}
