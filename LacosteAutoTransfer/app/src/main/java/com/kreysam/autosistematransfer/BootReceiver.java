package com.kreysam.autosistematransfer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(
            Context context,
            Intent intent
    ) {

        if (intent == null) {
            return;
        }

        String action = intent.getAction();

        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) &&
                !Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)) {
            return;
        }

        Intent servico =
                new Intent(
                        context,
                        MonitorService.class
                );

        if (Build.VERSION.SDK_INT >= 26) {

            context.startForegroundService(servico);

        } else {

            context.startService(servico);
        }
    }
}