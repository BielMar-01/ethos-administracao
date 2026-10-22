# Etapa 0.8 — Modelo de dados multi-tenant

## Escopo e arquitetura aprovada

Continuação da etapa 0.7, commit `767eb7f6137bfbc756f3225fd03f492c2d112cbb`. Auditoria de documentação, schema, pool e migrations executada no bloco A. O usuário aprovou:

1. Schema compartilhado `ethos`, `organizationId`, FKs compostas e RLS com negação por padrão.
2. Identidade global independente do Supabase Auth, memberships e papéis por organização. `SUPER_ADMIN` separado.
3. Toda locação pertence a uma unidade; imóvel integral usa unidade principal. Múltiplos proprietários e participantes por locação.

Sem autenticação, endpoints, frontend, seed permanente ou etapa 0.9. A estrutura técnica existente e os objetos do Supabase são preservados.

## Modelo implementado

São 34 modelos novos, além de `InfrastructureCheck`. O schema Prisma contém todos os campos, enums, relações e índices.

| Área         | Entidades e relacionamentos                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Organização  | `Organization` e `OrganizationSettings`, configuração única por organização, moeda, timezone, status, preferências                           |
| Identidade   | `User` global; `ExternalIdentity` única por provedor/subject, sem FK a `auth.users`                                                          |
| RBAC         | `OrganizationMembership` única por organização/usuário; `Role` local, `Permission` global; `MembershipRole` e `RolePermission` com revogação |
| Plataforma   | `PlatformAccessGrant` com enum exclusivo `SUPER_ADMIN`, motivo e revogação; `PlatformAuditLog` imutável                                      |
| Patrimônio   | `Owner`, `Property`, `PropertyUnit`, `PropertyOwnership` com percentual e vigência inclusiva                                                 |
| Locação      | `Tenant`, `Lease` da unidade; `LeaseTenant` distingue `PRIMARY`, `CO_RESPONSIBLE`, `OCCUPANT` e vigência                                     |
| Contratos    | `Contract` da locação e `ContractVersion` numerada, com conteúdo, hash, vigência e assinatura                                                |
| Evolução     | `LeaseRenewal` com eventual locação sucessora; `RentAdjustment` com índice, percentual, valores e aplicação                                  |
| Financeiro   | `Charge`, `Installment`, `Payment`, `PaymentAllocation`, `Receipt`; pagamentos parciais e distribuídos entre parcelas                        |
| Vistorias    | `Inspection` da unidade/locação e responsável; `InspectionReport` versionado e finalização                                                   |
| Arquivos     | `Document` com metadados, hash e exatamente um destino explícito; `Photo` do documento PHOTO/unidade, com vistoria/manutenção opcionais      |
| Manutenção   | `MaintenanceRequest`, unidade/locação, responsável, categoria, prioridade, custos e conclusão                                                |
| Notificações | `Notification` do destinatário membership, categoria, conteúdo, leitura                                                                      |
| Auditoria    | `AuditLog` com operação, entidade, instante, role do banco, autor, campos alterados e snapshots anterior/atual                               |

Arquivos possuem FKs reais, sem associação polimórfica informal, binários ou credenciais de storage. `entityType/entityId` serve exclusivamente à trilha histórica.

## Integridade e histórico

