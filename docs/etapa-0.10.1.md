# Etapa 0.10.1 — revisão e plano de ativação

**Ativação e ensaio excepcional concluídos: 38 verificações reais aprovadas.** Os GRANTs de negócio permanecem ativos; a permissão temporária foi integralmente revertida. Dados das 44 tabelas, estruturas, RLS, usuários e autenticação foram preservados. Sem deploy ou início da etapa 0.11. Base: `abff06d9daec513c30e044e869199bdf7666dabe`. Hash do commit e resultado do push são informados no relatório de entrega após as operações Git.

## Resultado final do ensaio excepcional

O usuário autorizou explicitamente o GRANT SET transitório exclusivamente neste projeto, dentro de BEGIN/ROLLBACK e na mesma sessão física. O ensaio final usou um único `pg.Client` dedicado, sem pool ou consultas concorrentes. O PID `576904` foi conferido antes, durante SET LOCAL ROLE e depois do rollback. A sessão não foi compartilhada com nenhum outro processo.

Antes das fixtures, um savepoint comprovou o caráter transacional do GRANT: a associação temporária apareceu e foi removida por ROLLBACK TO SAVEPOINT. Em seguida, o GRANT foi repetido dentro da mesma transação e os testes executaram como `current_user=ethos_tenant_runtime`, sem COMMIT. Ao terminar, inclusive pelos caminhos de erro, o bloco finally executou ROLLBACK e comparou a associação com o estado original.

Foram aprovadas 38 verificações: INSERT e UPDATE próprios; negação sem contexto; leituras e UPDATE cruzados invisíveis/sem efeito; INSERT estrangeiro negado; proteção de id/organizationId/createdAt; DELETE negado; identidade, RBAC e auditoria protegidos; referências compostas entre organizações rejeitadas; percentuais inválidos bloqueados; núcleo histórico de locação imutável; auditoria gerada somente dentro da transação revertida. Os hashes e contagens de todas as 44 tabelas, inclusive auditoria e autenticação, conferem após o rollback. Não foram criados usuários, credenciais, sessões ou vínculos RBAC. O teste de contexto/membership da API permanece na regressão isolada; o ensaio real valida SQL/RLS sob o papel efetivo.

Estado posterior obrigatório confirmado: existe apenas a associação original concedida por `supabase_admin`, com ADMIN=true, INHERIT=false e SET=false. A associação temporária concedida por `postgres` desapareceu. Os runtime continuam sem flags administrativas ou BYPASSRLS; DELETE/TRUNCATE e GRANT OPTION permanecem ausentes no tenant. Os 44 conjuntos permanentes de privilégios continuam exatamente como aprovados e as 42 tabelas de aplicação mantêm RLS habilitada e forçada.

Diferença encontrada e corrigida durante o ensaio: o GRANT literal sem opção INHERIT criava uma segunda associação por concedente, com INHERIT=true por padrão. A checagem interrompeu a tentativa antes de criar fixtures; o rollback restaurou o estado original. A sondagem sem fixtures está preservada em `etapa-0.10.1-membership-probe.json` e a primeira tentativa em `etapa-0.10.1-transient-first-attempt.json`. Para cumprir a proibição de ampliar herança, o ensaio final explicitou `GRANT ethos_tenant_runtime TO postgres WITH SET TRUE, INHERIT FALSE;`. Sua associação temporária tinha ADMIN=false, INHERIT=false e SET=true; a original não mudou. Ambas as concessões temporárias foram revertidas, sem mudança nos GRANTs de negócio.

Evidências finais: `etapa-0.10.1-verify.json`, `etapa-0.10.1-verification-diagnosis.json` e `etapa-0.10.1-quality.json`. A checagem independente posterior usa nova conexão somente leitura e confirma novamente os 44 GRANTs, SET=false e integridade. Datas das evidências são instantes UTC; a data civil da execução segue America/Sao_Paulo.

Qualidade aprovada: lint, typecheck e build de contracts/database/api/web; 18 testes unitários do banco, 25 do frontend e 3 da API. Em PostgreSQL descartável separado: 31 verificações de privilégios, 18 grupos HTTP de negócio e 9 testes de autenticação. Nenhuma regressão de escrita foi executada contra o Supabase. O container descartável foi removido após os testes. `.gitattributes` fixa LF nos SQLs revisados para preservar os hashes em checkouts Windows.

