# Etapa 0.7 — Infraestrutura PostgreSQL e Prisma

Entrega de 22/10/2026. Escopo: conexão, migrations e pacote de acesso ao banco, sem implementar entidades de negócio ou iniciar a etapa 0.8.

## Bloco A — Diagnóstico

Foram inspecionados monorepo, API Fastify, pacote de banco, versões, variáveis e estado do Git. Prisma CLI, client e adapter-pg estão em **7.10.1**, com Node **24.19.0**. As configurações de pacote/workspace/lockfile iniciadas pelo usuário foram preservadas e concluídas.

As duas variáveis apontavam ao mesmo servidor/usuário/banco, mas `DIRECT_DATABASE_URL` utilizava o pooler transacional na porta 6543. Apenas essa porta foi ajustada para o pooler de sessão 5432, mantendo as credenciais. O arquivo `.env` permanece local e ignorado. Não houve troca de senha ou impressão de seus valores.

A conexão inicialmente falhou com `SELF_SIGNED_CERT_IN_CHAIN`. O certificado público oficial **Supabase Root 2021 CA** resolveu a verificação, mantendo validação de cadeia e hostname no driver. Não foi usado `rejectUnauthorized: false`, nem desativada a verificação TLS.

O teste real retornou `SELECT 1 = 1` e PostgreSQL **17.11**, com TLS autorizado no trecho cliente→pooler. A sessão reportada pelo PostgreSQL atrás do pooler não é a mesma conexão TLS do cliente; não foi alterada a configuração interna de SSL/enforcement do Supabase.

O inventário encontrou `public` vazio e objetos dos schemas gerenciados `auth`, `storage`, `realtime`, `extensions` e `vault`. Esses objetos não foram incorporados ao schema Prisma nem alterados. A restrição de acesso do ambiente exigiu execução elevada de comandos que leem certas dependências instaladas e acessam a rede. A reinstalação pelo lockfile não mudou a versão do Prisma.

## Bloco B — Migration aplicada

Migration: **`20261022000000_init_infrastructure`**.

Arquivo: `packages/database/prisma/migrations/20261022000000_init_infrastructure/migration.sql`.

A prévia foi gerada com `prisma migrate diff --from-empty --to-schema ... --script`, revisada e qualificada explicitamente com o schema técnico. O SQL é transacional e contém somente criação do schema `ethos_technical` e da tabela `infrastructure_checks`, com `id` UUID e `created_at`. Não há modelos de negócio, seed ou inserção de registros técnicos. O histórico Prisma fica no mesmo schema isolado.

A aplicação foi feita por **`prisma migrate deploy`**, não por reset ou db push. `migrate status` confirmou banco atualizado. A comparação posterior entre banco e schema retornou SQL vazio, sem drift. O checksum do arquivo aplicado é conferido por `db:check`.

O catálogo fora de `ethos_technical` possuía 186 objetos no inventário detalhado. Seu hash SHA-256 antes e depois permaneceu:

```text
cebeb792c6bfb14590ee62e1001fbe90d7f0fd47498c6ad6283df5f7954bcc33
```

Isso confirma a preservação do catálogo inspecionado; não foi realizada leitura ou alteração de dados pessoais. Nenhum SQL de exclusão, atualização ou limpeza foi executado. Não foi necessário baseline de objetos do Supabase, pois o Prisma gerencia exclusivamente o novo schema técnico, que estava vazio antes da migration.

## Bloco C — Pacote compartilhado

`@ethos/database` possui exports ESM e declarações TypeScript, client gerado compatível com NodeNext e dependências Prisma fixadas em 7.10.1. Os fontes gerados e builds são ignorados; a geração ocorre antes do build/typecheck.

Exports públicos:

- `createDatabaseClient(options?)`: factory lazy para uma aplicação.
- `getDatabaseClient()`: singleton de processo, reutilizável entre módulos.
- `disconnectDatabase()`: encerra e libera o singleton.
- Tipos `DatabaseClient`, `DatabaseOptions` e `PrismaClient`.

O driver usa `pg.Pool` com padrão de 5 conexões, faixa configurável de 1–20, timeout de conexão de 10 segundos, idle de 30 segundos e timeout de consulta de 15 segundos. O Prisma usa `@prisma/adapter-pg`. A aplicação é responsável por chamar o encerramento; o pacote fecha Prisma e pool de forma idempotente. Não são instalados handlers globais de sinais.

A CA oficial é usada explicitamente. Parâmetros SSL da URL de runtime não podem substituir a configuração segura do driver. Para o CLI, a configuração define `sslmode=require`, `sslaccept=strict`, caminho absoluto da CA e schema técnico. URLs e credenciais são sanitizadas na saída do wrapper de comandos; falhas de diagnóstico são exibidas por código, sem detalhes do driver.

Os exports condicionais bloqueiam importação em navegador/não Node. O pacote não importa `.env` no runtime; consumidores de servidor devem fornecer `DATABASE_URL`. A API recebeu somente a dependência workspace e um teste de compatibilidade: o teste decorou uma instância Fastify com o cliente, verificou o health existente e fechou o cliente no `onClose`. O código de endpoints e o comportamento normal de inicialização da API não foram alterados. Não houve integração frontend/backend.

## Bloco D — Validações executadas

