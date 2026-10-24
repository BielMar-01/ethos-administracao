# Etapa 0.11 — segurança, qualidade, integridade e estabilidade

Estado: A–J implementados e validados no escopo isolado descrito abaixo; commit e push são verificados no relatório final da execução. A ativação real da nova migration/RLS/GRANTs continua sem autorização. Nenhuma conexão ao Supabase foi aberta nesta etapa. Base: `329b5a2faab3a02e9f9f06eb9e4bbf1c9df0ae93`.

## A — arquitetura e baseline

Monorepo pnpm 11/Turborepo com quatro pacotes: Next 16/React 19 em apps/web, Fastify 5 em apps/api, @ethos/database com Prisma 7.10.1/adapter-pg e @ethos/contracts com Zod/DTOs compartilhados. Frontend usa BFF com allowlist, cookies de autenticação, contexto esperado e cache por organização; API resolve organização pela sessão e usa transações Prisma com contexto local e RLS. Banco de aplicação: ethos, ethos_identity e ethos_technical; cinco migrations existentes. As 13 páginas usam persistência real, com código demonstrativo antigo isolado da navegação.

Foram consultadas as decisões relevantes das etapas 0.7, 0.8, 0.9, 0.9.1, 0.10 e 0.10.1, scripts de provisioning/ativação/verificação, middleware, sessões, RBAC, serviços, contratos e exemplos de ambiente. O histórico 0.10.1 confirma 23 tabelas com INSERT e 21 com UPDATE limitado, RLS habilitada/forçada, nenhum DELETE/BYPASSRLS tenant e associação administrativa com SET=false/INHERIT=false. Não se apresenta esse histórico como nova consulta ao ambiente real.

Autenticação própria usa Argon2id, tokens **opacos aleatórios** com hashes persistidos (não JWT), refresh rotativo, replay detection, cookies HttpOnly/Secure em produção, CSRF vinculado à sessão e TOTP/recuperação. SUPER_ADMIN é global e requer MFA; papéis organizacionais são ADMIN_ORGANIZACAO, GESTOR, FINANCEIRO, PROPRIETARIO e INQUILINO. read_own não autoriza administração ampla. Não há proposta de migrar para JWT nesta revisão.

Segredos: .env, .secrets, .backups e .tools são ignorados pelo Git; exemplos não contêm valores reais. CLI administrativo e API runtime são separados. TLS verifica CA/hostname; contexto organizacional depende do backend confiável. RLS não autentica um invasor que detenha credencial SQL. Nenhum valor de ambiente privado foi impresso. SMTP/outbox existem no código, mas os testes injetam entrega controlada e não enviam e-mails reais.

Baseline executada antes de correções:

| Verificação                            | Resultado                                                       |
| -------------------------------------- | --------------------------------------------------------------- |
| Banco unitário                         | 18 aprovados                                                    |
| API unitária                           | 3 aprovados                                                     |
| Frontend nativo                        | 25 aprovados, sendo 21 de código demonstrativo isolado          |
| Autenticação em PostgreSQL descartável | 9 aprovados                                                     |
| Integração HTTP/persistência           | 18 grupos aprovados dentro de um teste nativo                   |
| Dependências                           | pnpm audit executado: 0 críticos, 1 alto, 6 moderados, 4 baixos |
| Versões disponíveis                    | pnpm outdated executado; registro sem atualização automática    |

Evidências: etapa-0.11-dependencies-before.json e etapa-0.11-outdated-before.json. Exit code 1 desses comandos indica achados/versões disponíveis, não aprovação sem vulnerabilidades. Lodash vulnerável chega por Prisma Studio/visx; fast-uri vulnerável chega pelos compiladores Fastify/AJV e ferramentas. A ausência de criticidade no registro não substitui análise de alcance. Atualizações propostas são pontuais para versões corrigidas, sem migração automática de major.

## Matriz inicial de riscos e plano

