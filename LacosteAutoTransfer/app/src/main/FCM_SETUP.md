# Configuração FCM — LACOSTE AUTO

## Android
O app já contém Firebase Messaging e não precisa de `google-services.json` para o código preparado aqui.

No `gradle.properties`, depois de criar o projeto Firebase, preencher:

FIREBASE_API_KEY=...
FIREBASE_APP_ID=...
FIREBASE_PROJECT_ID=...
FIREBASE_MESSAGING_SENDER_ID=...

Esses quatro valores são da configuração do aplicativo Android no Firebase.

## Vercel / API
Criar uma conta de serviço no Firebase/Google Cloud com permissão para enviar mensagens FCM e colocar no projeto Vercel:

FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"

Nunca colocar a chave privada no APK, GitHub ou no `sistemaVendas.js`.

## Fluxo
1. App abre e registra Android ID.
2. App obtém token FCM.
3. API guarda o token no dispositivo.
4. No grupo, admin usa `.idgrupo` e envia o ID ao dono do serviço.
5. O dono associa Grupo → Device no painel.
6. No grupo, o admin usa `.automacao on`.
7. Bot cria pedido com `groupId`.
8. API resolve o dispositivo e guarda `device_android_id`.
9. API envia push FCM para esse dispositivo.
10. App valida Android ID + token + licença.
11. App busca o pedido e executa a transferência.
12. App confirma ou marca falha.

Se FCM ainda não estiver configurado, o sistema não envia push; o vínculo de dispositivo e a segurança por Android ID/token continuam funcionando.