Limitações operacionais: não houve deploy, smoke test de aplicação publicada, SMTP ou integração externa. O provisioning antigo 0.9.1 continua com perfil de leitura e não deve ser usado para reconciliar o ambiente ativado. Backups protegidos continuam locais; redundância fora deste computador permanece pendente. Reexecução de qualquer teste real exige nova autorização explícita para a permissão transitória. Nenhum trabalho de 0.11 foi iniciado.

## Histórico da aplicação e interrupção inicial

## Resultado da execução autorizada

Pré-condições aprovadas: projeto, conexão direta IPv6/TLS, hash obrigatório, ambas as cópias de backup disponíveis e íntegras, cinco migrations em dia e catálogo/dados/ACLs iguais ao snapshot protegido. Os dois runtime autenticaram com suas credenciais próprias, sem usar impersonação, por conexão direta TLS.

O SQL de SHA-256 `bf190ef6241b9be22ac68690db53ab272f1b88c5d24a334937523d2350a6aae0` foi executado e commitado. Evidências: `etapa-0.10.1-preflight.json` e `etapa-0.10.1-apply.json`.

A verificação pós-aplicação confirmou os 44 conjuntos exatos de privilégios por coluna nos três schemas: INSERT em 23 tabelas e UPDATE limitado em 21, sem concessões extras, GRANT OPTION, DELETE, TRUNCATE, BYPASSRLS ou flags administrativas nos runtime. O catálogo, RLS, políticas, proprietários, funções e ACLs que não são de coluna permaneceram iguais. As 42 tabelas de aplicação continuam com RLS habilitada e forçada.

O ensaio de escrita abortou com `42501` antes da primeira verificação sob papel tenant. A conexão administrativa é `postgres`, sem superuser, e sua associação existente a `ethos_tenant_runtime` tem `admin_option=true`, `inherit_option=false`, `set_option=false`. Isso impede SET LOCAL ROLE no Supabase real; o PostgreSQL descartável anterior permitia essa operação pelo superuser local. Não foi concedida associação/opção adicional nem repetido o ensaio.

A transação de fixtures foi revertida. A conferência posterior, somente leitura, confirmou os hashes e contagens de todas as 44 tabelas e o catálogo sem alterações, incluindo auditoria. Não foram criados ou alterados usuários, credenciais, sessões, memberships organizacionais ou RBAC. O banco possui zero organizações persistidas, portanto as conexões runtime independentes não têm um pai existente para testar INSERT positivo sem fixtures visíveis.

Evidências preservadas: `etapa-0.10.1-verify-failure.json` e `etapa-0.10.1-verification-diagnosis.json`. O fato de `grantsCommittedThisRun=false` na falha refere-se à execução de **verify**, que não concede privilégios; a execução anterior de **apply** foi commitada e está registrada separadamente.

A autorização excepcional posterior resolveu a pendência de SET ROLE nos termos descritos no resultado final acima. Esta seção preserva o diagnóstico e a decisão de interromper antes dessa autorização; não há permissão temporária ativa nem recuperação pendente.

Os resultados A–C abaixo documentam a preparação anterior à aplicação. Suas referências à baseline de zero escrita e aprovação pendente são históricas e não representam o estado atual. As verificações finais foram aprovadas após a autorização excepcional.

## A — auditoria real

Projeto confirmado: `wszrtvgjcgpgntsssbhd`, informado pelo usuário. Conexão administrativa direta IPv6 com TLS criptografado, certificado autorizado pela CA e TLS confirmado também por `pg_stat_ssl`. Não foi usado pooler.

As cinco migrations vigentes estão aplicadas, com checksums correspondentes aos arquivos locais e nenhuma pendência. Uma tentativa antiga de `multi_tenant_model` está marcada como revertida no histórico do Prisma. Ela provocou um falso negativo inicial no verificador novo, corrigido para distinguir tentativas revertidas de execuções vigentes. Nenhum registro do histórico foi modificado.