| ID  | Risco                                                                         | Prioridade                         | Plano / bloco                                                                                                              |
| --- | ----------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| R1  | Provisioning 0.9.1 revoga escrita aprovada                                    | Alta                               | B: perfil explícito, ACL exata, idempotência e teste de excesso/reversão, apenas isolado                                   |
| R2  | Atualização atrasada pode sobrescrever edição sem precondição do cliente      | Alta                               | E: comparar opções de concorrência otimista e verificar necessidade de decisão arquitetural                                |
| R3  | Timeout ambíguo em criação financeira exige idempotência durável              | Alta                               | E: estudar contratos/chaves naturais versus armazenamento técnico; pedir aprovação antes de migration ou mudança relevante |
| R4  | Dependências transitivas com alertas                                          | Alta/moderada/baixa conforme aviso | F/J: alcance, patches delimitados, audit posterior e regressão                                                             |
| R5  | Swagger público, documentação incompleta e correlação controlada pelo cliente | Média                              | F/I: revisar acesso, schemas, limites, IDs e logs sem PII                                                                  |
| R6  | Cobertura parcial da matriz dos seis perfis                                   | Alta                               | D: matriz negativa/positiva por recurso e operação, sem implementar portal read_own novo                                   |
| R7  | Cópias de backup apenas no mesmo computador                                   | Alta operacional                   | I: procedimento de criptografia e restauração local; destino externo depende de orientação explícita                       |
| R8  | SMTP/manutenção podem escrever se iniciar app com credencial real             | Alta operacional                   | Todos: nunca iniciar app/worker com env real; fixtures loopback e entrega controlada                                       |
| R9  | Testes antigos podem sobrescrever evidências históricas                       | Baixa                              | Preservar relatórios anteriores; resultados novos com prefixo 0.11                                                         |

## Critérios por bloco

| Bloco | Aceite                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Git/inventário, baseline executada, avisos e plano documentados                                                                         |
| B     | Duas reconciliações iguais, ACLs aprovadas preservadas, excesso negado/revogado, roles/associações protegidos; nenhum provisioning real |
| C     | Sessões revogadas/expiradas, senha, refresh/replay, CSRF, MFA e suspensão falham com segurança; sem e-mail real                         |
| D     | Matriz de papéis/recursos/operações, IDOR e filtros cruzados negativos                                                                  |
| E     | Atomicidade, concorrência e idempotência demonstradas; arquitetura/migration sensível exige aprovação prévia                            |
| F     | Abuso, schemas, paginação, headers, logs e OpenAPI verificados; alertas classificados/mitigados                                         |
| G     | 13 módulos em navegador, responsividade/tema/erros/sessão/armazenamento e sem fallback fictício                                         |
| H     | Métricas moderadas isoladas de latência, memória, pool, timeout e recuperação; sem carga real                                           |
| I     | Criptografia/integridade/restauração e runbook de retenção; nenhum envio externo sem aprovação                                          |
| J     | Regressão completa, lint/tipos/builds, diff sem segredos, commit e push somente com critérios atendidos                                 |

Não haverá deploy, integração externa, funcionalidade imobiliária nova ou início de 0.12. Se uma decisão bloquear requisito, ela será apresentada sem declarar a etapa concluída nem publicar um commit de conclusão antecipado.

## B — provisioning com perfil explícito

`runtime-profiles.mjs` gera uma única transação para os perfis explícitos `auth-only` e `business-0.10.1`, sem conectar ou criar senhas. O perfil de negócio reconcilia ACLs e reaplica a lista exata de GRANTs cujo hash foi aprovado em 0.10.1. Isso elimina permissões excessivas sem expor uma janela de revogação parcial. Não há alteração de políticas, dados, ownership ou associações administrativas. O SQL aprovado de negócio não foi alterado.

