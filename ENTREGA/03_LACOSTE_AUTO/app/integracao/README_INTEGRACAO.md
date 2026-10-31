# AutosistemaTransfer + Kreysam

Integração feita sobre os ficheiros Java fornecidos.

## Integrado
- FilaEnvio
- SmsFilter
- SmsReceiver
- NotificationForwarderService
- Preferências de modo de envio, número extra e número de reencaminhamento SMS
- Métodos de permissões SMS e acesso às notificações na MainActivity
- Mantidos os sistemas existentes do AutosistemaTransfer
- Não foi substituído o MainActivity, MonitorService, BootReceiver, DeviceAdminReceiverImpl ou Prefs existentes; os conflitos foram resolvidos por integração.

## Decisões
- O MonitorService do AutosistemaTransfer foi preservado porque ele já contém o processamento principal de pedidos/USSD.
- O MonitorService pequeno do Kreysam não foi copiado por cima: ele teria conflito e depende de `ApiClient.reprocessarFilaPendente`, que não existe no ApiClient fornecido.
- `MonitorService$1.java` também não foi copiado pelo mesmo motivo.
- BootReceiver e DeviceAdminReceiverImpl do AutosistemaTransfer foram preservados porque já possuem a lógica correspondente.
- Prefs foi ampliado, usando o mesmo SharedPreferences do AutosistemaTransfer para não criar uma segunda configuração isolada.

## Manifest
O arquivo `MANIFEST_ADICOES.xml` contém os elementos que precisam ser adicionados ao AndroidManifest.xml real do projeto. Os arquivos fornecidos não continham Manifest/Gradle/resources, portanto não seria correto inventar o restante do projeto.

## Segurança
O SmsReceiver só encaminha mensagens que passam pelo SmsFilter. O NotificationForwarderService usa o mesmo filtro antes de enviar ao painel.