Os dois papéis runtime continuam LOGIN/NOINHERIT, sem SUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE, REPLICATION ou memberships herdadas. Tenant tem SELECT em 29 tabelas e zero INSERT/UPDATE por coluna, DELETE ou TRUNCATE. As 24 tabelas distintas afetadas pela proposta têm SELECT e RLS habilitada e forçada. As políticas existentes aceitam escrita sob o contexto organizacional e WITH CHECK; não é necessário modificar políticas.

A revisão retirou duas permissões de UPDATE não utilizadas pela API: `Inspection.responsibleMembershipId` e `MaintenanceRequest.assignedMembershipId`. A proposta mantém INSERT em 23 tabelas e UPDATE limitado em 21. O hash anterior em `etapa-0.10-privileges.md` permanece como evidência histórica; o hash vinculante desta aprovação está abaixo. Nenhum privilégio novo será concedido ao auth runtime, identidade, RBAC, auditoria ou objetos gerenciados.

## B — backup e recuperação

Backup completo de `ethos`, `ethos_identity` e `ethos_technical`, incluindo dados, constraints, índices, enums, funções, triggers, RLS, proprietários e ACLs. Foi usado snapshot exportado em transação REPEATABLE READ READ ONLY, cliente nativo PostgreSQL 17.11 e TLS verify-full.

- Primário: `.backups/stage-0.10.1-b377f036-b23d-4c3c-b74d-9d6e76f2a9a8/application.dump`.
- Segunda cópia: `.backups/secondary/stage-0.10.1-b377f036-b23d-4c3c-b74d-9d6e76f2a9a8/application.dump`.
- Tamanho: 260886 bytes.
- SHA-256: `5fbcd042675e56812ff1298d8e1a93c2b0da19513ddcc76d3556c2a6d3d3b353`.

As cópias têm hashes iguais. Os diretórios tiveram a herança ACL removida e acesso explícito restrito antes da gravação; permanecem fora do Git. Inventário detalhado, manifesto e validação de recuperação ficam nesses diretórios protegidos, sem exportar senhas dos papéis.

A restauração ocorreu em PostgreSQL 17.11 com rede `none` e sem portas publicadas. Foram conferidas 44 tabelas, 74 políticas e 42 tabelas com RLS habilitada e forçada. Dados de todas as tabelas conferem por hashes e contagens, sem imprimir linhas. Estrutura, proprietários e permissões efetivas também conferem. Os containers de restauração foram removidos com os volumes.

A primeira comparação estrita encontrou diferenças de representação: casts de arrays literais nos CHECKs e ACL explícita contendo apenas privilégios padrão do proprietário versus ACL padrão implícita. Apenas essas equivalências são normalizadas. Testes negativos garantem que mudanças em valores CHECK, validação, grantees, privilégios e proprietários continuam sendo rejeitadas. As diferenças textuais brutas permanecem registradas em `etapa-0.10.1-restore.json`. A falha inicial foi preservada em `etapa-0.10.1-preparation-failure.json`; não houve correção de dados reais. Um segundo backup completo foi restaurado com o comparador corrigido e validado novamente.

Limites: as duas cópias ficam no mesmo computador e não oferecem redundância geográfica. O dump cobre a aplicação, não a infraestrutura gerenciada do Supabase, arquivos de storage, SMTP ou segredos externos. O ensaio criou nomes de papéis como NOLOGIN para resolver proprietários/ACLs, sem clonar privilégios administrativos gerenciados ou senhas. No projeto real, papéis e credenciais existentes devem ser preservados. Recuperação em outro projeto exige planejamento próprio. Restauração sobre o Supabase real não foi autorizada nem executada.

## C — proposta e aprovação

Arquivo exato: `packages/database/scripts/propose-business-runtime.sql`.

**SHA-256, arquivo LF: `bf190ef6241b9be22ac68690db53ab272f1b88c5d24a334937523d2350a6aae0`.**

Todos os privilégios são acréscimos à baseline de zero escrita. Não há GRANT OPTION, DELETE, TRUNCATE, DDL, ALTER ROLE, mudança de ownership, política, função ou dado. SELECT/USAGE atuais serão preservados. A transação verifica flags, memberships e ownership do papel antes dos GRANTs. A lista integral de colunas e o SQL estão no final deste documento.

