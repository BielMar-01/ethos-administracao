# Etapa 0.10 — Integração Frontend + API + PostgreSQL

Estado: blocos A–H implementados e validados em PostgreSQL descartável. **Supabase real inalterado; ativação de escrita de negócio pendente de aprovação explícita.** Base: `cce60fa8aaac4518a1e69e88b9bf441366980a2d`. Sem deploy, migration nova ou início da etapa 0.11.

## Escopo e sequência executada

A auditoria leu as etapas 0.6.5–0.9.1, os 13 módulos, Prisma, triggers, RLS, sessões e RBAC. A consulta inicial somente leitura confirmou runtime com SELECT em 29 tabelas e zero INSERT/UPDATE/DELETE. Foram consultados os guias instalados de Next para Route Handlers e BFF conforme `apps/web/AGENTS.md`.

Após aprovação condicionada, os privilégios foram ensaiados apenas em PostgreSQL 17.11 Docker, publicado em loopback, banco `ethos_auth_test`, com as cinco migrations existentes. Todas as fixtures HTTP/navegador são locais e descartáveis. Os ensaios SQL/contexto usam rollback. Nenhum dado fictício foi inserido no Supabase.

B criou `@ethos/contracts`, guards compartilhados, repositórios/serviços, validação Zod, BFF, cliente HTTP e cache por organização. C integrou proprietários, imóveis/unidades/coparticipações, inquilinos e locações/participantes. D integrou contratos/versões, renovações/reajustes, vistorias/laudos, manutenções e metadados de documentos/fotos. E integrou cobranças/parcelas, pagamentos/alocações/recibos e indicadores. F integrou painel, agenda, relatórios, notificações e configurações. G executou as verificações abaixo; H registra a entrega e a proposta de privilégios separada da ativação.

## Módulos e regras

| Área                       | Persistência e comportamento                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proprietários              | Listar, pesquisar, paginar, cadastrar, editar, detalhar e arquivar; documentos vinculados                                                                                    |
| Imóveis                    | Imóvel com unidade principal automática; unidades adicionais, coproprietários percentuais e documentos/fotos da unidade                                                      |
| Inquilinos                 | Cadastro, edição, detalhes, busca/paginação e arquivamento com proteção de vínculos ativos                                                                                   |
| Locações                   | Sempre de unidade; titular obrigatório, corresponsáveis/ocupantes, ativar/encerrar/cancelar; termos originais imutáveis                                                      |
| Contratos                  | Rascunho, versões append-only numeradas no servidor, registro manual de assinatura e encerramento                                                                            |
| Renovações/reajustes       | Fluxos propor/aprovar/aplicar/cancelar nos detalhes da locação; sucessora rastreável, aluguel original preservado                                                            |
| Vistorias                  | Agendamento/conclusão e laudos versionados; laudo final imutável                                                                                                             |
| Manutenções                | Abrir, editar durante operação, iniciar/concluir/cancelar; custos Decimal e metadados                                                                                        |
| Documentos/fotos           | Metadados vinculados a um pai autorizado; sem upload, armazenamento de conteúdo ou download externo                                                                          |
| Financeiro                 | Cobrança em rascunho exige parcelas exatas para emissão; pagamento registrado manualmente, confirmado e alocado; recibos com snapshot e anulação; estorno preserva histórico |
| Dashboard                  | Contagens e valores reais; widgets financeiros dependem de `finance.read`; carteira vazia retorna zero                                                                       |
| Agenda/relatórios          | Vencimentos, vistorias e renovações derivados dos registros; relatórios de carteira, ocupação e financeiro por período                                                       |
| Notificações/configurações | Avisos gerados atomicamente pelas operações, restritos ao destinatário; nome/fuso/preferências da organização, sem edição de segurança                                       |

As listagens usam busca/filtros/paginação/ordenação no servidor. A interface tem loading, vazio, erro, sucesso, detalhes, seletores de referências paginados e confirmações de ações. Rotas administrativas não usam DemoProvider nem fallback demonstrativo. Código demonstrativo antigo permanece isolado, sem uso pelas 13 páginas, com seus testes de regressão.

