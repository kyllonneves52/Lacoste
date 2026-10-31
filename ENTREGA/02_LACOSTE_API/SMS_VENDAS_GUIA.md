# Integração LACOSTE SMS + sistemaVendas

Esta atualização preserva as rotas e tabelas existentes. Adiciona:
- `POST /api/autosistema/sms/pedido`
- `GET /api/autosistema/sms/status?pedidoId=...`
- Página de guia `https://TEU-HOST/sms`

## Fluxo
1. O SMS app lê o comprovativo enviado pelo cliente e extrai ID + valor; número de destino pode estar na última linha ou ser enviado numa segunda mensagem.
2. O app mapeia o valor para MB pela tabela configurada, a qual deve coincidir com os pacotes ativos do `sistemaVendas.js`.
3. O servidor autentica `x-android-id` + `x-app-token`, exige o grupo associado e LC Verification ativo, bloqueia referência duplicada e cria `orders` como `waiting_verification`.
4. O servidor compara a referência e o valor com `verification_inbox` ou notifica LC Verification para verificar em 30 segundos.
5. Só após validação o pedido passa para `pending` e o dispositivo Lacoste Auto recebe a notificação/usa a fila e USSD já existentes.
6. O app consulta o estado e envia a mensagem final ao cliente. A mensagem final termina com o número de destino.

## Deploy
Copia os novos ficheiros de `lib/routes/autosistema/sms/`, o ficheiro atualizado `api/[...path].js`, `server.js`, e `sms.html` para o projeto HyzeCloud que já contém as variáveis Turso/Firebase. Não substituas `.env` nem alteres as credenciais. Reinicia o serviço e verifica `GET /sms`.

## Notas de produção
- O banco precisa das tabelas/colunas já usadas por LC Verification: `verification_devices`, `payment_verification_configs`, `payment_verifications`, `verification_inbox`, e das colunas de pedidos compostos `parent_order_id`, `part_number`, `total_parts`.
- O pedido SMS só escolhe grupos que já estejam associados ao Android ID do dispositivo de MB.
- Se um Android ID tiver vários grupos, o ID do grupo precisa ser preenchido no app.
- Nunca desativar a verificação do pagamento em produção.

## Pacotes e regras herdadas do sistemaVendas
O `sistemaVendas.js` de referência usa o mapeamento de valor para pacote definido por grupo no ficheiro `data/pacotes_rcbd.json`, aceita comprovativo com referência e valor, evita reutilizar referências, envia mensagens de pagamento recebido/concluído/falha e divide transferências acima de 10.240 MB. Como esse JSON é local ao bot e não existe uma rota pública que o exponha, o app SMS tem uma tabela de pacotes editável dentro do app. Os valores nela devem ser copiados dos pacotes ativos do grupo; o exemplo inicial vem do formato de `.addpacote` presente no `sistemaVendas.js`.

## Segredos
Os modelos `.env.example` e `.env.hyze.template` neste ZIP foram substituídos por placeholders. Não substituas nem publiques o `.env` real do servidor.
