# Etapa 0.12 — Infraestrutura e preparação dos ambientes

## Escopo e auditoria (A)

Preparação local, sem deploy, provisionamento ou conexão com Supabase. A etapa
0.11.1 continua adiada: sexta migration, grants técnicos, primeiro administrador e
organização, SMTP, destino externo do backup e diagnóstico da intermitência MFA.
Os arquivos de preparação daquela etapa foram encontrados sem commit e preservados.

Arquitetura: pnpm 11.23.0/Turbo; Next 16 com BFF; Fastify 5 persistente;
contracts e Prisma compartilhados. Runtime separa identidade e organização,
usa TLS com CA validada e RLS transacional. Administração permanece fora da API.

Lacunas encontradas: teste raiz placeholder; ausência de workflows/Docker;
configuração de ambientes distribuída; ausência de readiness e bloqueio por schema;
encerramento sem prazo e sem limpeza no erro de inicialização.

Plano: validar configuração antes de criar recursos; desenvolvimento apenas local;
staging independente do projeto de produção; CI sem segredos remotos; preparação
Vercel sem conexão/publicação; imagem de API sem arquivos privados; readiness com
credenciais runtime; procedimentos de recuperação manuais e aprovados.

Hospedagem da API, topologia de proxies e serviços externos ficam por aprovar.
Não serão alterados autenticação, RLS, grants, migrations ou política de SMTP.

## Ambientes (B/F)

`config/README.md`, `config/staging.example.json`, `config/production.example.json`
e os exemplos API/web definem os escopos. `APP_ENV` operacional é independente do
modo de compilação NODE_ENV. Desenvolvimento só aceita banco loopback com papéis
restritos. Staging exige referência independente, HTTPS e segredos exclusivos.
Produção só aceita referência aprovada e NODE_ENV=production. Runtime recusa
DIRECT_DATABASE_URL, desativação global de TLS, proxy irrestrito e bancos divergentes.
Pool configurável 1–20 por papel/processo, default 5. SMTP permanece obrigatório.
Não há migração de segredos existentes nem alteração de credenciais reais.

Web valida origens no startup (instrumentation Node) e no transporte BFF. Recusa
credenciais de banco/assinatura e nomes públicos de segredos. Variáveis privadas
permanecem somente no servidor; nenhum NEXT_PUBLIC novo foi criado. Os exemplos
JSON contêm configurações não secretas; não substituem o inventário de segredos.

## CI e publicação futura (C/D)

`.github/workflows/ci.yml`: PR e push main, permissions contents:read, checkout
sem token persistente, actions fixadas por SHA oficial, concorrência por ref e
cancelamento. Node 24.19.0, pnpm 11.23.0, frozen lockfile. Executa lint, types,
unitários, integração/RLS com PostgreSQL 17 descartável, navegador Chromium,
Prisma validate/generate, build, audit de dependências, scan e build/smoke Docker.
Nenhum secret remoto, deploy, registry push ou migration real no workflow.

Scripts raiz corrigidos e dependências de build no Turbo garantem imports dist.
Build/typecheck/test sem cache para evitar validade dependente de ambiente;
remote cache não foi conectado. Scripts CI fixam destinos de teste e preservam
relatórios históricos, copiando resultados para `.artifacts/ci` ignorado.

Vercel preparado com Root Directory futuro apps/web e build do contracts via
Turbo. `git.deploymentEnabled=false` desativa publicação Git. Nenhuma conta/repo
foi conectada. O BFF preserva cookies allowlist/HttpOnly, CSRF de origem exata,
timeout e no-store; rotas administrativas dinâmicas, headers existentes, cache
por organização, redirecionamentos e páginas de erro foram preservados. Builds
geram 26 páginas estáticas; 13 módulos administrativos continuam dinâmicos.
Teste de navegador confirma responsividade, temas e ausência de erro JS no fluxo;
não foi medido Lighthouse ou latência pública, inexistente sem publicação.