Não há DELETE de negócio. Arquivamento preserva linhas e bloqueia vínculos incompatíveis. ContractVersion, Document e PaymentAllocation são append-only. Lease não permite reescrever unidade/datas/aluguel base. Recibo precisa ser anulado antes do estorno; motivo fica no recibo e na notificação da operação. Triggers continuam responsáveis pelas invariantes e auditoria protegida.

Dinheiro trafega como string decimal e usa Prisma.Decimal/PostgreSQL numeric; não passa por ponto flutuante. Datas civis são ISO date; eventos são instantes UTC. Receita prevista/alocada/saldo são por competência; caixa é por data de pagamento no fuso organizacional. Múltiplas moedas na mesma organização produzem conflito explícito, sem somar moedas diferentes ou inventar câmbio.

## Contratos de API

Base Fastify `/api/v1`; navegador usa `/api/business` same-origin, com allowlist de caminhos e métodos. Autenticação existente continua em `/api/auth`.

Recursos: `owners`, `properties`, `units`, `ownerships`, `tenants`, `leases`, `participants`, `contracts`, `versions`, `renewals`, `adjustments`, `charges`, `installments`, `payments`, `allocations`, `receipts`, `inspections`, `inspection-reports`, `maintenance`, `documents`, `photos`.

- `GET /:resource`: `{success:true,data:Record[],meta:{page,pageSize,total,totalPages}}`.
- `GET /:resource/:id`: `{success:true,data:Record}`.
- `POST /:resource`: criação estrita e 201. Campos calculados/protegidos não são aceitos.
- `PATCH /:resource/:id`: alteração limitada; recursos históricos rejeitam edição genérica.
- `POST /:resource/:id/:action`: ação permitida pela definição; nunca proxy arbitrário.
- Erros: `{success:false,error:{code,message,fields?},requestId?}`; sem SQL, credenciais ou valores de entrada nos erros.

Filtros: `page` (1–100000), `pageSize` (1–100), `q` (até 120), `sort` allowlist, `direction`, `archived` (false/true/all), `status` enum do recurso, `parentId`, `parentResource`, `from`/`to`. Ordenação estável por ID. Documentos exigem pai explícito. Campos desconhecidos e `organizationId` do corpo são rejeitados. `packages/contracts/src/index.ts` é a definição executável dos campos, enums, limites e ações.

| Recurso                         | Ações                 |
| ------------------------------- | --------------------- |
| owners/properties/units/tenants | archive               |
| ownerships/participants         | end (fim de vigência) |
| leases                          | activate/end/cancel   |
| contracts                       | sign/terminate        |
| renewals/adjustments            | approve/apply/cancel  |
| charges                         | issue/cancel          |
| payments                        | confirm/reverse       |
| receipts                        | void                  |
| inspections                     | complete              |
| inspection-reports              | finalize              |
| maintenance                     | start/complete/cancel |

Complementos: `GET /dashboard`, `GET /finance/summary`, `GET /reports/{portfolio|finance|occupancy}`, `GET /calendar?from=...&to=...` (até 366 dias e limite por fonte), `GET /notifications` paginado, `POST /notifications/:id/read`, `GET /settings`, `PATCH /settings`.

## Isolamento, RBAC e conexões

A organização vem da sessão autenticada; o cabeçalho `x-ethos-context` apenas detecta abas desatualizadas e nunca seleciona o tenant. `withOrganization` valida membership ativo e organização ativa, recusa papel privilegiado e configura GUCs transaction-local na mesma conexão. Leituras usam RepeatableRead, escritas Serializable. Repositórios recebem exclusivamente a transação e o contexto confiável, com referências verificadas na mesma organização e chaves estrangeiras compostas.

As permissões são recalculadas dentro da transação a partir dos vínculos ativos e intersectadas com os templates RBAC existentes. Recursos usam seu prefixo (`owners`, `properties`, `tenants`, `leases`, `contracts`, `finance`, `inspections`, `maintenance`); versões/renovações/reajustes usam o prefixo do pai. Documentos exigem read/update no pai. Ações de encerramento/estorno/arquivamento usam `.archive`; demais ações usam `.update`. `read_own` não equivale a `.read`: PROPRIETARIO e INQUILINO continuam sem administração ampla. SUPER_ADMIN continua separado e não ganha vínculo organizacional implícito.