- Entidades locais têm UUID e `organizationId NOT NULL`, unicidade `(organizationId,id)` e FKs compostas entre organizações. FKs globais limitadas a organização, identidade e catálogo de permissões.
- Unicidade de códigos por organização; unidade por imóvel/código; versão por contrato/laudo. Índices para FKs, status, vencimento, competência, vigência e destinatários.
- Dinheiro `Decimal`/`NUMERIC(18,2)`, percentuais `NUMERIC(7,4)` e reajustes `NUMERIC(9,4)`. Moeda herdada da locação, sem conversão implícita. Valores negativos e datas inválidas bloqueados por checks.
- `DATE` para competência/vencimento/vigência; competência no primeiro dia do mês. `TIMESTAMPTZ(3)` para eventos. Dia de vencimento entre 1 e 31; meses curtos exigirão regra futura na API.
- Índices parciais: uma unidade principal não arquivada por imóvel, uma locação `ACTIVE` por unidade e um recibo emitido por pagamento. Cadastro futuro deve criar a unidade principal explicitamente.
- Participação individual maior que zero e até 100%; sem sobreposição do mesmo proprietário no imóvel. Soma vigente até 100%, com datas inclusivas. Cadastro parcial abaixo de 100% é permitido; completar titularidade antes de operações que a exijam depende da API.
- Parcelas somam no máximo a cobrança; ao emitir, a soma deve ser exata. Alocações exigem pagamento confirmado, cobrança emitida, mesma locação, saldo da parcela e limite do pagamento.
- Escritas de participações bloqueiam imóvel; parcelas bloqueiam cobrança; alocações bloqueiam cobrança, parcela e pagamento; recibos bloqueiam pagamento. Constraints adiáveis validam o estado final. A API deverá tratar deadlocks/serialização com retry limitado.
- Estorno exige anular recibo com motivo e preserva alocações. Não cancelar cobrança com alocações confirmadas antes de estornar pagamentos.
- FKs `RESTRICT`, sem cascata. Triggers bloqueiam exclusão física em todos os modelos novos, inclusive rascunhos. Arquivar/revogar/encerrar/cancelar substitui apagar. RBAC futuro deve ignorar vínculos revogados e roles arquivados.
- IDs, organização e criação são imutáveis. Versões contratuais, documentos, alocações e auditoria não mudam. Laudo final é imutável. Pagamento preserva núcleo financeiro; permite pendente → confirmado/estornado e confirmado → estornado. Recibo anulado não reabre.
- Núcleo da locação é imutável: reajustes/renovações são registros próprios. Relações históricas de unidades, memberships, partes e serviços não podem ser movidas para outro pai.
- Vistoria/manutenção devem corresponder à unidade da locação; fotos devem corresponder ao documento e à unidade do evento.
- Mutação local gera auditoria automática, inclusive SQL administrativo. Snapshots protegidos por RLS contêm dados pessoais: retenção, minimização e acesso precisam de política futura.

## RLS, Prisma e pool — limitações e solução antes da aplicação

A credencial disponível tem `BYPASSRLS` e `CREATEROLE`, sem ser superusuária. `FORCE ROW LEVEL SECURITY` não neutraliza `BYPASSRLS`. Ela serve para migrations e **não é apropriada à futura API tenant**.

Todas as 34 tabelas recebem `ENABLE` e `FORCE ROW LEVEL SECURITY`. Políticas locais usam `ethos.current_organization_id()`, que retorna NULL quando o contexto está ausente, vazio ou malformado. `Organization` compara a própria PK. Tabelas globais de identidade/permissões/plataforma não têm políticas comuns: negam acesso à role não privilegiada. `AuditLog` permite apenas leitura local; inserção somente pela trigger.

`withOrganization(prisma, context, callback)` abre uma transação interativa, recusa roles superusuárias/`BYPASSRLS`, valida UUIDs, define contexto com `set_config(..., true)`, verifica membership e organização ativos e define o autor. O callback usa exclusivamente o `tx` recebido. Contexto termina com commit/rollback, sem `SET` persistente ou vazamento no pool. O helper não implementa autenticação nem RBAC de operações.

O contexto deve vir de identidade autenticada e autorização decidida no servidor. Nunca usar `organizationId` do cliente como autorização. Quem controla SQL da role pode definir GUCs: RLS não autentica parâmetros de sessão. Não expor credenciais, raw SQL arbitrário ou acesso direto ao banco aos clientes. A API precisará validar identidade, organização, membership, permissões, recursos, jobs e arquivos.

Testes criam role `NOLOGIN NOSUPERUSER NOBYPASSRLS` dentro da transação, concedem acesso somente ao schema novo, usam `SET LOCAL ROLE` e revertem tudo, incluindo role/grants. Nenhuma role permanente do Supabase é alterada. O provisioning futuro deve fornecer credencial mínima, sem ownership/BYPASSRLS/CREATEROLE nem possibilidade de assumir a role administrativa. O helper recusa a credencial atual.

