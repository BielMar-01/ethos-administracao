# Etapa 0.11.1 — preparação de banco, usuários e acesso

Estado: blocos A–G preparados e validados conforme evidências abaixo. **Interrupção para aprovação antes de H.** Não houve ativação real, criação/alteração de contas ou organizações reais, deploy, configuração de SMTP, commit ou push. A etapa completa ainda não está concluída.

Base confirmada: main, commit `f54e2533681fb513ac6f49531a1371edfeef0786`, árvore inicialmente limpa, repositório BielMar-01/ethos-administracao. Data da revisão: 24/10/2026. Os timestamps dos artefatos JSON estão em UTC.

## A — estado real do Supabase

Projeto confirmado: `wszrtvgjcgpgntsssbhd`. A conexão administrativa usou hostname direto do projeto, IPv6, CA validada, TLS autorizado e TLS confirmado no backend por pg_stat_ssl. Transações de auditoria foram REPEATABLE READ READ ONLY e encerradas com ROLLBACK. Nenhum servidor de aplicação/worker foi iniciado contra o banco real.

Cinco migrations ativas estão aplicadas, com checksums correspondentes aos arquivos locais:

1. 20261022000000_init_infrastructure
2. 20261022010000_multi_tenant_model
3. 20261022020000_auth_identity
4. 20261022021000_auth_event_reason
5. 20261022022000_auth_privilege_revocation

Pendente exclusivamente `20261024000000_mutation_consistency`. Há 44 tabelas nos schemas da aplicação, 42 com RLS habilitada e forçada. Os papéis runtime têm LOGIN e não têm SUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE, REPLICATION ou INHERIT; não possuem associações a outros papéis nem ownership de relações, schemas ou funções. INSERT/UPDATE de negócio coincidem exatamente, por coluna, com as 44 concessões revisadas na 0.10.1. DELETE/TRUNCATE não são concedidos ao tenant nas tabelas de negócio. Não houve downgrade.

O preparador antigo `prepare-business-activation.mjs` presume banco sem escrita e todas as migrations locais aplicadas. Não serve para esta revisão. Os scripts novos não chamam provisioning legado. Os perfis da 0.11 continuam protegendo contra downgrade e o perfil técnico `business-0.11-isolated` continua restrito ao ensaio.

Evidências: `etapa-0.11.1-audit.json` e `etapa-0.11.1-preflight.json`. A última comparação de leitura confirmou que dados, catálogo e ACLs reais ainda correspondem ao novo snapshot.

## B — backup atualizado e recuperação

Snapshot novo: `stage-0.11.1-9601505a-d7cd-4509-92e3-87a321614cf9`. Abrange schemas ethos, ethos_identity e ethos_technical, incluindo dados, histórico de migrations, funções, índices, constraints, triggers, políticas e ACLs. Não inclui schemas gerenciados auth/storage do Supabase, nem senhas dos papéis de conexão. É um backup da aplicação, não uma cópia de todo o serviço gerenciado.

pg_dump e pg_restore nativos 17.11 foram verificados. O dump usa snapshot exportado da mesma transação de leitura que coletou os resumos de integridade; os bytes são capturados em memória e empacotados com manifesto de recuperação, sem dump em claro no disco. Duas cópias AES-256-GCM ficam em `.backups/<snapshot>/application.enc` e `.backups/secondary/<snapshot>/application.enc`; a chave fica separada em `.secrets/<snapshot>.key`. ACLs dos artefatos novos são restritas ao usuário atual e SYSTEM no Windows. Cópias anteriores foram preservadas. Nada foi transmitido para serviços externos.

Hash do dump interno: `195d2f2a2bf1c531f74337134f9b06130a152f263029e08a1ce6bda2f5b5f3d8`.

Hash do envelope criptografado: `4cfcbd4c16045a1196935d263f9c683e8bcc8191aea03a2e7f54dd121dc4f7fd`.

A restauração em PostgreSQL 17.11 sem rede passou: 44 tabelas, 74 políticas, dados e catálogo/ACLs efetivos correspondentes. Apenas as duas equivalências de representação já testadas na 0.10.1 são normalizadas: casts equivalentes de CHECK literal e ACL padrão do proprietário. O container de ensaio sem rede foi removido após a verificação. Contas/credenciais runtime restauradas em simulação recebem credenciais fictícias locais; não são restauradas senhas reais de conexão.

Evidências: `etapa-0.11.1-backup.json`, `etapa-0.11.1-restore.json`. O preflight exige ambas as cópias íntegras, recuperação aprovada, snapshot com menos de 24 horas e correspondência dos dados/catálogo/ACLs atuais. Qualquer drift ou vencimento exige revisão/backup novo antes de ativar.

