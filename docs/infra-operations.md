# Operação futura e observabilidade

Liveness `/api/v1/health` confirma processo; readiness `/api/v1/health/ready`
retorna 200/503 genérico, no-store, sem nome de host/tabela/erro SQL. Verifica
conexões restritas, tabelas técnicas e RLS forçada; probes compartilham uma consulta
em voo e cache de 1 segundo. Prazo HTTP 4s, consultas PG limitadas a 15s.
Dependência indisponível não revela detalhes nem derruba a liveness. Inicialização
recusa schema incompatível antes de escutar; não executa DDL/provisioning.

Logs JSON com requestId gerado no servidor, sem confiar no header do cliente.
Não registrar corpos, tokens, query strings, cookies, DSN ou mensagens do driver.
Contadores internos `operationalSnapshot`: requests, rejected, failures e draining;
sem endpoint público de métricas ou dimensões identificáveis. Eventos de segurança
persistidos pela infraestrutura existente, com escopo próprio. Eventos de operação:
API_START_FAILED, API_DRAINING, API_STOPPED, API_SHUTDOWN_TIMEOUT,
AUTH_MAINTENANCE_FAILED, DATABASE_POOL_ERROR. Métricas são locais ao processo;
exportação/agregação e retenção dependem do provedor aprovado.

Alertas futuros: readiness indisponível >1 minuto, 5xx >5%/5min com mínimo de
tráfego, timeout de pool, falhas recorrentes de mail, crescimento do outbox,
tentativas de autenticação excessivas e prazo de backup/ensaio expirado. Destino,
responsável, canal e SLO devem ser aprovados; nenhum monitor externo foi criado.
Logs precisam de retenção mínima, acesso restrito e descarte definidos com o provedor.

SIGTERM/SIGINT: parar aceitação, drenar requisições/worker e fechar dois pools.
Prazo máximo 30s; supervisor deve conceder >=35s. Processo persistente único até
aprovação do proxy, armazenamento de rate limit e coordenação dos workers.
TLS do banco valida CA gerenciada; não usar NODE_TLS_REJECT_UNAUTHORIZED=0.

## Schema, migrations e recuperação

CI cria banco PostgreSQL 17 vazio, aplica somente nele as seis migrations, confere
checksums/histórico e grants técnicos. `verify-consistency-state.mjs` aceita apenas
loopback/ethos_auth_test: verifica 6 ativas, 46 tabelas, 44 com RLS forçada, zero
DELETE tenant. Tentativas históricas revertidas não contam como migration ativa.

Runtime valida o contrato técnico mínimo com os próprios papéis. Isso não substitui
a conferência administrativa completa de checksums, constraints, policies e ACL.
O gate de publicação futuro exige ambas. Não conceder SELECT no histórico ao runtime.
Schema de cinco migrations não atende à versão atual: 0.11.1 precisa de aprovação
e ativação prévia. Nenhuma migration/grant novo foi criado na 0.12.

Antes de mudança real: confirmar referência e TLS direto; gerar dump PG17 dos três
schemas e objetos necessários; criptografar AES-GCM; guardar chave separada e duas
cópias protegidas; validar hashes e restaurar em PostgreSQL isolado. Comparar
catálogo, dados, RLS/policies, ACL e constraints. Nunca restaurar por cima do banco
real durante ensaio. Backup existente 0.11.1 não é renovado por esta etapa; para
ativação futura precisa ser atual e validado novamente. Cópia externa, responsável,
RPO/RTO e frequência permanecem por definir. Sem transmissão externa autorizada.

Recuperação: suspender escritas, preservar evidências, restaurar em destino separado,
verificar integridade e aprovar redirecionamento. Rollback da aplicação somente
se compatível com o schema. SQL reverso destrutivo/reset/db push são proibidos.