O arquivo legado `prepare-auth-runtime.sql` agora recusa execução se detectar privilégios de negócio ativos sem o perfil explícito. Chamadas antigas de `auth-activation.mjs` falham antes de revogar escritas, em vez de fazer downgrade silencioso. `provision-auth.sql` continua identificado como bootstrap histórico, usado pelo setup isolado; não é um reconciliador de produção. O verificador runtime exige `--profile` e usa privilégios de coluna, pois has_table_privilege(INSERT) não detecta os INSERTs limitados aprovados.

Comandos de plano/verificação (nenhum autorizado para execução de provisioning real):

```text
pnpm --filter @ethos/database db:runtime:plan business-0.10.1
pnpm --filter @ethos/database db:test:runtime-profiles
node packages/database/scripts/verify-auth-runtime.mjs --local-test --profile=business-0.10.1
```

Resultado: seis cenários de reconciliação aprovados, duas repetições com ACL idêntica, proteção contra downgrade, remoção de DELETE/UPDATE protegido/USAGE de identidade excessivos, associações e flags preservadas. Depois disso, 31 verificações de escrita/RLS passaram e logins runtime locais foram verificados. Lint do banco e 19 testes unitários passaram. Evidências: etapa-0.11-provisioning-tests.json e etapa-0.11-privilege-tests.json. Não foi executado provisioning no Supabase.

## C — autenticação e sessões

Os nove testes de autenticação existentes passaram na baseline, cobrindo Argon2id, política de senha, registro/confirmação/reset, rotação/replay, MFA/TOTP/recovery, CSRF, cookies de produção, rate limit e logs. Quatro novos testes confirmam revogação em todos os dispositivos, rejeição de access/refresh antigos após desativação, CSRF incorreto sem consumo do refresh, expiração absoluta, respostas genéricas para contas inexistentes e suspensão de vínculo/organização com sessão previamente válida.

A suspensão devolve 401 porque os triggers existentes revogam imediatamente as sessões. A expectativa inicial de 403 foi corrigida no teste; não se alterou a implementação para fazê-lo passar. A simulação inicial de expiração por UPDATE violou session_dates; foi substituída pelo relógio controlado, respeitando a constraint. Nenhum desses ajustes representa falha de segurança do produto. Não houve envio real de e-mail ou alteração do mecanismo de tokens. Resultado: quatro testes novos aprovados, etapa-0.11-security-tests.json.

## D — RBAC e isolamento

A matriz nova exercita os cinco papéis organizacionais nos 21 recursos de negócio e nos complementos, cobrindo listagens, mutações negadas e escritas positivas de GESTOR/FINANCEIRO. Também verifica IDs estrangeiros em leitura/edição, organização inserida no payload, cabeçalho de contexto trocado, filtros/paginação/ordenação e campos protegidos. PROPRIETARIO/INQUILINO continuam sem acesso administrativo amplo; nenhum portal read_own novo foi criado.

SUPER_ADMIN foi testado com MFA efetivamente configurado e validado no fixture: sem vínculo, não seleciona a organização nem ganha acesso a dados implicitamente. O resultado completo, com cada combinação testada, está em etapa-0.11-authorization-tests.json. Não existem endpoints de operações em lote; não se inventou uma funcionalidade para esse item. As mutações de múltiplos registros existentes permanecem cobertas pelas transações e pelos testes de integridade.

## E — diagnóstico e decisão necessária

O probe inicial de concorrencia (evidencia JSON preservada) reproduziu no banco descartável:

1. Dois editores leem o mesmo proprietário; o segundo PATCH baseado na cópia antiga sobrescreve o primeiro com HTTP 200. Não há precondição/revisão do cliente.
2. Dois POSTs iguais de versão contratual, com o mesmo cabeçalho idempotency-key, criam versões 1 e 2. Esse cabeçalho não faz parte do contrato atual e é ignorado; portanto não se afirma quebra de uma garantia já existente, mas o requisito de reprocessamento seguro da 0.11 ainda não está atendido.
3. A hipótese inicial de duplicação de alocação financeira foi rejeitada: a segunda tentativa recebeu 409 pela chave única e permaneceu uma alocação de 25 sobre pagamento de 100. O probe foi corrigido para registrar a proteção existente. Não houve duplicação financeira nem ultrapassagem de saldo.

