# Etapa 0.9 — Autenticação, sessões e RBAC

## Bloco A: arquitetura registrada antes da implementação

Auditoria: etapas 0.7/0.8, 34 tabelas de negócio e estrutura técnica preservadas. API Fastify 5 sem autenticação; Next 16 com 13 módulos demonstrativos. A credencial administrativa possui BYPASSRLS e não deve executar consultas runtime.

Decisões:

- Identidade própria, e-mail normalizado, Argon2id com salt individual, mínimo OWASP (19 MiB, 2 iterações, paralelismo 1). Senhas de 12–128 caracteres com maiúscula, minúscula, número e símbolo.
- Tokens opacos aleatórios de 256 bits. Access de 5 minutos, refresh de 7 dias com prazo absoluto de sessão de 30 dias. Banco guarda somente SHA-256 dos tokens. Cada refresh consumido permanece para detectar replay, que revoga a família/sessão. Atualização atômica com locks.
- Cookies HttpOnly, SameSite=Lax, Secure em produção, sem localStorage. CSRF por token double-submit vinculado à sessão e validação exata de Origin; login/cadastro também exigem Origin e desafio CSRF prévio. Reautenticação recente para mudanças sensíveis.
- Contexto organizacional escolhido pelo usuário, validado no servidor contra membership ativo e gravado na sessão. Parâmetros do frontend não autorizam acesso. Cada operação organizacional usa `withOrganization` com contexto transacional local e RBAC; SUPER_ADMIN não burla RLS implicitamente.
- Duas roles runtime sem superuser/BYPASSRLS/CREATEROLE/ownership: identidade com acesso limitado a autenticação/leituras de memberships e autorização; tenant com acesso por RLS. Administração/migrations fora da API. Startup verifica capacidades reais e falha fechado.
- TOTP obrigatório para SUPER_ADMIN; preparação de cadastro de MFA com sessão limitada antes da autenticação completa. Segredo criptografado AES-256-GCM com chave por ambiente; códigos de recuperação armazenados como hash e consumidos atomicamente; prevenção de replay TOTP.
- Eventos de autenticação separados, sem senhas, cookies, tokens ou segredos; erros públicos genéricos e logs sanitizados. Rate limiting por IP e limitador persistente por conta, sem informar existência da conta.
- E-mails transacionais por SMTP configurável com TLS; testes usam coletor em memória isolado. Nenhum e-mail real será enviado nesta execução. Sem provedor configurado, funcionalidades dependentes não serão anunciadas como operacionais em produção.
- Migrações aditivas versionadas, ensaiadas somente em PostgreSQL local descartável. Nenhuma aplicação de migration, provisionamento de role ou deploy no Supabase de produção nesta etapa de execução.
- Frontend usa proxy same-origin para API e valida sessão no servidor; protege os 13 módulos preservando dados demonstrativos, sem CRUD imobiliário/financeiro (0.10).

## Entrega B–F

O schema multi-arquivo mantém os 34 modelos de negócio em `ethos` e adiciona oito tabelas em `ethos_identity`: `AuthCredential`, `AuthSession`, `AuthRefreshToken`, `AuthActionToken`, `AuthRecoveryCode`, `AuthEvent`, `AuthThrottle`, `AuthMailOutbox`. `User` continua global; credenciais e MFA não são campos públicos desse modelo. As relações adicionais não mudam colunas/dados das entidades de negócio.

### Fluxos e endpoints

API sob `/api/v1/auth`; navegador usa exclusivamente `/api/auth`, proxy same-origin com allowlist. JSON estrito, sem atribuição pública de papéis, organização ou privilégios. Senhas/tokens entram no corpo e não em URLs ou logs.

| Operação                            | Endpoint                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| Desafio CSRF                        | `GET /csrf`                                                                         |
| Cadastro/login/logout               | `POST /register`, `/login`, `/logout`, `/logout-all`                                |
| Recuperação/confirmação             | `POST /forgot-password`, `/reset-password`, `/verify-email`, `/resend-verification` |
| Senha/reautenticação                | `POST /change-password`, `/reauthenticate`                                          |
| Renovação                           | `POST /refresh`                                                                     |
| Conta/sessões                       | `GET /me`, `/sessions`; `POST /sessions/revoke`                                     |
| Contexto organizacional             | `POST /organization`, `GET /permissions`, `/authorize`                              |
| MFA                                 | `POST /mfa/setup`, `/mfa/enable`, `/mfa/verify`                                     |
| Autorização de plataforma auditável | `POST /platform/access`, exige MFA, confirmação recente e motivo                    |