## API e observabilidade (E/G)

`apps/api/Dockerfile` usa Node fixado por digest amd64, OpenSSL/CA explícitos,
usuário node UID1000, SIGTERM e healthcheck readiness. `.dockerignore` exclui
env, backups, chaves, ferramentas e Git. Nenhum script administrativo de banco
vai para a imagem runtime. A imagem conserva o store de dependências do workspace,
incluindo ferramentas de desenvolvimento; otimização/pruning e scan de CVEs do
sistema operacional são verificações futuras antes de publicar. A auditoria npm
desta etapa cobre dependências JS, não substitui scanner da imagem.

Inicialização valida antes dos pools; falha fecha os recursos. Shutdown drena HTTP,
mail/limpeza e pools, com prazo 30s. Timeouts conexão 10s, recebimento HTTP 30s,
keepalive 5s; PG conexão10s/query15s. Body64KiB e rate limiting existentes preservados.
`/api/v1/health` liveness e `/api/v1/health/ready` 200/503 genérico/no-store.
Readiness single-flight, prazo4s, cache1s, contrato técnico, dois papéis sem flags
administrativas e 44 tabelas protegidas. Startup recusa contrato incompatível.

Contadores internos por processo, requestId do servidor, logs estruturados sem
corpos/query strings/credenciais e eventos operacionais documentados em
`docs/infra-operations.md`. Não há endpoint público de métricas nem integração
externa. Alertas, retenção e responsáveis são proposta, não serviço operacional.
Proxy segue trustProxy=false; CIDRs e rate limit distribuído exigem revisão após
escolher provedor. Não operar múltiplas instâncias antes dessa revisão e da
coordenação dos workers de mail/limpeza.

## Migrations e recuperação (H)

Nenhum SQL/migration/grant novo. Verificador isolado compara dinamicamente todos
os nomes de migrations do repositório, checksums e estado final; detecta faltantes,
extras, incompletas e divergência. Histórico revertido é separado das ativas.
Runtime não acessa histórico administrativo nem aplica DDL: valida contrato mínimo.
Conferência administrativa completa de catálogo/ACL/checksums continua obrigatória.
Banco real de cinco migrations é incompatível com esta versão: 0.11.1 precisa de
aprovação própria. Seus scripts de preparação preservados não foram executados.
Backup atual, duas cópias criptografadas e restauração em destino separado antes
de futura ativação. Destino externo, proprietário e RPO/RTO continuam pendentes.

## Homologação local (I/J)

Instalação frozen, lint quatro pacotes/scripts raiz, typecheck quatro pacotes,
build quatro pacotes, Prisma validate/generate e audit sem vulnerabilidades
conhecidas passaram. Unitários: banco21, API12, frontend28, CI/scan2 = 63.
Integração: autenticação9, negócios1 (18 grupos), segurança4, autorização1
(170 verificações), consistência1 (18 verificações), infraestrutura2 em Windows.
O teste SIGTERM foi explicitamente pulado no Windows e executado em Linux:
três testes de infraestrutura passaram, incluindo inicialização normal, schema
incompatível, readiness e shutdown com código0/eventos de draining/stopped.

Navegador contra build Next: autenticação12, perfis12, negócios8 =32 verificações;
mobile/tablet/desktop, temas, cookies, CSRF, sessões, RBAC, concorrência e descarte
de cache ao trocar organização. Nenhum dado foi inserido no Supabase.
Manifesto do banco descartável em `etapa-0.12-database-state.json`: seis migrations
ativas com hashes corretos, 46 tabelas, 44 RLS forçadas e zero DELETE tenant.
Logs de execução e relatórios completos locais em `.artifacts/ci`; resumo versionado
em `etapa-0.12-validation.json`. Não versionar fixtures ou segredos.

