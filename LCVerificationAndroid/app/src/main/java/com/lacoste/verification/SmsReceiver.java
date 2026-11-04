package com.lacoste.verification;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

public class SmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        try {
            SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
            StringBuilder text = new StringBuilder();
            String sender = "";
            for (SmsMessage part : parts) {
                if (part == null) continue;
                if (sender.isEmpty()) {
                    String address = part.getOriginatingAddress();
                    if (address == null || address.trim().isEmpty()) address = part.getDisplayOriginatingAddress();
                    if (address != null) sender = address.trim();
                }
                String body = part.getMessageBody();
                if (body != null) text.append(body);
            }
            if (text.length() > 0) VerificationProcessor.process(context, text.toString(), sender);
        } catch (Exception e) {
            android.util.Log.e("LCVerificationSms", "Falha ao processar SMS recebido", e);
        }
    }
}