`etapa-0.11-concurrency-findings.json` registra acceptancePassed=false e resolved=false para R2/R3. Não é um teste de aceite aprovado. A regressão anterior de versões/alocações concorrentes comprova unicidade e limites; ela não comprova prevenção de edição obsoleta ou reprodução idempotente da resposta.

### Proposta concreta para aprovação

- Contrato de concorrência: retornar uma revisão opaca vinculada a organização/recurso/registro; exigir If-Match nas edições e ações sobre registros existentes. Ausência retorna 428 e revisão obsoleta 412, antes de qualquer efeito. O frontend deve preservar a edição local e orientar recarga/reconciliação; não repetir automaticamente. A comparação e o avanço da revisão ocorrem na mesma transação da mutação.
- Armazenamento de revisão: preferir metadado técnico `ResourceRevision` com contador por (organizationId, recurso, registro), evitando interferir nas comparações de núcleo histórico dos triggers de negócio existentes. Leituras de páginas devem obter revisões em lote, sem N+1. Avaliar a forma final no SQL revisável; não usar xmin como identidade persistente de versão.
- Idempotência: recibo técnico durável `MutationReceipt`, com chave única por organização, membership, operação e hash da chave do cliente; hash canônico da entrada, referência ao resultado e status. A mesma chave/entrada não repete efeitos; chave com entrada diferente retorna 409. RBAC e vínculo são revalidados inclusive no replay. O recibo e o resultado devem ser gravados na mesma transação, incluindo concorrência entre processos.
- Privacidade e histórico: não armazenar senha, tokens, corpo bruto, conteúdo de documentos ou cópia adicional de PII nesses metadados. Retorno por referência deve ser novamente autorizado. Não reutilizar automaticamente chaves expiradas; retenção/limpeza será explicitada antes de qualquer job privilegiado.
- Banco: modelos técnicos adicionais, FKs/índices compostos, RLS habilitada/forçada e concessões mínimas por coluna, com negação por padrão. Recibos append-only; tenant sem DELETE. Nenhuma alteração nos objetos gerenciados do Supabase. Isso exige migration e revisão de segurança, mesmo se inicialmente aplicado apenas no banco descartável.
- Testes de aceite: atualização obsoleta rejeitada sem efeito; replay sequencial e concorrente cria um único resultado; entrada divergente com mesma chave é negada; falha intermediária desfaz resultado/recibo/revisão; chave de outro tenant não revela dados; suspensão/revogação continua negando replay.

Limite solicitado: aprovar somente implementação, migration revisável e ensaios isolados. Aplicação de migration, RLS, privilégios ou provisioning no Supabase continuará exigindo uma aprovação posterior específica. A pausa inicial foi encerrada pela aprovacao explicita do usuario para implementacao isolada. Os resultados posteriores estao abaixo; os GRANTs e a migration reais continuam sem autorizacao.

## Pendências externas

No bloco I ainda será necessário definir destino e responsável pela cópia criptografada fora do computador. Não há autorização para transmitir backups; nenhum envio foi realizado. A versão futura 0.12 permanece fora do escopo.

## E — implementação aprovada e aceite isolado

O usuário aprovou explicitamente a implementação isolada de ETag/If-Match e recibos técnicos de idempotência. A migration aditiva `20261024000000_mutation_consistency` foi aplicada desde zero somente no PostgreSQL descartável. Os GRANTs novos estão separados do SQL de negócio de hash aprovado. O perfil novo não pode ser usado como perfil de produção; o perfil antigo recusa downgrade quando encontra permissões do ledger. Duas reconciliações mantiveram a mesma ACL, sem DELETE ou flags administrativas.