Falhas e correções: wrapper pnpm.ps1 bloqueado pela política Windows, usado pnpm.cmd;
scan inicialmente rejeitou credenciais sintéticas de testes negativos, exceções
limitadas aos valores/arquivos específicos; imagem precisava OpenSSL explícito,
corrigido e recompilado; primeiro harness de navegador excedeu prazo de prontidão,
ampliado para até60s e repetição completa passou. Isso não comprova resolução da
intermitência MFA histórica, cuja causa permanece pendente. Reset de fixtures por
suíte é isolamento de teste, não correção de autenticação.
Na revisão final, typecheck e build geraram Prisma simultaneamente e falharam com
ENOTEMPTY/tipos derivados ausentes. O grafo passou a exigir o próprio build antes
do typecheck; a execução posterior dos oito tasks passou. Não houve alteração
manual nos tipos de negócio para mascarar o erro de geração.
Os três testes Linux também passaram dentro da imagem runtime final, com filesystem
somente leitura, cap-drop ALL e no-new-privileges, usando apenas o banco descartável.

Primeiro CI real: [40094492615](https://github.com/BielMar-01/ethos-administracao/actions/runs/40094492615),
commit670caaf, passou instalação, scan, audit, Prisma, builds, lint, tipos e unitários;
falhou na integração porque a nova verificação de identidade antecipou o erro do
guard de papel existente (RUNTIME_SCHEMA_UNSAFE em vez de UNSAFE_AUTH_DATABASE_ROLE).
Os dois bloqueavam a credencial administrativa. Corrigida a ordem dos hooks:
validar papel primeiro, contrato de schema depois, ambos antes de escutar. Não se
ampliou a regex do teste nem se removeu a verificação. O prazo do harness também
passou a usar deadline de relógio, incluindo o tempo dos probes.
CI corretivo aprovado: [40094766768](https://github.com/BielMar-01/ethos-administracao/actions/runs/40094766768),
commit `7ac62820640f97aedb60f89fdfbfa3cbeaef6ce7`, conclusão success. Instalação,
scan, audit, Prisma, build, lint, types, unitários, integração, Chromium, Docker e
smoke da imagem passaram no runner Ubuntu24.04. Nenhum deploy ocorreu.
Branch protection não foi alterada. Container local descartável removido após
conferir ID; demais containers não foram modificados. Preparação publicada em
`670caaf823ee0ab3a2fdf39b6ead8523644e2f39` e correção em `7ac6282`, sem force push.

## Checklist para futura publicação

- [x] Configurações separadas e guards fail-closed, CI e Docker preparados.
- [x] Lint/types/testes/build e ensaios isolados aprovados.
- [x] Preservar layout premium, BFF, RBAC e isolamento organizacional.
- [ ] Aprovar hospedagem API, custos/região, proxy/CIDRs e limites de conexão.
- [ ] Criar staging independente, segredos e URLs após autorização específica.
- [ ] Concluir 0.11.1: sexta migration/grants, primeiro SUPER_ADMIN e organização.
- [ ] Decidir SMTP e eventual modo local sem mail; configurar somente com autorização.
- [ ] Definir cópia externa criptografada, responsável, retenção e RPO/RTO.
- [ ] Esclarecer a falha intermitente MFA; ampliar repetição E2E antes de uso real.
- [ ] Aprovar backup/restore atual, validar ambiente HTTPS/proxy/cookies real.
- [ ] Revisar imagem/CVEs, observabilidade, workers e rate limit antes de escala.
- [ ] Aprovar release compatível; seguir `.github/DEPLOYMENT.md` com rollback seguro.

Não houve deploy, provisionamento, conexão ao Supabase, SMTP real ou ativação 0.11.1.
Nenhuma etapa 0.13/1.0 foi iniciada. A preparação não torna o sistema pronto para
usuários reais. Os arquivos anteriormente não commitados da preparação 0.11.1 são
preservados/versionados como preparação adiada, sem declarar sua ativação concluída.
