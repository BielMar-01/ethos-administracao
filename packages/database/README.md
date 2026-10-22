# @ethos/database

Infraestrutura PostgreSQL/Prisma 7.10.1 para **servidor Node.js 24+**. Não importe este pacote em Client Components ou navegadores.

## Preparação

1. Instale com `pnpm.cmd install --frozen-lockfile` na raiz.
2. Copie `.env.example` para `.env` no pacote e preencha as duas URLs localmente. Não versione o arquivo.
3. `DATABASE_URL`: conexão de runtime. `DIRECT_DATABASE_URL`: conexão direta ou pooler Supabase em modo sessão (5432), não transacional (6543). Codifique caracteres especiais da senha na URL.
4. Execute na raiz:

```powershell
pnpm.cmd --filter @ethos/database db:validate
pnpm.cmd --filter @ethos/database build
pnpm.cmd --filter @ethos/database db:deploy
pnpm.cmd --filter @ethos/database db:status
pnpm.cmd --filter @ethos/database db:check
```

O certificado público em `certs` é carregado explicitamente, com validação TLS estrita. Não use `rejectUnauthorized: false`. Os comandos locais carregam `.env` relativo ao pacote, sem depender do diretório atual. A biblioteca de runtime **não** carrega `.env` automaticamente: o processo consumidor deve fornecer `DATABASE_URL` antes de criar o cliente.

## Uso servidor e ciclo de vida

```ts
import { createDatabaseClient } from "@ethos/database";

const database = createDatabaseClient();
// Sem abrir conexão até a primeira consulta.
const result = await database.prisma.$queryRaw`SELECT 1::int AS ok`;
// Exemplo em Fastify: fechar o cliente ao encerrar a aplicação.
app.addHook("onClose", async () => {
  await database.disconnect();
});
```

Crie uma instância por aplicação, nunca por requisição. `createDatabaseClient` permite configurar `connectionString`, `maxConnections` (1–20, padrão 5) e um callback de erro de pool que recebe somente código sanitizado. Há timeouts de conexão/consulta e encerramento idempotente do Prisma e do pool PostgreSQL.

Quando for necessário compartilhar uma instância entre módulos do mesmo processo, use `getDatabaseClient()` e finalize com `disconnectDatabase()`. O singleton também evita pools repetidos durante recarregamento de módulos. O pacote não registra handlers globais de sinais; o servidor é responsável por seu shutdown.

O entrypoint `browser`/não Node bloqueia o uso e não exporta o driver PostgreSQL. O client gerado não é um subpath público. Gere/compile o pacote antes de compilar consumidores dos exports em `dist`.

## Migrations

A primeira migration cria somente `ethos_technical.infrastructure_checks`, sem inserir registros. O histórico fica em `ethos_technical._prisma_migrations`. Os schemas do Supabase não são gerenciados por este pacote.

Use `db:deploy` para aplicar migrations versionadas. `db:migrate` utiliza `migrate dev` e deve ser usado somente em um banco de desenvolvimento isolado, com shadow database próprio quando necessário. Não o execute sobre o banco compartilhado para contornar drift. Não use reset ou db push como substituto de migrations.

O wrapper CLI tem saída sanitizada e limite de 60 segundos. `db:check` faz apenas leituras, consulta a tabela técnica e confere o checksum das migrations aplicadas.

## Testes

```powershell
pnpm.cmd --filter @ethos/database build
pnpm.cmd --filter @ethos/database test
pnpm.cmd --filter @ethos/api build
pnpm.cmd --filter @ethos/api test
```

Os testes automatizados não dependem de banco acessível. `db:check` é uma verificação de integração real e exige configuração local válida. Mais detalhes em `docs/etapa-0.7.md` na raiz do monorepo.