O serviço revalida sessão/RBAC, exige chave por organização/vínculo/operação, compara a entrada canônica e executa efeito, avanço da revisão e recibo na mesma transação Serializable. Listagens consultam revisões em lote. O BFF encaminha os headers; formulários preservam a chave em reenvios da mesma tentativa e a revisão da edição original, inclusive durante refresh da sessão. O erro 412 mantém os valores digitados.

Aceite executado: replay sequencial e concorrente produz um efeito; mesma chave com conteúdo diferente recebe 409; ausência de chave/revisão recebe 428; edição antiga e disputa simultânea recebem 412 sem sobrescrever o vencedor; replay de versão contratual cria uma única versão; configurações também rejeitam revisão antiga; sessão revogada não reproduz recibo; outra organização e outro vínculo não leem o ledger; UPDATE de recibo, DELETE e alteração da identidade da revisão são bloqueados. Uma falha de aplicação injetada depois do INSERT real confirmou rollback de efeito, revisão e recibo. A injeção é explícita no teste e não substitui a conexão real.

Evidências: `etapa-0.11-consistency-tests.json`, `etapa-0.11-consistency-provisioning.json` e `etapa-0.11-database-state.json`. O JSON inicial de R2/R3 permanece como baseline histórica; seus resolved=false não são o resultado do aceite posterior. O probe temporário anterior foi substituído pela suíte de aceite. Limitações e contratos estão em [operação da etapa](etapa-0.11-operacao.md).

## F — API e dependências

Foi corrigido o log padrão de 404 que reproduzia query string e substituída a correlação controlada pelo cliente por UUID gerado no servidor. O limite geral de payload é 64 KiB. Swagger UI/JSON não são registrados em NODE_ENV=production. Os cinco testes unitários da API incluem CORS, Helmet, JSON malformado, payload excessivo, logs sem marcadores sensíveis e indisponibilidade do Swagger em produção; os nove testes de autenticação passaram novamente.

Overrides transitivos delimitados atualizaram lodash para 4.18.1 e fast-uri para 3.1.9/4.2.3, sem upgrade major dos frameworks ou Prisma. `pnpm audit --json` retornou zero alertas após a correção, contra 1 alto/6 moderados/4 baixos antes. O alerta alto alcançava dependência do tooling Prisma/Studio; não se afirmou exploração da aplicação. Os relatórios anterior/posterior estão preservados. Endpoints continuam com Zod estrito, allowlists de ordenação, paginação máxima 100 e erros sem detalhes do driver. Swagger ainda não contém schemas completos de resposta de todos os recursos; contrato complementar documentado.

## G — frontend e navegador

Playwright com Chrome/Edge local, build Next de produção em loopback e API/DB descartáveis: oito cenários de negócio aprovados, incluindo persistência após reload, busca, edição, detalhes, arquivamento, conflito de duas abas com formulário preservado, troca de organização sem vazamento de cache, temas e renderização dos 13 módulos em 360/1440 px. Doze cenários de autenticação passaram, incluindo telas públicas em 360/768/1440 px, proteção de rotas, confirmação/reset, MFA, HttpOnly e ausência de tokens no localStorage. Nenhum erro de execução no navegador.

Os 27 testes nativos do frontend passaram: seis cobrem contratos/cliente integrado e 21 são regressão do modelo demonstrativo legado. Estes 21 não são apresentados como prova de persistência real. O cliente integrado também testa 401 com refresh único preservando chave/revisão, 403/404/412/429 e ausência de retry cego após falha de rede. O E2E de criação/edição exercita proprietários; os outros módulos têm navegação/listagem e cobertura de API, não se afirma E2E de todos os formulários. Não foi executada auditoria WCAG completa.

## H — performance e resiliência