## C — simulação na cópia restaurada

Outra cópia foi restaurada em loopback, com banco ethos_auth_test na porta 55439. A simulação aplicou a sexta migration por Prisma migrate deploy e executou somente o SQL técnico. Não foi executado o provisioning auth antigo nem reaplicado o reconciliador de negócio. Os dados anteriores foram comparados antes/depois, excluindo somente a mudança esperada em \_prisma_migrations; as ACLs de negócio permaneceram iguais.

A migration cria ResourceRevision e MutationReceipt em ethos_technical, com PKs compostas, FKs restritivas, índice, CHECKs e RLS ENABLE/FORCE. O recibo é isolado também pelo vínculo validado no contexto transacional. Não há DROP, TRUNCATE, alteração de tabelas de negócio ou alteração de políticas preexistentes.

O SQL proposto, sem modificações em relação ao ensaio da 0.11, é:

```sql
BEGIN;
REVOKE ALL ON ethos_technical."ResourceRevision", ethos_technical."MutationReceipt" FROM ethos_auth_runtime, ethos_tenant_runtime;
GRANT USAGE ON SCHEMA ethos_technical TO ethos_tenant_runtime;
GRANT SELECT ON ethos_technical."ResourceRevision", ethos_technical."MutationReceipt" TO ethos_tenant_runtime;
GRANT INSERT ("organizationId", resource, "recordId", revision) ON ethos_technical."ResourceRevision" TO ethos_tenant_runtime;
GRANT UPDATE (revision) ON ethos_technical."ResourceRevision" TO ethos_tenant_runtime;
GRANT INSERT ("organizationId", "membershipId", operation, "keyHash", "inputHash", resource, "recordId") ON ethos_technical."MutationReceipt" TO ethos_tenant_runtime;
COMMIT;
```

O REVOKE inicial alcança somente as duas tabelas técnicas recém-criadas. Não revoga nenhum privilégio de negócio. O runtime de identidade não ganha acesso ao ledger. Não há DELETE, UPDATE do recibo, UPDATE de organizationId ou privilégios administrativos novos. createdAt usa default exclusivo do banco.

| Arquivo a autorizar                                                 | SHA-256 exato                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| prisma/migrations/20261024000000_mutation_consistency/migration.sql | bcfe1a072f137f6bb10f8cebe39a000ff590b032826d1d97299838093eedfdf6 |
| scripts/propose-consistency-runtime.sql                             | 2ab9ea2e98a10b093df2f84523d5c4f4dd876d2097b2087d457621bbe8984c8f |

Os caminhos acima são relativos a packages/database. O SQL de negócio da 0.10.1 preserva seu hash `bf190ef6241b9be22ac68690db53ab272f1b88c5d24a334937523d2350a6aae0`. Os hashes dos executores e do bootstrap estão em `etapa-0.11.1-script-hashes.json`.

Passaram: aceite de ETag/If-Match, replay sequencial/concorrente, conflito de entrada, disputa de edição, versão contratual única, rollback depois de INSERT real, isolamento por organização/vínculo e rejeição de operações proibidas; cinco testes de segurança/RBAC com 170 entradas da matriz; 18 grupos da regressão de negócio. Os artefatos da 0.11.1 preservam os resultados históricos anteriores.

Estado local posterior: seis migrations ativas, checksums corretos, 46 tabelas, 44 com RLS habilitada/forçada, nenhum DELETE para o tenant. A cópia contém uma tentativa histórica de migration já marcada como rolled back: o verificador antigo contava sete linhas como se fossem sete migrations ativas. A consulta foi corrigida para considerar tentativas ativas e registrar a tentativa revertida, sem modificar o histórico. O novo verificador passou sobre a cópia restaurada.

Evidências: `etapa-0.11.1-simulation.json`, `etapa-0.11.1-simulation-restore.json`, `etapa-0.11.1-database-state.json`, `etapa-0.11.1-consistency-tests.json`, `etapa-0.11.1-security-tests.json`, `etapa-0.11.1-authorization-tests.json` e `etapa-0.11.1-api-tests.json`.

## D — usuários reais

A auditoria encontrou **zero usuários, zero organizações, zero SUPER_ADMIN, zero ADMIN_ORGANIZACAO e zero mensagens pendentes**. Não existem contas reais para identificar ou testar no login. Nenhuma conta foi criada, habilitada, confirmada ou alterada.

Esses usuários pertencem à autenticação própria (ethos.User/ethos_identity). A contagem agregada de auth.users do Supabase Auth também retornou zero; nenhum campo pessoal/credencial do schema gerenciado foi selecionado. Os dois sistemas não são vinculados automaticamente.