CSRF/origem/cookies HttpOnly permanecem obrigatórios. Cache tem chave de organização e provider remonta por usuário/organização. Sessão perdida/troca detectada provoca navegação completa; refresh é compartilhado e limitado. Mutação não é repetida após falha de rede ambígua. Retry servidor ocorre somente após rollback por serialização/deadlock ou colisão de numeração de versão, com limite de três tentativas.

Prisma.create envia `createdAt` por padrão e conflita com INSERT mínimo por coluna. A solução preserva a restrição: INSERT parametrizado no repositório, com tabelas/enums de registry fechado, identificadores validados e valores bindados, omitindo createdAt. Não há ampliação administrativa para contornar Prisma. Erros de constraints adiadas ao commit também são traduzidos para conflito.

## Privilégios: relatório para decisão antes do Supabase

O arquivo `packages/database/scripts/propose-business-runtime.sql` foi aplicado duas vezes em banco isolado e permanece **não aplicado no Supabase**. A revisão removeu 29 concessões INSERT desnecessárias da proposta inicial: estados e datas de transição, campos de assinatura/encerramento/leitura, referências não usadas e moeda configurável. Defaults e ações específicas preservam o fluxo.

A lista exata de tabelas/colunas, SHA-256 do SQL e diferença entre leitura atual e escrita proposta estão em [etapa-0.10-privileges.md](./etapa-0.10-privileges.md). INSERT por coluna em 23 tabelas; UPDATE limitado em 21 tabelas. Sem DELETE/TRUNCATE, DDL, BYPASSRLS, ownership, grants de papel ou mudanças de RLS. Sem escrita em identidade, usuários, RBAC ou auditoria. SELECT/USAGE existentes permanecem.

**Riscos remanescentes:** RLS depende de contexto definido por backend confiável. Credenciais runtime não podem ser expostas: quem possuir acesso SQL poderá tentar fornecer GUCs de outro membership válido; RLS não substitui autenticação/RBAC nem protege contra comprometimento do próprio servidor. O aumento de permissões amplia a superfície de escrita. RBAC de API e invariantes em SQL são camadas complementares. A auditoria não transforma dados informados pelo operador em comprovação externa de pagamento/assinatura.

Provisioning 0.9.1 continua intencionalmente com perfil de leitura, preservado para não alterar ativação real nesta entrega. Reexecutá-lo depois de uma futura concessão de negócio revogará escritas; o runbook futuro deverá identificar explicitamente o perfil ativo e adaptar verificadores antigos, que esperam somente leitura. A ausência de escrita retorna 503 `PERSISTENCE_NOT_ENABLED`, sem fallback administrativo; esse caminho foi testado.

Antes de ativar: nova aprovação específica do SQL e hash, confirmar Project ID/TLS validado, backup/restauração e ACLs anteriores, aplicar só a proposta aprovada e repetir smoke tests autorizados sem fixtures de produção. Não há comando automático de ativação nem alteração de env runtime nesta etapa.

## Validações executadas

| Verificação                    | Resultado                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Privilégios isolados           | 31 verificações; incluindo lista exata de INSERT nas 23 tabelas, identidade/RBAC/auditoria protegidos e RLS positivo/negativo                  |
| Integração HTTP + persistência | 18 grupos no teste nativo; inclui concorrência de versões/alocações, histórico, RBAC, organizações A/B, notificações e ausência de privilégios |
| Integridade SQL preexistente   | 14 verificações; rollback de fixtures e catálogo não gerenciado preservado                                                                     |
| Contexto Prisma/pool           | 9 verificações; sem contexto residual em commit/rollback                                                                                       |
| API unitária e autenticação    | 3 testes unitários + 9 testes de integração aprovados                                                                                          |
| Banco unitário                 | 14 testes aprovados                                                                                                                            |
| Frontend                       | 25 testes nativos, incluindo 4 novos de contratos/transporte e 21 de regressão do código demonstrativo isolado                                 |
| Navegador de negócio           | 7 verificações; CRUD/recarga, arquivamento, 13 módulos em 360/1440 px, tema e troca de organização                                             |
| Navegador de autenticação      | 12 verificações; MFA, cookies, recuperação, sessões e telas 360/768/1440 px                                                                    |
| Prisma                         | validate, generate e status no banco local: cinco migrations, em dia                                                                           |
| Qualidade                      | lint, typecheck e build aprovados para contracts/database/api/web                                                                              |