Cadastro sempre responde genericamente e não altera contas existentes. Login exige e-mail confirmado e usuário habilitado. Redefinição usa token de 30 minutos, confirmação de 24 horas; consumo atômico, único e com validação de expiração. Recuperação não autentica automaticamente, preserva MFA e encerra sessões. Alteração de senha exige a senha atual e reautenticação recente (cinco minutos).

Outbox criptografada evita depender da latência do SMTP nas respostas públicas. Worker reivindica lotes com `FOR UPDATE SKIP LOCKED`, lease de cinco minutos e no máximo cinco tentativas. Envia por SMTP com TLS obrigatório e verificação de certificado; remove o payload criptografado depois do envio. Entrega pode ser repetida em falha de processo, mas o token continua de uso único. Erros de entrega geram evento sem conteúdo sensível. O shutdown aguarda o worker antes de encerrar conexões.

MFA permite sessão limitada `MFA_SETUP`/`MFA_PENDING` antes do segundo fator; ela não acessa administração, seleção de organização ou sessões da conta. A verificação válida muda a sessão para `MFA`. Códigos TOTP anteriores/iguais ao último contador aceito são rejeitados; tolerância de relógio de um intervalo. Dez códigos de recuperação de alta entropia são exibidos uma única vez. Cadastro de MFA revoga outras sessões, mantendo somente a sessão que acabou de comprovar o fator.

### Sessões, cookies e expurgo

Access/refresh são opacos, não JWT. Toda autenticação consulta a sessão e o estado atual do usuário; revogação não depende de esperar um JWT expirar. Rotação de refresh bloqueia a sessão e verifica novamente o token após adquirir o lock. Reutilização de token consumido revoga a sessão inteira, inclusive o refresh substituto. Prazos: access cinco minutos, refresh sete dias, limite absoluto trinta dias.

Cookies de produção têm prefixo `__Host-`, Secure, HttpOnly, Path=/ e SameSite=Lax, sem Domain. Em desenvolvimento usam nomes sem o prefixo e HTTP loopback. O desafio CSRF também é cookie HttpOnly assinado; o frontend recebe o valor por JSON e o envia em `x-csrf-token`. Há validação exata de Origin e vínculo do hash CSRF com a sessão. CORS não substitui CSRF. Não há tokens em localStorage; apenas o tema utiliza o armazenamento já existente.

Limpeza periódica revoga sessões expiradas, remove sessões expiradas há mais de noventa dias, tokens de ação antigos, throttles e outbox antigos. Refresh consumido é mantido por toda a vida da família e por um período posterior, preservando detecção de replay. Eventos de auditoria são imutáveis e sobrevivem ao expurgo da sessão, referenciando seu UUID sem FK destrutiva.

### Matriz RBAC

Fonte executável: `apps/api/src/auth/rbac.ts`. `R` = read; `C/U/A` = create/update/archive lógico. As ações preparam autorização; não implementam endpoints de negócio.

| Papel             | Escopo e permissões                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| SUPER_ADMIN       | Global separado, MFA obrigatório; acesso explícito de plataforma com motivo e auditoria. Não recebe bypass tenant nem papel organizacional implícito |
| ADMIN_ORGANIZACAO | R/C/U/A dos 13 recursos na própria organização e `members.manage`                                                                                    |
| GESTOR            | R dos recursos exceto settings; C/U/A em properties, owners, tenants, leases, contracts, inspections, maintenance e calendar                         |
| FINANCEIRO        | R/C/U/A em finance; R em dashboard, leases, contracts, owners, tenants, reports e notifications                                                      |
| PROPRIETARIO      | `read_own` em properties, leases, contracts, finance, reports e notifications                                                                        |
| INQUILINO         | `read_own` em leases, contracts, finance, inspections, maintenance e notifications                                                                   |

Autorização é interseção entre template, role ativa e concessões persistidas não revogadas. O contexto vem da sessão após validar a escolha contra membership e organização ativos. Parâmetros do frontend não substituem esse contexto. Sem organização retorna 409; sem permissão retorna 403. Metadados não são aceitos para elevar privilégios no cadastro.

