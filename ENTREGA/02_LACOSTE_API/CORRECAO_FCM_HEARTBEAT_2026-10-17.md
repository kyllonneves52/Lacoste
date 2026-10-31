# Lacoste Auto API — robustez FCM e heartbeat

Esta atualização mantém os nomes e o fluxo FCM existentes (`NEW_ORDER`, `NEW_PAYMENT_VERIFICATION`) e não apaga tokens FCM da base de dados.

## Alterações
- `lib/push.js`: reutiliza a app Firebase já inicializada; mantém os eventos/data atuais; adiciona TTL de 5 minutos, até 3 tentativas para falhas transitórias e diagnóstico estruturado para tokens ausentes/erros permanentes.
- `lib/routes/autosistema/dispositivo/heartbeat.js`: valida método, Android ID, existência do dispositivo e token do app; atualiza `last_seen` apenas após validação; devolve mensagens explícitas para falhas de autenticação e erros DB.
- Rotas de criação de pedidos: devolvem `pushEnviado` e `pushDetalhe` sem expor o token FCM, facilitando identificar se o servidor tentou enviar e qual erro o Firebase retornou.

## Importante
- Não foi possível testar uma entrega real para o Android `c0d6cae52a7fc248` sem os registos da execução do APK e as credenciais ativas do Firebase.
- `FCM: CONFIGURADO` significa que existe token guardado; não prova que o token ainda seja válido nem que o app tenha recebido a notificação.
- Se a API devolver `Token do dispositivo ausente no heartbeat` ou `Token do dispositivo inválido`, é necessário corrigir o pedido de heartbeat no APK para enviar `X-App-Token` ou `deviceToken` correto. Não se removeu autenticação para esconder o erro.
- Se `pushDetalhe.invalidToken` for `true`, abrir o Lacoste Auto no aparelho e forçar o registo/atualização do token FCM; o servidor não apaga o token automaticamente.

## Testes
Executar `node --check` nos ficheiros JavaScript alterados. A confirmação final requer teste real no HyzeCloud e no dispositivo afetado.
