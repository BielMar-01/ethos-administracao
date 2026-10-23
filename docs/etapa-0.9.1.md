# Etapa 0.9.1 — Infraestrutura de autenticação ativada no Supabase

A infraestrutura PostgreSQL de autenticação foi ativada em **22/10/2026 (America/Sao_Paulo)**, exclusivamente no projeto `wszrtvgjcgpgntsssbhd`, após autorização explícita e restauração de ensaio do backup. As cinco migrations estão aplicadas e os dois papéis runtime usam credenciais próprias sem BYPASSRLS.

**A aplicação permanece sem deploy.** SMTP externo, login público e operação de produção não foram comprovados. Nenhum usuário de teste foi criado no Supabase e a etapa 0.10 não foi iniciada.

## Projeto, conexão e pré-condições

O usuário informou o Project ID obtido no Dashboard, em Settings → General. A comparação independente com o destino configurado foi aprovada. Impressão digital da referência: `1188cc459e3294a01ca5349666a76adf2b31f6fa61dd73ace60f76d3ddd13ee7`.

O endpoint direto IPv6 foi utilizado com certificado/hostname validados, CA Supabase e TLS confirmado pelo próprio PostgreSQL 17.11. A sondagem anterior confirmou TLS 1.3. Node/Prisma no Windows alcançam esse endpoint; Docker Desktop bridge não tem a mesma rota IPv6, razão para usar pg_dump nativo Windows no backup.

A investigação do pooler distinguiu dois sockets: o cliente tinha TLS validado até o pooler, enquanto `pg_stat_ssl` informava `false` no backend aberto pelo pooler. A configuração da aplicação não controla o upstream gerenciado. Nenhum SSL Enforcement ou parâmetro gerenciado foi alterado. A alternativa direta eliminou essa dependência para esta ativação. Conexão direta IPv6 não exigiu IPv4 pago; revalidar conectividade em qualquer futuro ambiente de execução.

Antes de aplicar alterações, foram confirmados histórico/checksums, nomes runtime ausentes, duas cópias protegidas e igualdade dos dados/catálogo reais com o snapshot restaurado. Os SQLs das migrations anteriores não foram editados.

## Backup e recuperação

| Item                    | Resultado                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Clientes                | pg_dump e pg_restore Windows x64 17.11, portáteis em `.tools/postgresql17/native/pgsql/bin`; sem serviço/PATH global    |
| Escopo                  | ethos e ethos_technical: dados, enums, funções, constraints, índices, triggers, RLS, ownership e ACLs no arquivo custom |
| Consistência            | REPEATABLE READ READ ONLY com snapshot exportado/importado pelo pg_dump; sumários calculados no mesmo snapshot          |
| Backup principal        | `.backups/1188cc459e3294a01ca5349666a76adf2b31f6fa61dd73ace60f76d3ddd13ee7/before-auth.dump`                            |
| Segunda cópia           | `.backups/secondary/1188cc459e3294a01ca5349666a76adf2b31f6fa61dd73ace60f76d3ddd13ee7/before-auth.dump`                  |
| Tamanho de cada dump    | 214859 bytes                                                                                                            |
| SHA-256 das duas cópias | `e921c2220d7138110c04c5a982a69bed953e38009d3aec3a66c83269ec03d81a`                                                      |
| Proteção                | Diretórios com herança de ACL removida e acesso restrito ao executor; backup, manifesto e ferramentas fora do Git       |
| Restauração             | PostgreSQL 17.11 descartável, sem rede/portas publicadas; container e volume removidos                                  |
| Conferência             | 36 tabelas, 156 índices, 160 constraints, 76 triggers, 8 funções, 57 políticas, 71 labels de enums                      |
| RLS no snapshot         | 34 tabelas ENABLE/FORCE                                                                                                 |
| Dados restaurados       | Três linhas técnicas e zero linhas de negócio; contagens e SHA-256 de todas as tabelas iguais                           |