Papéis externos não recebem `read` amplo: são bloqueados nas telas administrativas. `read_own` não entrega dados imobiliários; a ligação autenticada com Owner/Tenant e os filtros de propriedade serão obrigatórios nos futuros endpoints 0.10, antes de conceder acesso a registros. RLS organizacional sozinha não resolve essa autorização dentro de uma organização.

`provision-roles.mjs` é comando administrativo explícito, separado do startup e das rotas. Exige conexão privilegiada, organização existente e, ao atribuir ADMIN_ORGANIZACAO, membership ativo da mesma organização. Não cria SUPER_ADMIN. Grants de plataforma continuam no modelo separado, com auditoria 0.8; não existe bootstrap público de administrador.

Triggers revogam e auditam sessões afetadas quando mudam vínculos, atribuições de papel, concessões, arquivamento de papéis, status da organização, e-mail/estado do usuário, privilégios globais ou hash da senha. Alterar e-mail também retira sua confirmação. Mudanças de senha/MFA pelos serviços encerram as sessões correspondentes. Códigos do catálogo de permissões são identificadores estáveis; eventual renomeação administrativa deve ser tratada por migration explícita, com revogações revisadas.

### RLS e credenciais

`provision-auth.sql` cria `ethos_auth_runtime` e `ethos_tenant_runtime` sem privilégios administrativos, ownership, role memberships administrativas ou bypass. Ele interrompe se os nomes já existirem, em vez de modificar roles desconhecidas. Não contém senhas; elas devem ser atribuídas por canal administrativo seguro.

Identidade lê somente os metadados globais necessários, insere User e administra o schema de autenticação. Não possui escrita em memberships, RBAC ou privilégios globais. Tenant lê dados sob RLS e não recebe escrita de negócio nesta etapa. As tabelas globais continuam invisíveis para a role tenant. Novas políticas de metadados só se aplicam ao nome exato da role de identidade; nenhuma política pública genérica foi criada.

Startup verifica o nome real da role, flags administrativas, possibilidade de assumir roles poderosas e ownership de tabelas/schema/banco, recusando configurações inseguras. `withOrganization` mantém contexto e autor transacionais, valida membership e organização e recusa bypass. Pools são distintos; não há `SET ROLE` ou GUC persistente no runtime. Triggers de revogação/auditoria são funções SECURITY DEFINER exclusivas de trigger, com search_path fixado, nomes qualificados e execução pública revogada. Sua ownership permanece com a conexão administrativa de migration.

TLS remoto permanece estrito com a CA Supabase. Plaintext é opção explícita apenas em loopback para testes, rejeitada para hosts externos; `authRuntime` proíbe esse modo em produção. Transações têm espera limitada de dez segundos e duração de quinze segundos.

### Frontend

O startup também exige `session_user = current_user`: uma conexão administrativa disfarçada com `SET ROLE` é recusada. Esse caso foi reproduzido e bloqueado no teste isolado.

Criadas `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/organizations`, `/access-denied`, `/mfa` e `/account/security`. Fontes locais Playfair Display/Nunito Sans, branding, temas e dados demonstrativos preservados. Inputs rotulados, autocomplete, requisitos claros, mostrar/ocultar senha, estados de carregamento, sucesso e erro acessíveis.

Proxy Next valida a sessão/organização/permissão antes da administração; o layout confirma sessão no servidor. Access expirado pode ser renovado pelo proxy usando cookies HttpOnly. No cliente há single-flight de refresh dentro da aba. Links administrativos não fazem prefetch indiscriminado de páginas protegidas. O limite geral foi ajustado para 1000/min; login e demais rotas sensíveis mantêm quotas menores, além dos contadores persistentes por conta. `trustProxy` continua falso: X-Forwarded-For arbitrário não é confiado.

Cabeçalhos protegem contra framing e MIME sniffing, removem referrer e limitam permissões do navegador. CSP restringe frame-ancestors, base-uri, form-action e object-src; não é apresentada como política completa de scripts com nonce.

## Migrations e estado real

Três migrations aditivas versionadas:

1. `20261022020000_auth_identity`: oito tabelas, índices/FKs, RLS, checks e proteção dos eventos.
2. `20261022021000_auth_event_reason`: motivo auditável de acesso privilegiado.
3. `20261022022000_auth_privilege_revocation`: revogação automática por mudanças críticas.