Ensaio local moderado: 250 proprietários descartáveis, 40 requisições, concorrência quatro, páginas de 100. A última medição registrou p50 de aproximadamente 35 ms e p95 de 95 ms, com seis/duas conexões runtime observadas em execuções distintas, incluindo o servidor de navegador separado. A medição de RSS antes/depois não é teste de vazamento de longa duração. Planos EXPLAIN ANALYZE foram executados para listagem e revisão; não foi forçado uso de índice nem instrumentada contagem total de queries. A busca de revisões é uma consulta em lote por página, sem loop de consultas por linha.

Timeout transacional, perda de conexões ociosas e parada/reinício do container PostgreSQL foram testados, com rollback/reutilização e recuperação confirmados. Respostas de erro não expuseram a URL do banco. Nenhum teste de carga alcançou o Supabase. Latência local com dataset pequeno não representa capacidade de produção. Evidência: `etapa-0.11-resilience.json`.

## I — backup e observabilidade

O snapshot completo previamente revisado da 0.10.1 e sua cópia foram verificados por SHA-256. O dump e o manifesto de recuperação foram criptografados em duas cópias locais AES-256-GCM, com chave separada e ACLs verificadas. A primeira checagem identificou ACL herdada ampla nos artefatos novos; a correção restringiu o acesso ao usuário/SYSTEM e renovou a chave antes do aceite final. O ajuste inicial com Set-Acl em subprocesso recusou privilégio SACL; foi substituído por icacls para tratar apenas DACL, sem ampliar privilégios.

A restauração a partir do envelope criptografado passou em PostgreSQL 17.11 sem rede: dados de todas as 44 tabelas do snapshot, políticas, índices, funções, triggers e privilégios efetivos corresponderam. As diferenças textuais normalizadas são exclusivamente as duas equivalências já testadas em 0.10.1. O backup é histórico; não se afirma snapshot novo ou estado atual do Supabase. O banco isolado de desenvolvimento contém 46 tabelas após a migration técnica adicional.

O usuário determinou **“Definir depois; registrar pendência”** para destino/responsável da cópia externa. Nenhum envio ocorreu. Periodicidade, retenção proposta, separação de chave, recuperação e observabilidade sem serviço externo estão em `etapa-0.11-operacao.md`. Evidências: `etapa-0.11-encryption.json` e `etapa-0.11-restore.json`. Monitoramento e alertas externos não foram implantados.

## J — verificações e publicação

Verificações executadas: schema Prisma válido, Client gerado, seis migrations locais com checksums correspondentes e nenhuma pendente; 20 testes unitários do banco; cinco unitários da API; nove de autenticação; cinco testes adicionais de segurança/RBAC (170 entradas da matriz dentro de um teste); aceite de consistência; 18 grupos da regressão de negócio; 14 cenários de integridade e nove de contexto de conexão, com fixtures desses dois últimos revertidas; 27 testes do frontend; 8+12 cenários E2E; reconciliação dos perfis e ensaio de backup criptografado. Os números de cenários/grupos não são somados como se fossem testes nativos independentes.

Lint dos quatro pacotes, typecheck e builds dos pacotes afetados passaram. O SQL aprovado de 0.10.1 preserva SHA-256 `bf190ef6241b9be22ac68690db53ab272f1b88c5d24a334937523d2350a6aae0`. Os relatórios históricos foram preservados; resultados novos usam prefixo 0.11. Credenciais, dumps, envelopes, chaves e ferramentas portáteis permanecem ignorados. A revisão final do diff/segredos antecede commit e push; os hashes de publicação serão informados no relatório da execução, sem autorreferência no commit.

Pendências materiais: ativação real da migration/RLS/GRANTs exige aprovação posterior e backup atualizado; não publicar este build antes dela. Definir destino externo e custódia da chave; aprovar retenção de dados/recibos/logs e responsáveis de alertas; validar operação distribuída de rate limit antes de múltiplas instâncias. Não houve deploy, integração externa, SMTP, operação de negócio real ou início de 0.12.