Evidências sem PII/segredos: `etapa-0.10-privilege-tests.json`, `etapa-0.10-api-tests.json`, `etapa-0.10-browser-tests.json`. Resultados de grupos não são contados como 18 casos nativos independentes. Falhas encontradas e corrigidas: INSERT Prisma explícito de createdAt, códigos de constraints adiadas, data de estorno anterior ao pagamento em fixture, tradução de erros de serialização aninhados e seletores de navegador. Nenhuma correção exigiu migration.

Comandos reproduzíveis exigem PostgreSQL descartável preparado conforme os scripts existentes e envs locais explícitos (não reutilizar URLs do Supabase): `pnpm --filter @ethos/database db:test:business`, `pnpm --filter @ethos/api test:business`, `pnpm --filter @ethos/web test:business:browser`. O servidor de fixture `apps/api/scripts/auth-test-server.mjs` fixa conexão loopback e rejeita produção. As credenciais fixas desse fixture são exclusivamente de teste local.

## Estado real e pendências

Supabase `wszrtvgjcgpgntsssbhd` foi preservado. As cinco migrations são as da etapa 0.9.1; nenhuma migration adicional foi criada/aplicada. A validação de status desta entrega foi no PostgreSQL descartável, não uma alegação de nova ativação real. Não há deploy ou mudança de credenciais reais. A carteira real permanece sujeita aos grants de leitura existentes.

Pendências: aprovação e runbook para escrita real; smoke test posterior sob autorização; política operacional de provisionamento de usuários/organizações permanece separada; storage de arquivos, assinatura digital, gateways, exportações/PDF, relatórios personalizados e eventos avulsos não foram implementados. Recibos e pagamentos são registros administrativos manuais. O frontend usa identificadores nas referências detalhadas quando não dispõe do nome, sem inventar dados. Não se iniciou 0.11.

Git: commit solicitado `feat(integration): integra modulos administrativos com API e banco`; hash e resultado de push serão apresentados após execução, para evitar registrar sucesso antecipado.

## Arquivos criados e modificados

- `apps/api/package.json`
- `apps/api/src/app.ts`
- `apps/api/src/auth/routes.ts`
- `apps/web/app/(dashboard)/app/dashboard/page.tsx`
- `apps/web/app/(dashboard)/app/layout.tsx`
- `apps/web/components/shared/operations-pages.tsx`
- `apps/web/components/shared/portfolio-pages.tsx`
- `apps/web/components/shared/system-pages.tsx`
- `apps/web/lib/auth-client.ts`
- `apps/web/package.json`
- `packages/database/package.json`
- `packages/database/src/index.ts`
- `packages/database/src/organization-context.ts`
- `pnpm-lock.yaml`
- `apps/api/src/auth/guards.ts`
- `apps/api/src/business/repository.ts`
- `apps/api/src/business/routes.ts`
- `apps/api/src/business/service.ts`
- `apps/api/tests/business.integration.mjs`
- `apps/web/app/api/business/[...path]/route.ts`
- `apps/web/components/business/complement-pages.tsx`
- `apps/web/components/business/finance-workspace.tsx`
- `apps/web/components/business/record-editor.tsx`
- `apps/web/components/business/resource-panel.tsx`
- `apps/web/components/business/summary-panel.tsx`
- `apps/web/components/providers/business-provider.tsx`
- `apps/web/lib/business-client.ts`
- `apps/web/lib/business-view.ts`
- `apps/web/tests/business-browser.mjs`
- `apps/web/tests/business.test.mjs`
- `docs/etapa-0.10-api-tests.json`
- `docs/etapa-0.10-browser-tests.json`
- `docs/etapa-0.10-privilege-tests.json`
- `docs/etapa-0.10-privileges.md`
- `docs/etapa-0.10.md`
- `packages/contracts/package.json`
- `packages/contracts/src/index.ts`
- `packages/contracts/tsconfig.json`
- `packages/database/scripts/propose-business-runtime.sql`
- `packages/database/scripts/test-business-grants.mjs`

Limpeza concluída: servidores HTTP de ensaio encerrados e container PostgreSQL desta etapa removido com seu volume. Evidências preservadas nos arquivos versionados acima.