O SQL de auditoria retorna apenas e-mail já mascarado, estados/booleanos de credencial, vínculos, papéis e contagens de sessões. Não retorna senha, hash, token ou cifra de MFA. Como não há usuários, não há sessões reais ou configuração de MFA a validar. Não se tentou autenticar com contas reais. Evidência: `etapa-0.11.1-users.json`.

## E — bootstrap administrativo preparado

Foi criada uma biblioteca exclusiva de operador e uma CLI sem rota pública e sem chamada no startup. Não existia bootstrap de primeiro SUPER_ADMIN; o provisionador anterior criava apenas papéis organizacionais.

- Senha escolhida localmente pelo operador: 12–128 caracteres, maiúscula, minúscula, número e símbolo, Argon2id, sem senha padrão. Nunca colocar senha no argumento de processo, Git, chat ou relatório.
- Conexão administrativa obrigatória; os dois runtime não podem executar bootstrap. O modo real valida o projeto/TLS e recusa banco sem a sexta migration ativa.
- Primeiro SUPER_ADMIN: lock consultivo transacional, ReadCommitted para enxergar o commit do concorrente, recusa se existir qualquer concessão histórica de SUPER_ADMIN, inclusive revogada. Não há recriação automática de administrador global ou alteração de identidade existente.
- Usuários organizacionais: somente identidade nova, organização existente/ativa e um dos cinco papéis permitidos; nenhuma organização é criada pelo bootstrap. Identidade existente, organização inexistente ou papel arquivado exigem outra autorização/revisão. Grants revogados não são reativados silenciosamente.
- A conta nasce com e-mail pendente. Um token de confirmação de uso único, válido por 24 horas, é entregue somente em arquivo local protegido; não há SMTP ou confirmação automática. A entrega deve ser feita pelo operador autorizado após validar a identidade/canal do titular.
- O handoff é gravado antes do COMMIT. Falha de gravação reverte usuário/vínculo/concessão. Em erro de commit ou comunicação, preservar o handoff para revisão e não repetir automaticamente: ele pode representar uma transação já confirmada.
- PlatformAccessGrant gera PlatformAuditLog pelo trigger existente; o evento OPERATOR_USER_PROVISIONED registra motivo. O bootstrap inicial usa actor global nulo e databaseRole do operador; não inventa um usuário administrador anterior.
- Após confirmação, SUPER_ADMIN recebe sessão MFA_SETUP, sem acesso completo até cadastrar TOTP. Segredo/códigos de recuperação são apresentados apenas ao titular no fluxo existente. Não há SUPER_ADMIN organizacional implícito ou BYPASSRLS runtime.

Teste dedicado em outro PostgreSQL vazio, porta 55440: exclusividade sob concorrência, auditoria, senha, confirmação de uso único, MFA obrigatório, cinco papéis e permissões, proibição de elevação de conta existente e rollback por handoff inválido passaram. O apply sem --approved foi recusado antes de qualquer conexão; esse exit não zero foi o resultado esperado do teste de guarda. Evidência: `etapa-0.11.1-bootstrap-tests.json`.

### Procedimento preparado, ainda sem autorização real

O operador prepara **localmente** um JSON em `.secrets/solicitacao-aprovada.json`, com ACL exclusiva usuário/SYSTEM (ou modo 0600 em POSIX). Campos: kind, email, displayName, password, reason; para ORGANIZATION_USER, organizationId e role. FIRST_SUPER_ADMIN não aceita role/organizationId. Não há dados padrão ou conta real predefinida neste documento. O arquivo de solicitação contém segredo e deve ser removido após o acesso ser confirmado, respeitando os controles locais de armazenamento.

Plano sem conexão:

```text
node apps/api/scripts/bootstrap-access.mjs plan --project=wszrtvgjcgpgntsssbhd --request-file=.secrets/solicitacao-aprovada.json
```

**Somente depois de autorização específica da conta e da ativação do banco:**

```text
pnpm --filter @ethos/api build
node apps/api/scripts/bootstrap-access.mjs apply --approved --project=wszrtvgjcgpgntsssbhd --request-file=.secrets/solicitacao-aprovada.json
```

A flag não substitui a aprovação do usuário. A CLI não imprime e-mail ou token; grava `.secrets/access-handoff-<uuid>.json`, protegido e fora do Git. O handoff contém identificação, token e validade, sem senha. Acessar localmente `/verify-email#token=<valor-do-arquivo>`, sem colar o token em relatórios, depois fazer login e cadastrar MFA quando exigido. Arquivos de handoff incompletos/invalidáveis após erro devem ser revisados; não pressupor sucesso pelo simples fato de existir um arquivo.