## Testes

Nesta revisão, em novo PostgreSQL descartável com as cinco migrations:

- 31 verificações de privilégios aprovadas, agora comparando INSERT e UPDATE com as 44 listas exatas de colunas.
- 18 grupos de integração HTTP aprovados com o SQL reduzido: persistência, RLS, referências cruzadas, campos protegidos, identidade/RBAC/auditoria, read_own, versões/alocações concorrentes e ausência de fallback administrativo.
- Reversão ensaiada: zero colunas com INSERT/UPDATE após o REVOKE; reaplicação bem-sucedida.
- Lint do pacote de banco e 17 testes unitários aprovados, incluindo três novos de preparação/recuperação.

Os relatórios históricos da etapa 0.10 foram preservados. Eles também registram os testes de contexto/pool, frontend e navegador. Os ensaios desta revisão estão em `etapa-0.10.1-{privilege,api}-tests.json`. Nenhum teste de escrita foi executado no Supabase real.

## Execução proposta, somente após aprovação

1. Confirmar novamente projeto, TLS, ausência de drift em papéis/ACLs/RLS/migrations e o hash exato do SQL. Qualquer divergência interrompe a execução. Reavaliar a atualidade do backup conforme a atividade posterior; se necessário, criar e ensaiar novo snapshot antes dos GRANTs.
2. Carregar PGUSER/PGPASSWORD somente no processo, a partir do armazenamento protegido, sem argumentos com senha, URLs ou logs. Usar PGHOST `db.wszrtvgjcgpgntsssbhd.supabase.co`, PGPORT `5432`, PGDATABASE `postgres`, PGSSLMODE `verify-full` e PGSSLROOTCERT apontando para `packages/database/certs/supabase-ca.crt`.
3. Executar o comando abaixo. ON_ERROR_STOP e BEGIN/COMMIT impedem aplicação parcial. Não há migration ou rotação de credenciais prevista.

```powershell
& .\.tools\postgresql17\native\pgsql\bin\psql.exe --no-psqlrc --set=ON_ERROR_STOP=1 --file=packages/database/scripts/propose-business-runtime.sql
```

4. Conferir privilégios exatos por coluna, ausência de DELETE/TRUNCATE/GRANT OPTION e preservação de flags/RLS.
5. Validar conexões reais dos runtime para leitura e negações sem fixtures. Para o teste real de privilégios com fixtures sem persistência, usar uma transação administrativa, fixtures A/B e SET LOCAL ROLE para testar os privilégios efetivos dos papéis, seguido de ROLLBACK obrigatório. Isso não equivale a abrir conexão autenticada como runtime; as duas modalidades devem ser registradas separadamente. Fixtures não commitadas não são visíveis a conexões independentes. O ensaio completo de escrita multi-conexão permanece no banco descartável. Não se propõe commitar dados de teste no Supabase.
6. Revalidar contagens e hashes de todas as tabelas contra o snapshot anterior. Não iniciar aplicação, workers, SMTP ou listener contra o real. Não criar sessão persistente ou e-mail de teste. Atualizar evidências; commit/push somente após aprovação das validações.

Não executar o comando `grants` da etapa 0.9.1: ele reconcilia para leitura e revogaria a nova escrita. O script novo de preparação aceita apenas auditoria/backup; rejeita modos de ativação mesmo com `--approved`.

## Reversão

Erro antes do COMMIT desfaz a transação. Depois do COMMIT, interromper escritas, preservar evidências e executar somente a reversão aprovada: `packages/database/scripts/revoke-business-runtime.sql`. Ela revoga os 44 conjuntos de colunas, mantendo leitura, USAGE, auth runtime e dados. O procedimento foi ensaiado em banco descartável.

```powershell
& .\.tools\postgresql17\native\pgsql\bin\psql.exe --no-psqlrc --set=ON_ERROR_STOP=1 --file=packages/database/scripts/revoke-business-runtime.sql
```

A reversão de GRANT não desfaz dados escritos após a ativação. Restaurar o dump antigo pode apagar atividade posterior e exige aprovação separada; não será feito automaticamente. Não usar `prepare-auth-runtime.sql` como rollback, pois seu escopo é maior.