O backup completo foi criado às 21:43:51 e restaurado às 21:44:18 do dia 22/10/2026. A integridade e o frescor foram reconfirmados antes da ativação, junto da segunda cópia. O cliente pg_restore nativo leu o arquivo custom; o restore completo foi executado no container isolado. Um ensaio adicional com dados fictícios verificou precisão Decimal, datas, detecção de alteração por SHA-256 e independência da ordem física de inserção.

O arquivo preserva ownership/ACLs, mas o ensaio usa `--no-owner --no-privileges`, pois não cria papéis gerenciados do provedor localmente. Portanto não atesta restauração de privilégios no Supabase. As duas cópias estão na mesma máquina; ainda é necessário guardar cópia protegida fora dela segundo a política operacional. ACL não substitui criptografia em repouso. O backup cobre a aplicação, não toda a plataforma Supabase Auth/Storage.

Não existe rollback destrutivo automático. Em incidente, preservar arquivos/evidências, interromper uso das novas credenciais e diagnosticar. Preferir correção aditiva; restauração no banco real, descarte de objetos ou rotação de credenciais exigem plano específico, pois podem afetar escrita posterior.

## Migrations aplicadas

| Migration                                  | Alterações                                                                                                                                                                                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261022020000_auth_identity`             | Schema ethos_identity; oito tabelas auth, oito PKs, 14 índices explícitos, oito FKs, cinco checks; ENABLE/FORCE RLS e oito políticas identity_runtime; oito políticas de leitura de metadados e uma de cadastro em ethos; preserve_event e execução pública revogada |
| `20261022021000_auth_event_reason`         | Campo nullable AuthEvent.reason VARCHAR(500)                                                                                                                                                                                                                         |
| `20261022022000_auth_privilege_revocation` | Função trigger-only SECURITY DEFINER com search_path fixo e EXECUTE público revogado; oito triggers de revogação de sessões por mudança de privilégio                                                                                                                |

Nenhum DROP/TRUNCATE/DELETE foi executado nos objetos existentes. Os UPDATE/INSERT da função de revogação são comportamentos futuros disparados por mudanças sensíveis. Criar os triggers não reescreveu dados existentes.

As cinco migrations estão concluídas com checksums corretos. A tentativa antiga de 0.8 permanece explicitamente revertida no histórico; não há migration incompleta ou pendente. A comparação final confirmou preservação de todos os dados preexistentes, inclusive das três linhas originais do histórico Prisma. O catálogo externo à aplicação manteve 186 objetos e SHA-256 `cebeb792c6bfb14590ee62e1001fbe90d7f0fd47498c6ad6283df5f7954bcc33`.

## Papéis, credenciais e privilégios

Criados `ethos_auth_runtime` e `ethos_tenant_runtime`, ambos LOGIN/NOINHERIT/NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOREPLICATION, sem ownership ou associação a outros papéis.

- Auth: USAGE em ethos/ethos_identity; CRUD em sete tabelas auth; apenas SELECT/INSERT em AuthEvent; SELECT em oito tabelas de metadados e INSERT em User. Sem escrita de negócio.
- Tenant: USAGE em ethos; SELECT nas 29 tabelas organizacionais explicitamente listadas; sem escrita de negócio, acesso ao schema identity ou leitura concedida às cinco tabelas globais.

O SQL `prepare-auth-runtime.sql` limita concessões aos dois papéis e schemas da aplicação, é transacional/idempotente e rejeita atributos elevados, memberships e ownership inesperados. Não foram modificados anon/authenticated/service_role/postgres, objetos do Supabase ou privilégios padrão de schemas gerenciados. O proprietário administrativo mantém seu bypass necessário aos triggers definer; runtime nunca usa essa credencial.

Senhas independentes foram geradas e atribuídas com SCRAM-SHA-256. URLs, chave de cookies e chave de criptografia foram armazenadas somente em `.secrets/auth-runtime.env`, com ACL restrita e exclusão do Git. Não foram impressas, copiadas para exemplos ou instaladas em um serviço. O `.env` existente não foi reescrito; o ambiente administrativo direto foi fornecido privadamente aos subprocessos. Não apagar o arquivo nem repetir credentials para forçar rotação. Preservar a chave de criptografia em cofre seguro antes de uso operacional.

## RLS, API e isolamento

Após ativação: 42 tabelas de negócio/identidade com ENABLE/FORCE RLS, incluindo as oito novas tabelas auth, com oito políticas identity_runtime. A função de revogação permanece definer com proprietário administrativo, search_path=pg_catalog e EXECUTE público revogado.

As políticas organizacionais aplicam-se a PUBLIC, mas isso não concede privilégios SQL por si só. Os grants explícitos e RLS continuam necessários. O papel auth tem acesso global deliberado aos metadados de identidade; não deve ser usado nas consultas de negócio. SUPER_ADMIN permanece separado e não confere bypass organizacional implícito.

`withOrganization` usa a mesma conexão/transação e `set_config(..., true)`, valida usuário/vínculo e organização ativos. A API deve derivar identidade da sessão e validar seleção organizacional/RBAC no servidor, sem confiar no organizationId recebido. O GUC não é prova criptográfica: credencial SQL comprometida ou SQL injection podem definir contexto; proteção de segredos e autorização da API continuam obrigatórias. O startup exige current_user=session_user e recusa credencial administrativa disfarçada por SET ROLE.

## Configuração por ambiente

| Escopo                | Variáveis e condições                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administração         | DIRECT_DATABASE_URL direta privilegiada; EXPECTED_SUPABASE_PROJECT_REF independente; PG_DUMP_PATH/PG_RESTORE_PATH nativos 17; ETHOS_LOCAL_DATABASE=0 no Supabase                       |
| API                   | AUTH_IDENTITY_DATABASE_URL auth; DATABASE_URL tenant; AUTH_COOKIE_SECRET; AUTH_ENCRYPTION_KEY; NODE_ENV, API_HOST/API_PORT, WEB_ORIGIN/CORS_ORIGINS; SMTP_HOST/PORT/FROM/USER/PASSWORD |
| Web, somente servidor | ETHOS*API_ORIGIN, ETHOS_WEB_ORIGIN; nenhuma credencial em NEXT_PUBLIC*\*                                                                                                               |
| Testes                | ETHOS_AUTH_TEST_DATABASE_URL apenas loopback/banco ethos_auth_test; ETHOS_LOCAL_DATABASE=1 somente nesse ambiente isolado                                                              |

Preparação local permite HTTP localhost sem deploy/HTTPS público; PostgreSQL remoto continua com TLS estrito. Produção futura exige origens HTTPS consistentes e cookies HttpOnly/SameSite=Lax/Secure com prefixo \_\_Host-, Path=/ e sem Domain. Tokens opacos: access 5 minutos, refresh 7 dias, sessão absoluta 30 dias; MFA e reautenticação recente conforme políticas 0.9. AUTH_ENCRYPTION_KEY tem 32 bytes em base64 e não pode ser perdida/rotacionada sem plano.

SMTP exige TLS e certificado válido: 465 implícito ou 587 STARTTLS, remetente autorizado e credenciais próprias. Não houve envio externo. Entrega, DNS/SPF/DKIM/DMARC, HTTPS público, proxy confiável e quotas distribuídas permanecem pendentes de validação no ambiente de execução.

## Execução e resultados

Com ambiente privado apontando ao endpoint direto e Project ID confirmado, a sequência aprovada foi executada uma vez e sem falhas:

```powershell
node packages/database/scripts/auth-activation.mjs deploy --approved
node packages/database/scripts/auth-activation.mjs grants --approved
node packages/database/scripts/auth-activation.mjs credentials --approved
```

O modo deploy chama **prisma migrate deploy**, não publica a aplicação. Nomes/SHA-256 das cinco migrations são fixados no executor; migration futura, SQL diferente, destino divergente, histórico incompleto ou backup não verificado interrompem a execução. Não usar migrate dev/reset ou db push neste banco.

| Verificação executada após ativação     | Resultado                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma validate/generate/status/check   | Aprovados; cinco migrations/checksums corretos, zero pendentes                                                                           |
| Logins runtime reais                    | Aprovados; logins próprios, atributos seguros, sem ownership/membership administrativo                                                   |
| TLS runtime real                        | Backend criptografado e certificado validado                                                                                             |
| Privilégios e RLS reais                 | Negação sem organização/com contexto inválido; contexto local limpo no pool reutilizado; identity e escrita de negócio negados ao tenant |
| Plugin Fastify com logins reais         | Startup aprovado e requisição sem sessão recusada; sem listener, workers, envio de e-mail ou fixtures                                    |
| Preservação de dados reais              | Todos os dados/linhas antigas de migration iguais ao backup; tabelas auth vazias                                                         |
| Database lint/typecheck/build/unitários | Aprovados; 14 testes unitários                                                                                                           |
| API lint/typecheck/build/unitários      | Aprovados; 3 testes unitários                                                                                                            |
| Integração auth, PostgreSQL descartável | 9 testes: cadastro/ações, sessões/replay, RBAC/RLS, CSRF/cookies, MFA, throttling, revogação, logs e auditoria                           |
| Integridade 0.8, PostgreSQL descartável | 14 grupos: FKs compostas, finanças, histórico, exclusões, auditoria e isolamento                                                         |
| Contexto Prisma, PostgreSQL descartável | 9 verificações de transação, commit/rollback, membership e ausência de vazamento no pool                                                 |
| SQL de grants, banco descartável        | Idempotência, privilégios mínimos e rejeição de BYPASSRLS aprovados                                                                      |

Não foram repetidos build/browser do frontend: somente comentários no .env.example mudaram. Relatórios históricos 0.8/0.9 foram preservados. Fixtures das integrações ficaram exclusivamente no PostgreSQL descartável.

Evidências: [ativação/pré-condições](etapa-0.9.1-activation.json), [auditoria final](etapa-0.9.1-activation-audit.json), [verificação real](etapa-0.9.1-activation-verification.json), [backup completo](etapa-0.9.1-full-backup.json). Os JSON de auditorias/preparações anteriores registram estados históricos, não o estado atual.

## Pendências e Git

Ainda não há comprovação de autenticação operacional em produção: aplicação não publicada, SMTP real não validado e nenhum usuário/vínculo/RBAC de negócio criado automaticamente. Antes da operação, instalar os segredos em ambiente seguro, preservar chaves fora da máquina, validar limites de conexão, proxy, cookies e e-mail. Dois pools de até cinco conexões por processo precisam respeitar os limites do projeto.

Para a futura 0.10, continuam pendentes integração dos módulos de negócio, escopos read_own e mapeamento de usuários a proprietário/inquilino. Convites/provisioning de organizações, coordenação de refresh entre abas, recuperação operacional de MFA, retenção de eventos e observabilidade mantêm as limitações documentadas na 0.9. Nenhuma dessas funcionalidades foi iniciada aqui.

Arquivos desta etapa: três .env.example, .gitignore, scripts de auditoria/backup/ativação/verificação, testes das proteções e documentação/evidências. Backups, ferramentas, segredos e outputs gerados estão excluídos do Git. Revisão privada final: 210 arquivos versionáveis, zero correspondências com credenciais locais/recém-geradas ou blocos de chave privada; ACL do diretório de segredos protegida, com uma regra explícita de acesso. O container/volume dos testes finais foi removido. `git diff --check` aprovado; SQLs de migrations intactos; origin/main confirmado alinhado à base antes do commit. Commit autorizado: `feat(auth): ativa infraestrutura de autenticacao no Supabase`; push para origin/main somente após revisão final e validações, sem force. Hash e resultado são apresentados no relatório final da execução.

Referências primárias: [Supabase conexão/IPv6](https://supabase.com/docs/guides/database/connecting-to-postgres), [IPv4 e planos](https://supabase.com/docs/guides/platform/ipv4-address), [Supavisor TLS](https://supabase.github.io/supavisor/configuration/tenants/), [PostgreSQL 17 CREATE ROLE](https://www.postgresql.org/docs/17/sql-createrole.html), [RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [backup Free](https://supabase.com/docs/guides/platform/backups), [clientes Windows](https://www.postgresql.org/download/windows/).