Como o banco real não tem organizações, qualquer organização e seus ADMIN_ORGANIZACAO exigem dados e aprovação separados. PROPRIETARIO/INQUILINO recebem apenas os read_own já modelados; o bootstrap não cria portal ou vínculo com pessoa de negócio que ainda não existe no produto.

## F — acesso validado em ambiente controlado

URL usada no ensaio: `http://localhost:3099`, API de fixtures em `http://127.0.0.1:3339`. Nenhuma conta de teste foi inserida no Supabase. Os serviços e containers temporários são encerrados ao terminar a preparação; a URL não fica publicada.

| Perfil            | Resultado comprovado em fixtures                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SUPER_ADMIN       | Login redireciona para MFA; acesso completo bloqueado antes de TOTP; autorização explícita /platform/access auditada depois; organização não é concedida implicitamente |
| ADMIN_ORGANIZACAO | Dashboard e módulos administrativos da própria organização, refresh e logout                                                                                            |
| GESTOR            | Módulos permitidos; configurações administrativas negadas; refresh e logout                                                                                             |
| FINANCEIRO        | Financeiro e leituras autorizadas; configurações/manutenções negadas; refresh e logout                                                                                  |
| PROPRIETARIO      | Login/refresh/logout válidos, administração ampla bloqueada; portal futuro não existe                                                                                   |
| INQUILINO         | Login/refresh/logout válidos, administração ampla bloqueada; portal futuro não existe                                                                                   |

Passaram 12 cenários novos cobrindo os seis perfis, oito de negócio com os 13 módulos em mobile/desktop e 12 do fluxo completo de autenticação, incluindo confirmação e recuperação de senha com coletor local sem SMTP. A primeira execução do fluxo antigo terminou em timeout depois da confirmação de cadastro do MFA e voltou ao login. Após reiniciar somente as fixtures, a repetição passou. A causa não foi comprovada; não se apresenta como correção de produto. O teste passou a registrar somente paths/códigos HTTP de autenticação em falhas futuras, sem headers, bodies ou segredos. A intermitência permanece risco de teste a acompanhar.

Também passaram nove testes de integração de autenticação, sete unitários da API, 21 unitários do banco e 27 do frontend. Os 21 testes do modelo demonstrativo legado, incluídos nos 27 do frontend, não são apresentados como prova de persistência real. Schema, geração de Client, tipos e builds aplicáveis passaram; lint final registrado nas evidências de preparação. Isso não declara o bloco I pós-ativação concluído.

### Como iniciar os ensaios

Com Docker e dependências instalados, usando exclusivamente as credenciais fictícias dos scripts de testes e um PostgreSQL descartável, sem carregar o runtime real:

```text
node packages/database/scripts/rehearse-access-backup.mjs --prepare-simulation
node packages/database/scripts/simulate-access-activation.mjs
node apps/api/scripts/auth-test-server.mjs
```

Em outro terminal PowerShell:

```powershell
$env:ETHOS_API_ORIGIN='http://127.0.0.1:3339'
$env:ETHOS_WEB_ORIGIN='http://localhost:3099'
pnpm --filter @ethos/web build
pnpm --filter @ethos/web exec next start --hostname 127.0.0.1 --port 3099
```

Os testes usam suas próprias fixtures, sem credenciais reais no relatório. Não usar o servidor de fixtures para acesso real. Para repetir o primeiro bootstrap, usar um banco vazio separado na porta 55440; o teste recusa banco sem esse isolamento e recusa repetir o primeiro administrador sobre histórico existente.

### Bloqueio do runtime normal sem SMTP

A verificação privada de configuração encontrou URLs runtime, segredo de cookie e chave de criptografia presentes; WEB_ORIGIN, SMTP_HOST e SMTP_FROM não estão configurados. Nenhum valor foi exibido ou alterado. O runtime normal atual exige SMTP_HOST/SMTP_FROM até para iniciar, comportamento confirmado em teste. Assim, **não há comando de startup normal comprovadamente funcional sem SMTP nesta configuração**, mesmo depois de migrar o banco. Não se iniciou a API normal para consumir filas ou modificar sessões reais.

Proposta para aprovação adicional: modo local explícito de e-mail desabilitado, proibido em produção e limitado a host/origens de loopback, sem abrir conexão SMTP e sem consumir/recontar tentativas da outbox; preservar confirmação, senha, MFA, cookies, CSRF e RBAC. O primeiro token continuaria por handoff protegido; recuperação/novas confirmações reais não seriam anunciadas como disponíveis sem um procedimento autorizado. Esse modo ainda não foi implementado. Não preencher SMTP fictício para contornar o erro.