## Riscos e recomendação

A credencial tenant passará de leitura para escrita limitada. RLS depende do servidor confiável: GUCs não autenticam quem já possui a credencial SQL e um membership válido. Não confiar no organizationId fornecido pelo cliente. `withOrganization`, RBAC, CSRF, chaves compostas, constraints e histórico continuam obrigatórios, com contexto transacional sem vazamento pelo pool. read_own continua sem administração ampla. Auth runtime mantém seus privilégios próprios de sessões; a ausência de DELETE aqui se refere ao tenant e à proposta.

Provisioning/verificadores 0.9.1 pressupõem leitura e precisam reconhecer explicitamente o perfil 0.10 antes de qualquer reconciliação futura. Nenhuma alteração automática nesse fluxo foi feita.

Recomendação: aprovar somente o SQL e hash apresentados, no projeto confirmado, com pré-verificação imediatamente antes, validação transacional e reversão limitada. Não há justificativa para migration, ampliação administrativa ou desativação de RLS. A execução permanece interrompida até aprovação explícita.

## Colunas e SQL integral

| Tabela               | Privilegio | Colunas                                                                                                                                                                                                    |
| -------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner                | INSERT     | id, organizationId, name, kind, email, phone, taxIdentifier                                                                                                                                                |
| Tenant               | INSERT     | id, organizationId, name, kind, email, phone, taxIdentifier                                                                                                                                                |
| Property             | INSERT     | id, organizationId, code, name, kind, address                                                                                                                                                              |
| PropertyUnit         | INSERT     | id, organizationId, propertyId, code, name, isMain, area                                                                                                                                                   |
| PropertyOwnership    | INSERT     | id, organizationId, propertyId, ownerId, percentage, startsOn, endsOn                                                                                                                                      |
| Lease                | INSERT     | id, organizationId, unitId, code, startsOn, endsOn, baseRent, currency, dueDay                                                                                                                             |
| LeaseTenant          | INSERT     | id, organizationId, leaseId, tenantId, role, startsOn, endsOn                                                                                                                                              |
| Contract             | INSERT     | id, organizationId, leaseId, code                                                                                                                                                                          |
| LeaseRenewal         | INSERT     | id, organizationId, leaseId, successorLeaseId, startsOn, endsOn, newRent                                                                                                                                   |
| RentAdjustment       | INSERT     | id, organizationId, leaseId, effectiveOn, previousRent, newRent, percentage, indexName                                                                                                                     |
| Charge               | INSERT     | id, organizationId, leaseId, code, kind, competence, amount                                                                                                                                                |
| Installment          | INSERT     | id, organizationId, chargeId, number, dueOn, amount                                                                                                                                                        |
| Payment              | INSERT     | id, organizationId, leaseId, code, amount, method, paidAt                                                                                                                                                  |
| Receipt              | INSERT     | id, organizationId, paymentId, number, issuedAt, snapshot                                                                                                                                                  |
| Inspection           | INSERT     | id, organizationId, unitId, leaseId, kind, scheduledAt                                                                                                                                                     |
| InspectionReport     | INSERT     | id, organizationId, inspectionId, version, content                                                                                                                                                         |
| MaintenanceRequest   | INSERT     | id, organizationId, unitId, leaseId, title, description, category, priority, estimatedCost, actualCost                                                                                                     |
| Photo                | INSERT     | id, organizationId, documentId, unitId, caption, sortOrder, takenAt                                                                                                                                        |
| Notification         | INSERT     | id, organizationId, recipientMembershipId, kind, title, message, payload                                                                                                                                   |
| OrganizationSettings | INSERT     | id, organizationId, timezone, preferences                                                                                                                                                                  |
| ContractVersion      | INSERT     | id, organizationId, contractId, version, content, contentHash, validFrom                                                                                                                                   |
| PaymentAllocation    | INSERT     | id, organizationId, paymentId, installmentId, amount                                                                                                                                                       |
| Document             | INSERT     | id, organizationId, kind, originalName, mimeType, storageProvider, bucket, objectKey, sizeBytes, sha256, ownerId, tenantId, unitId, contractVersionId, receiptId, inspectionReportId, maintenanceRequestId |
| Owner                | UPDATE     | name, kind, email, phone, taxIdentifier, archivedAt                                                                                                                                                        |
| Tenant               | UPDATE     | name, kind, email, phone, taxIdentifier, archivedAt                                                                                                                                                        |
| Property             | UPDATE     | code, name, kind, address, archivedAt                                                                                                                                                                      |
| PropertyUnit         | UPDATE     | code, name, isMain, area, archivedAt                                                                                                                                                                       |
| PropertyOwnership    | UPDATE     | endsOn                                                                                                                                                                                                     |
| Lease                | UPDATE     | status, endedAt                                                                                                                                                                                            |
| LeaseTenant          | UPDATE     | endsOn                                                                                                                                                                                                     |
| Contract             | UPDATE     | code, status                                                                                                                                                                                               |
| LeaseRenewal         | UPDATE     | status                                                                                                                                                                                                     |
| RentAdjustment       | UPDATE     | status, appliedAt                                                                                                                                                                                          |
| Charge               | UPDATE     | code, kind, competence, amount, status                                                                                                                                                                     |
| Installment          | UPDATE     | number, dueOn, amount                                                                                                                                                                                      |
| Payment              | UPDATE     | status, reversedAt                                                                                                                                                                                         |
| Receipt              | UPDATE     | status, voidedAt, voidReason                                                                                                                                                                               |
| Inspection           | UPDATE     | kind, scheduledAt, completedAt                                                                                                                                                                             |
| InspectionReport     | UPDATE     | status, content, finalizedAt                                                                                                                                                                               |
| MaintenanceRequest   | UPDATE     | title, description, category, status, priority, estimatedCost, actualCost, completedAt                                                                                                                     |
| Photo                | UPDATE     | caption, sortOrder, takenAt                                                                                                                                                                                |
| Notification         | UPDATE     | readAt                                                                                                                                                                                                     |
| OrganizationSettings | UPDATE     | timezone, preferences                                                                                                                                                                                      |
| Organization         | UPDATE     | name                                                                                                                                                                                                       |