Aplicadas **somente no PostgreSQL Docker 17.11 descartável**, incluindo as duas migrations anteriores. Status local atualizado e diff declarativo vazio. Sem reset, db push, alterações em objetos Supabase ou dados reais.

Conferência somente leitura do Supabase: PostgreSQL 17.11, 34 tabelas de negócio e 34 com RLS habilitado/forçado; zero schema `ethos_identity` e zero roles novas. Histórico 0.7/0.8 preservado com checksums correspondentes, inclusive a tentativa revertida já documentada. As três migrations de autenticação e o provisioning estão **pendentes de aplicação no ambiente real**, conforme a instrução de não executar deploy.

## Configuração por ambiente

Exemplos em `apps/api/.env.example` e `apps/web/.env.example`; nenhum segredo real foi criado/versionado. API recebe duas URLs runtime, WEB_ORIGIN exata, chave de assinatura de cookies, chave AES de 32 bytes em base64 e SMTP TLS. Nunca usar DIRECT_DATABASE_URL no processo da API. A CLI administrativa recebe essa variável apenas em sua execução isolada.

Gere segredos independentes com CSPRNG por ambiente e mantenha-os em secret manager/arquivos ignorados. Não reutilize as credenciais literais dos testes. A rotação da chave AES deve recriptografar MFA/outbox de forma coordenada; perder a chave exige recuperação controlada, não gerar outra automaticamente no startup. Habilitar HTTPS antes de usar cookies de produção. Relógio do servidor precisa estar sincronizado para TOTP.

Não há fallback que use a credencial administrativa ou desabilite autenticação quando faltam configurações. O servidor normal falha fechado se a configuração não estiver completa; o builder de teste sem auth retorna 503 nas rotas auth e mantém somente health.

## Testes executados

| Verificação                                         | Resultado                                                                                                                                                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ethos/api test:auth`                              | 9 cenários reais: identidade, confirmação/reset, concorrência/replay/expiração de refresh, RBAC, RLS runtime, CSRF/cookies, MFA/recuperação/auditoria privilegiada, rate limit/reautenticação, conta desabilitada, logs/startup e expurgo |
| `@ethos/api test`                                   | 3 aprovados: compatibilidade Fastify e criptografia/política de senha                                                                                                                                                                     |
| `@ethos/database test`                              | 9 aprovados                                                                                                                                                                                                                               |
| `@ethos/web test`                                   | 21 aprovados, incluindo todos os vínculos e fluxos demonstrativos anteriores                                                                                                                                                              |
| Navegador Chrome headless                           | 12 cenários aprovados; 360/768/1440 px, nove telas auth, dark/light, senha visível, signup/confirmação/reset/login, 13 módulos, organizações, MFA e acesso negado                                                                         |
| Regressão SQL 0.8 local                             | 14 grupos e 9 verificações de contexto Prisma aprovados; fixtures e role temporária revertidas                                                                                                                                            |
| Schema validate/generate                            | Aprovados                                                                                                                                                                                                                                 |
| Typecheck/build API/database e TypeScript/build web | Aprovados                                                                                                                                                                                                                                 |
| Lint real API/database/web                          | Configurado e executado; problemas encontrados corrigidos antes do commit                                                                                                                                                                 |
| Migrations/diff local                               | Cinco migrations aplicadas, banco atualizado, diff vazio                                                                                                                                                                                  |

Relatório de navegador em `docs/etapa-0.9-browser-tests.json`. Também foi inspecionada visualmente a captura mobile do login. Os primeiros ensaios encontraram tráfego de prefetch excedendo o limite geral e expectativas do teste usando classe em vez do atributo data-theme; ambos foram corrigidos e os testes repetidos. Não se atribui sucesso a SMTP real ou deploy, que não foram executados.

### Reprodução isolada

Evidências consolidadas: `docs/etapa-0.9-tests.json`, incluindo checksums das cinco migrations locais e a inspeção somente leitura do ambiente real.

Na raiz, Node 24+, pnpm 11.23.0, Docker disponível:

```powershell
docker run --detach --name ethos-auth-test --publish 127.0.0.1:55439:5432 --env POSTGRES_PASSWORD=ethos-local-disposable --env POSTGRES_DB=ethos_auth_test postgres:17.11
pnpm --filter @ethos/database build
pnpm --filter @ethos/database db:test:auth:setup
pnpm --filter @ethos/api build
pnpm --filter @ethos/api test:auth
```

Para navegador, iniciar `node apps/api/scripts/auth-test-server.mjs` em um terminal. Em outro, definir `ETHOS_API_ORIGIN=http://127.0.0.1:3339` e `ETHOS_WEB_ORIGIN=http://localhost:3099`, executar build e start web na porta 3099; depois `pnpm --filter @ethos/web test:auth:browser`. Chrome/Edge local detectado, ou caminho por ETHOS_BROWSER_PATH. Reiniciar a API de fixtures entre execuções para reinicializar MFA dos usuários de teste. Servidor de fixtures se recusa a operar em NODE_ENV=production e usa apenas o banco loopback fixo. O coletor de e-mail de teste nunca é registrado pelo servidor normal.