Depois da decisão, origem local pretendida para o acesso normal: frontend `http://localhost:3000`, API `http://127.0.0.1:3333`. Configurar origens correspondentes e carregar os segredos protegidos existentes, sem pôr conexão administrativa no ambiente da API. Essa URL pretendida não foi validada com usuário real. Para o primeiro login real ainda faltam ativação, autorização/dados da conta, confirmação controlada, decisão sobre modo local sem SMTP e, para dashboard organizacional, organização e vínculo aprovados.

## G — plano de ativação para aprovação

Recomendação: a parte de banco está tecnicamente apta à ativação controlada pelos hashes acima, condicionada a repetir preflight e manter API/worker parados. O acesso autenticado real ainda não deve ser declarado operacional. Não misturar aprovação da migration com autorização para criar usuários ou organizações.

Comandos preparados, revisáveis no executor novo:

```text
node packages/database/scripts/access-activation-plan.mjs preflight --project=wszrtvgjcgpgntsssbhd
```

**Não executado; somente após aprovação explícita:**

```text
node packages/database/scripts/access-activation-plan.mjs apply --approved --project=wszrtvgjcgpgntsssbhd
```

O executor fixa os hashes da migration e dos GRANTs, verifica projeto/TLS, seis arquivos locais com uma única migration pendente, checksums, backup e recuperação, ausência de drift e flags/associações runtime. Aplica a migration pelo Prisma, grava progresso e aplica somente o SQL técnico. Não cria contas, organizações, credenciais, novas políticas além das duas da migration ou permissões de negócio. Falha interrompe sem recuperação automática. O modo apply não foi executado nesta preparação; somente sua guarda de ausência de aprovação e o preflight somente leitura foram executados. A simulação anterior executou o mesmo Prisma deploy e os mesmos bytes de GRANTs no clone restaurado.

Após eventual ativação: confirmar seis migrations ativas/checksums, RLS ENABLE/FORCE nas 44 tabelas aplicáveis, privilégios por coluna, ausência de DELETE/BYPASSRLS/ownership runtime, grants anteriores preservados e integridade. Qualquer ensaio real de escrita deverá usar transação revertida ou outro mecanismo previamente aprovado; a aprovação do banco não permite fixtures permanentes. Não reutilizar automaticamente a associação temporária de papéis de uma etapa passada.

Provisionamento real fica separado e exige aprovação de identidade/escopo: primeiro SUPER_ADMIN ou novo usuário organizacional, organização exata, papel e motivo. Não enviar senha pelo chat. Criação de organizações exige aprovação e dados próprios; a CLI não cria uma implicitamente.

## Recuperação e riscos remanescentes

1. Preservar os dois envelopes e a chave separada; manter backups anteriores. Duas cópias no mesmo computador não protegem contra perda da máquina; destino externo continua adiado por orientação anterior, sem autorização de envio.
2. Manter API/worker parados até concluir validação. Se migration falhar, preservar erro sanitizado e histórico; a migration tem BEGIN/COMMIT explícitos. Não executar reset, db push ou reparação automática.
3. Se migration passar e GRANTs falharem, preservar relatório de progresso e interromper. O executor não tenta aplicar novamente após drift. Não remover tabelas ou apagar recibos de idempotência para recuperar.
4. Reversão de permissões deve ser específica das colunas/tabelas técnicas e depende de aprovação. REVOKE de tabela não substitui análise de privilégios de coluna. Não executar provisioning antigo para “voltar” nem revogar escritas de negócio aprovadas.
5. Restauração integral em banco real é medida excepcional, com nova autorização e janela controlada. Ensaiar primeiro isoladamente, comparar dados atuais e impedir sobrescrita de alterações posteriores ao snapshot. Não tocar objetos gerenciados do Supabase.
6. Ainda faltam o modo local sem SMTP, contas/organizações reais autorizadas e validação de login real; há intermitência E2E não reproduzida após MFA. O primeiro SUPER_ADMIN não ganha automaticamente dashboard organizacional; não existe painel global novo nem portais da 1.3.
7. Retenção do ledger e operação distribuída permanecem conforme a 0.11. Não há limpeza automática de recibos ou serviços externos novos.

**Ponto de parada:** aguardando aprovação específica para a migration/GRANTs reais e decisão sobre o modo local sem SMTP. Nenhum usuário/organização real será criado como efeito dessa aprovação de banco. H e I, commit e push permanecem pendentes. Nenhum deploy ou início da 0.12.