```sql
-- PROPOSTA ETAPA 0.10: validada somente em PostgreSQL isolado; NAO aplicada no Supabase.
-- Aplicar administrativamente somente depois de testes isolados e verificacao do destino.
-- Nao modifica papeis, RLS, funcoes, ownership, usuarios ou tabelas de RBAC.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ethos_tenant_runtime' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolinherit)
     OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='ethos_tenant_runtime'))
     OR EXISTS(SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname='ethos_tenant_runtime'))
     OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=(SELECT oid FROM pg_roles WHERE rolname='ethos_tenant_runtime'))
     OR EXISTS(SELECT 1 FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname='ethos_tenant_runtime'))
     OR EXISTS(SELECT 1 FROM pg_database WHERE datdba=(SELECT oid FROM pg_roles WHERE rolname='ethos_tenant_runtime'))
  THEN RAISE EXCEPTION 'UNSAFE_TENANT_RUNTIME_ROLE'; END IF;
END $$;
GRANT INSERT ("id", "organizationId", "name", "kind", "email", "phone", "taxIdentifier") ON ethos."Owner" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "name", "kind", "email", "phone", "taxIdentifier") ON ethos."Tenant" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "code", "name", "kind", "address") ON ethos."Property" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "propertyId", "code", "name", "isMain", "area") ON ethos."PropertyUnit" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "propertyId", "ownerId", "percentage", "startsOn", "endsOn") ON ethos."PropertyOwnership" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "unitId", "code", "startsOn", "endsOn", "baseRent", "currency", "dueDay") ON ethos."Lease" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "leaseId", "tenantId", "role", "startsOn", "endsOn") ON ethos."LeaseTenant" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "leaseId", "code") ON ethos."Contract" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "leaseId", "successorLeaseId", "startsOn", "endsOn", "newRent") ON ethos."LeaseRenewal" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "leaseId", "effectiveOn", "previousRent", "newRent", "percentage", "indexName") ON ethos."RentAdjustment" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "leaseId", "code", "kind", "competence", "amount") ON ethos."Charge" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "chargeId", "number", "dueOn", "amount") ON ethos."Installment" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "leaseId", "code", "amount", "method", "paidAt") ON ethos."Payment" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "paymentId", "number", "issuedAt", "snapshot") ON ethos."Receipt" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "unitId", "leaseId", "kind", "scheduledAt") ON ethos."Inspection" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "inspectionId", "version", "content") ON ethos."InspectionReport" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "unitId", "leaseId", "title", "description", "category", "priority", "estimatedCost", "actualCost") ON ethos."MaintenanceRequest" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "documentId", "unitId", "caption", "sortOrder", "takenAt") ON ethos."Photo" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "recipientMembershipId", "kind", "title", "message", "payload") ON ethos."Notification" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "timezone", "preferences") ON ethos."OrganizationSettings" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "contractId", "version", "content", "contentHash", "validFrom") ON ethos."ContractVersion" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "paymentId", "installmentId", "amount") ON ethos."PaymentAllocation" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "kind", "originalName", "mimeType", "storageProvider", "bucket", "objectKey", "sizeBytes", "sha256", "ownerId", "tenantId", "unitId", "contractVersionId", "receiptId", "inspectionReportId", "maintenanceRequestId") ON ethos."Document" TO ethos_tenant_runtime;
GRANT UPDATE ("name", "kind", "email", "phone", "taxIdentifier", "archivedAt") ON ethos."Owner" TO ethos_tenant_runtime;
GRANT UPDATE ("name", "kind", "email", "phone", "taxIdentifier", "archivedAt") ON ethos."Tenant" TO ethos_tenant_runtime;
GRANT UPDATE ("code", "name", "kind", "address", "archivedAt") ON ethos."Property" TO ethos_tenant_runtime;
GRANT UPDATE ("code", "name", "isMain", "area", "archivedAt") ON ethos."PropertyUnit" TO ethos_tenant_runtime;
GRANT UPDATE ("endsOn") ON ethos."PropertyOwnership" TO ethos_tenant_runtime;
GRANT UPDATE ("status", "endedAt") ON ethos."Lease" TO ethos_tenant_runtime;
GRANT UPDATE ("endsOn") ON ethos."LeaseTenant" TO ethos_tenant_runtime;
GRANT UPDATE ("code", "status") ON ethos."Contract" TO ethos_tenant_runtime;
GRANT UPDATE ("status") ON ethos."LeaseRenewal" TO ethos_tenant_runtime;
GRANT UPDATE ("status", "appliedAt") ON ethos."RentAdjustment" TO ethos_tenant_runtime;
GRANT UPDATE ("code", "kind", "competence", "amount", "status") ON ethos."Charge" TO ethos_tenant_runtime;
GRANT UPDATE ("number", "dueOn", "amount") ON ethos."Installment" TO ethos_tenant_runtime;
GRANT UPDATE ("status", "reversedAt") ON ethos."Payment" TO ethos_tenant_runtime;
GRANT UPDATE ("status", "voidedAt", "voidReason") ON ethos."Receipt" TO ethos_tenant_runtime;
GRANT UPDATE ("kind", "scheduledAt", "completedAt") ON ethos."Inspection" TO ethos_tenant_runtime;
GRANT UPDATE ("status", "content", "finalizedAt") ON ethos."InspectionReport" TO ethos_tenant_runtime;
GRANT UPDATE ("title", "description", "category", "status", "priority", "estimatedCost", "actualCost", "completedAt") ON ethos."MaintenanceRequest" TO ethos_tenant_runtime;
GRANT UPDATE ("caption", "sortOrder", "takenAt") ON ethos."Photo" TO ethos_tenant_runtime;
GRANT UPDATE ("readAt") ON ethos."Notification" TO ethos_tenant_runtime;
GRANT UPDATE ("timezone", "preferences") ON ethos."OrganizationSettings" TO ethos_tenant_runtime;
GRANT UPDATE ("name") ON ethos."Organization" TO ethos_tenant_runtime;
COMMIT;
```

Rollback SHA-256 (LF): `452fc749e2e48c632982979b254df9736bf7ff37b376a056273e2322f1944129`.