| Comando/verificação                                                                                              | Resultado                                                                                  |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm.cmd --filter @ethos/database db:validate`                                                                  | Schema válido                                                                              |
| `pnpm.cmd --filter @ethos/database db:generate`                                                                  | Prisma Client 7.10.1 gerado; também executado pelo build/typecheck                         |
| `pnpm.cmd --filter @ethos/database db:deploy`                                                                    | Migration inicial aplicada                                                                 |
| `pnpm.cmd --filter @ethos/database db:status`                                                                    | Banco atualizado, uma migration                                                            |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code --script` via wrapper | Sem diferenças; saída vazia                                                                |
| `pnpm.cmd --filter @ethos/database db:check`                                                                     | Conexão real, SELECT 1, tabela técnica vazia, migration aplicada e checksum correspondente |
| `pnpm.cmd --filter @ethos/database typecheck`                                                                    | Aprovado                                                                                   |
| `pnpm.cmd --filter @ethos/database build`                                                                        | Aprovado                                                                                   |
| `pnpm.cmd --filter @ethos/database test`                                                                         | 9 testes aprovados                                                                         |
| `pnpm.cmd --filter @ethos/api typecheck`                                                                         | Aprovado                                                                                   |
| `pnpm.cmd --filter @ethos/api build`                                                                             | Aprovado                                                                                   |
| `pnpm.cmd --filter @ethos/api test`                                                                              | 1 teste de compatibilidade Fastify aprovado                                                |

Os testes locais cobrem URL/configuração, pool, TLS, bloqueio de pooler transacional para migrations, fingerprint da CA, shutdown idempotente, singleton, export browser, sanitização e caráter aditivo da migration. Os testes locais não usam credenciais reais. O diagnóstico de integração real é separado e somente leitura.

Não há configuração real de lint para os pacotes de banco/API nesta etapa. O script anterior da API apenas informa que o lint não está configurado; ele não foi tratado como validação aprovada. O frontend não foi alterado.

## Arquivos criados e modificados

```text
.gitignore
pnpm-workspace.yaml                      # alterações preexistentes necessárias ao Prisma preservadas
pnpm-lock.yaml                           # instalação inicial do usuário e dependência workspace
apps/api/package.json
apps/api/tests/database-package.test.mjs
packages/database/
  .env                                   # ajuste local; não versionado
  .env.example
  .gitattributes                         # SQL de migration preservado com LF
  README.md
  package.json
  tsconfig.json
  prisma.config.ts
  certs/
    README.md
    supabase-ca.crt                       # certificado PÚBLICO, não chave privada
  prisma/
    schema.prisma
    migrations/
      migration_lock.toml
      20261022000000_init_infrastructure/migration.sql
  src/
    index.ts
    client.ts
    settings.ts
    server-only.ts
    generated/prisma/                     # gerado; ignorado
  scripts/
    prisma.mjs
    redact.mjs
    check.mjs
  tests/database.test.mjs
docs/etapa-0.7.md
```

O diretório preexistente vazio `packages/tes` não foi alterado nem incorporado ao commit. `.env`, `node_modules`, `dist`, caches e o client gerado ficam fora do Git. A CA pública pode ser versionada com segurança; não contém chave privada.

## Bloco E — GitHub

Branch de entrega: `main`. Remoto existente: `https://github.com/BielMar-01/ethos-administracao.git`.

Commit solicitado:

```text
feat(database): conclui infraestrutura Prisma e PostgreSQL
```

O staging é restrito aos arquivos pertinentes desta etapa e às configurações iniciais do pacote necessárias ao funcionamento. Antes do commit são conferidos arquivos ignorados e presença de credenciais reais, sem imprimir os segredos usados na comparação. O push usa `git push origin main`, sem force push. O resultado e o hash remoto são registrados no relatório final; o commit da implementação é identificável pela mensagem acima.

## Execução e pendências

Use Node 24+ e pnpm 11.23.0. Preencha localmente `packages/database/.env` a partir do exemplo e execute na raiz:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd --filter @ethos/database build
pnpm.cmd --filter @ethos/database db:validate
pnpm.cmd --filter @ethos/database db:status
pnpm.cmd --filter @ethos/database db:check
pnpm.cmd --filter @ethos/database test
pnpm.cmd --filter @ethos/api build
pnpm.cmd --filter @ethos/api test
```

`db:deploy` aplica migrations versionadas pendentes. `db:migrate` deve ser reservado a banco de desenvolvimento isolado; nenhum shadow database foi necessário para a aplicação desta migration. Não use reset/db push para resolver divergências no banco compartilhado.

Os modelos de negócio completos, autenticação, permissões de aplicação, endpoints de negócio, integração da API ao frontend e estratégia de migrations de futuras fases permanecem fora do escopo. A role de acesso fornecida pelo usuário foi preservada; uma role de aplicação com privilégios mínimos deve ser planejada antes do uso real de negócio. A configuração do trecho pooler→PostgreSQL segue sob gestão do Supabase e não foi modificada nesta execução. A etapa 0.8 não foi iniciada.

Referências oficiais consultadas:

- [Supabase e Prisma](https://supabase.com/docs/guides/database/prisma).
- [Modos de conexão do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).
- [TLS e certificados do Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement).
- [Conector PostgreSQL do Prisma 7](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql).
- [Comandos de migration do Prisma 7](https://www.prisma.io/docs/cli/v7/migrate).