Testes não leem/escrevem dados reais: fixtures ficam no container descartável. Encerrar os servidores e remover apenas esse container/volume de teste após usar. Os scripts de regressão 0.8 aceitam ETHOS_LOCAL_DATABASE=1 com DIRECT_DATABASE_URL loopback; não usar `--report` neles para sobrescrever a evidência histórica 0.8.

## Limitações e ativação futura

- Sem deploy nesta execução. Antes de ativar, aplicar as três migrations revisadas, provisionar as duas roles/passwords independentes, configurar HTTPS/segredos/SMTP e validar entrega real, rollback operacional e observabilidade. O endpoint Supabase/pooler deve aceitar as novas credenciais; isso não foi testado no ambiente real porque não foram provisionadas lá.
- SMTP foi exercitado por outbox e coletor em memória, não por envio externo. Alertas/reprocessamento operacional de mensagens que esgotaram tentativas precisam de configuração no ambiente de execução.
- Perda de autenticador e de todos os códigos exige procedimento de suporte com verificação de identidade. Não há endpoint inseguro de reset de MFA nem exposição posterior dos códigos. Regeneração/desativação de MFA não é funcionalidade desta entrega.
- Autenticação por senha não depende do Supabase Auth. Convites e criação de organizações/primeiro vínculo são provisioning administrativo, sem self-service de papéis elevados.
- Replay de refresh é estrito; duas abas/navegações concorrentes usando o mesmo token podem encerrar a família e exigir novo login. Single-flight cobre uma aba; coordenação entre abas/instâncias ainda pode ser aprimorada sem enfraquecer a detecção de replay.
- Quotas por IP em memória são locais ao processo, enquanto quotas por conta são persistentes. Em múltiplas instâncias/BFF, definir topologia confiável de proxy e armazenamento compartilhado de quotas por IP; não habilitar trustProxy irrestrito. Teste de carga distribuída não foi executado.
- Definir política operacional de retenção dos eventos imutáveis, recuperação e rotação de chaves. A revisão/testes não equivalem a pentest independente.
- Módulos de negócio continuam demonstrativos, sem CRUD PostgreSQL. Autorizações `read_own`, portal externo e integração de dados exigem implementação da etapa 0.10, que não foi iniciada.

## Git

Após os testes, os servidores temporários foram encerrados e o container/volume PostgreSQL descartável desta execução foi removido. Dados de fixtures não permaneceram em serviços reais ou em um banco local ativo.

Arquivos principais: `apps/api/src/auth/*`, integração em app/server, scripts administrativos/de fixtures e testes; telas/componentes/transportes/proxy de autenticação em `apps/web`, navegação e cabeçalhos; schema/config/client do pacote database, três migrations e scripts de provisioning/testes; configuração ESLint real, dependências e lockfiles. O lockfile independente preexistente do frontend também foi sincronizado. `.gitignore` já protegia os arquivos locais e não precisou mudar.

Revisão privada: 188 arquivos versionáveis, zero correspondências com credenciais locais/chaves privadas e nenhum `.env` incluído. `git diff --check` aprovado; SQL das migrations 0.7/0.8 preservado. Conexão de leitura do GitHub confirmada com fetch antes do commit.

Commit solicitado: `feat(auth): implementa autenticacao RBAC e sessoes multi-tenant`. Somente após lint/typecheck/build/testes, revisão dos diffs e comparação privada com os segredos locais. Hash, push e estado final do Git são apresentados no relatório final da execução; sem force push.

Referências: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Fastify Cookie](https://github.com/fastify/fastify-cookie), [Nodemailer SMTP](https://nodemailer.com/smtp), [OTPAuth](https://hectorm.github.io/otpauth/classes/TOTP.html).