Auditoria usa função `SECURITY DEFINER` exclusiva de trigger, objetos qualificados, `search_path = pg_catalog`, execução pública revogada e proprietário administrativo capaz de gravar apesar de RLS forçado. Não há função pública de bypass ou flag `SUPER_ADMIN` que abra dados de outras organizações. Triggers de integridade executam como invocador.

`Role` rejeita código `SUPER_ADMIN`. Grants de plataforma e revogações geram `PlatformAuditLog`. Revogação exige contexto transacional `ethos.platform_actor_user_id` válido e `ethos.platform_operation_reason`, além de credencial administrativa. Autorização e motivo de acessos privilegiados serão responsabilidade do futuro serviço de plataforma; SELECT não gera auditoria por trigger.

Prisma não representa RLS/checks/triggers no schema declarativo: essas regras permanecem em SQL versionado e testes, sem substituição por `db push`. FKs ignoram RLS ao verificar integridade; a API deve traduzir erros para respostas genéricas, evitando revelar existência de objetos de outras organizações.

Referências: [PostgreSQL 17 — RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [SET LOCAL](https://www.postgresql.org/docs/17/sql-set.html), [Prisma — transações](https://www.prisma.io/docs/orm/prisma-client/queries/transactions).

## Migration e verificações

- Preservada: `20261022000000_init_infrastructure`.
- Nova: `20261022010000_multi_tenant_model`, SQL aditivo transacional restrito a `ethos`.
- DDL base gerado offline por `migrate diff --from-empty --to-schema prisma/schema.prisma --script`, retirando somente as instruções que recriariam a estrutura técnica existente. Sem shadow database no Supabase.
- SQL completo ensaiado com fixtures e role sem bypass em transação revertida antes de aplicar. A remoção do schema de ensaio ocorre pelo rollback da sua criação.
- Aplicação por `migrate deploy`, sem reset, db push ou exclusão/reescrita de objetos preexistentes.
- O teste compara 186 objetos relacionais não gerenciados por nome, tipo e OID antes/depois. Essa evidência de catálogo não é backup nem comparação de todo o conteúdo das tabelas do Supabase.

## Testes reproduzíveis

| Comando no pacote database                    | Verificação                                            |
| --------------------------------------------- | ------------------------------------------------------ |
| `pnpm db:validate` / `pnpm db:generate`       | Schema/client                                          |
| `pnpm db:status` / `pnpm db:check`            | Migrations, conexão real e checksums                   |
| `pnpm build` / `pnpm typecheck` / `pnpm test` | Compilação e regressão servidor                        |
| `pnpm db:test:integration`                    | Integridade/RLS e contexto Prisma com pool reutilizado |

`node scripts/integration.mjs --rehearsal` exige ausência de `ethos`; execução normal testa banco aplicado. Relatório em `docs/etapa-0.8-tests.json`. Fixtures usam UUIDs aleatórios e rollback, sem limpeza por DELETE/TRUNCATE. Scripts precisam de credencial administrativa para a role temporária; verificações RLS efetivas executam sem bypass.

## Pendências para 0.9

- Provisionar credencial runtime mínima e separar acessos administrativos/tenant. Não liberar políticas globais genéricas para provisionar identidades/organizações.
- Implementar autenticação, resolução server-side de organização, membership/RBAC e autorização de jobs/arquivos. Rejeitar usuário global desabilitado na camada de identidade.
- Definir transições completas, ativação com participantes obrigatórios, copropriedade operacional, cálculo de aluguel vigente, reajustes/renovações e repasses. Enums não constituem motor jurídico/financeiro.
- Unicidade de locação ativa não detecta toda sobreposição futura de datas/rascunhos. Agendamento deverá serializar unidade e validar intervalos; sem exclusion constraint de agenda nesta entrega.
- Sem conciliação, juros, descontos, chargeback, documentos fiscais ou integrações externas.
- Testes com rollback não deixam fixtures visíveis entre conexões. Bloqueios são exercitados/revisados, mas teste de carga/conflitos com duas transações commitadas deve ser executado em banco descartável antes de liberar financeiro.
- Definir retenção/privacidade, expurgos legais e auditoria explícita de consultas privilegiadas; nenhuma etapa 0.9 iniciada automaticamente.

## Estado real da execução

### Banco e migrations

- Conexão real confirmada: PostgreSQL 17.11, `SELECT 1 = 1`.
- Migration `20261022010000_multi_tenant_model` aplicada por `migrate deploy`; `migrate status` informa banco atualizado. Checksum dela e da migration 0.7 conferem.
- A primeira tentativa atingiu o limite local de 60 segundos; PostgreSQL reverteu a transação e confirmou ausência de tabelas de negócio e sessões ativas. Foi marcada como revertida com `migrate resolve --rolled-back`, sem reset. O limite exclusivo de deploy foi ampliado para 300 segundos e a reaplicação concluiu. A tentativa revertida permanece visível no histórico; não é migration pendente.
- `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code --script`: código 0, migration vazia. Essa verificação declarativa é complementada por testes SQL de RLS/triggers/checks.
- Estado após testes: 34 tabelas novas, **zero registros de negócio**, zero registros técnicos e zero roles temporárias. Sem seed permanente.
- Catálogo relacional não gerenciado preservado: 186 objetos; SHA-256 antes/depois `cebeb792c6bfb14590ee62e1001fbe90d7f0fd47498c6ad6283df5f7954bcc33`.

### Validações executadas

| Verificação                               | Resultado real                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ensaio integral da migration com rollback | 14 grupos aprovados, incluindo role sem bypass                                                                                                               |
| Integridade/RLS sobre banco aplicado      | 14 grupos aprovados; relatório JSON versionado                                                                                                               |
| Prisma interativo e pool de uma conexão   | 9 verificações aprovadas: bloqueio de credencial privilegiada, contexto inválido, membership, organização suspensa, auditoria e limpeza após rollback/commit |
| Testes existentes de `@ethos/database`    | 9 aprovados                                                                                                                                                  |
| Teste Fastify/API                         | 1 aprovado                                                                                                                                                   |
| Schema validate e generate                | Aprovados                                                                                                                                                    |
| Database typecheck e build                | Aprovados                                                                                                                                                    |
| API typecheck e build                     | Aprovados                                                                                                                                                    |
| Status/checksums/conectividade            | Aprovados                                                                                                                                                    |
| Diff declarativo                          | Vazio, código 0                                                                                                                                              |

Não há lint real configurado para database/API; o placeholder de lint não é contado como validação. Testes com Prisma verificam o estabelecimento de contexto numa transação real sob role sem bypass; o wrapper público recusa a credencial administrativa disponível. Validação integral de uma conexão runtime própria aguarda seu provisioning na etapa seguinte.

### Arquivos da entrega

- Modificados: `packages/database/prisma/schema.prisma`, `packages/database/package.json`, `packages/database/.env.example`, `packages/database/src/index.ts`, `packages/database/scripts/prisma.mjs`, `packages/database/scripts/check.mjs`.
- Criados: migration `20261022010000_multi_tenant_model/migration.sql`, `packages/database/src/organization-context.ts`, `packages/database/scripts/integration.mjs`, `packages/database/scripts/context-integration.mjs`, este documento e `docs/etapa-0.8-tests.json`.
- `.gitignore` revisado: já protege `.env`, variantes locais, dependências, builds e client gerado. Não precisou de alteração. Nenhum objeto Supabase preexistente ou código de frontend/API foi modificado.
- Revisão de segredos: 141 arquivos versionáveis comparados privadamente com as credenciais locais; zero correspondências e nenhum `.env` incluído. `git diff --check` aprovado e autenticação de leitura do remoto confirmada por `git fetch origin main`.
- Commit solicitado: `feat(database): implementa modelagem multi-tenant da Ethos`. Hash e resultado efetivo do push são apresentados no relatório final da execução, após as verificações e publicação.
