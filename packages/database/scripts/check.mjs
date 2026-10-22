import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createDatabaseClient } from "../dist/index.js";

config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
let database;
try {
  database = createDatabaseClient({ maxConnections: 1 });
  const result = await database.prisma
    .$queryRaw`SELECT 1::int AS ok, current_setting('server_version') AS version`;
  const technicalRows = await database.prisma.infrastructureCheck.count();
  const applied = await database.prisma
    .$queryRaw`SELECT migration_name, checksum, finished_at IS NOT NULL AS applied, rolled_back_at IS NOT NULL AS rolled_back FROM ethos_technical._prisma_migrations ORDER BY started_at`;
  const migrations = applied.map(({ checksum, ...migration }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(migration.migration_name))
      throw new Error("Nome de migration inválido.");
    // Aborted, explicitly rolled-back attempts remain in Prisma's history.
    // Their original SQL need not match a subsequently corrected, unapplied migration.
    if (migration.rolled_back) return { ...migration, checksumMatches: null };
    if (!migration.applied) throw new Error("Migration não concluída.");
    const sql = readFileSync(
      new URL(
        `../prisma/migrations/${migration.migration_name}/migration.sql`,
        import.meta.url,
      ),
    );
    const checksumMatches =
      createHash("sha256").update(sql).digest("hex") === checksum;
    if (!checksumMatches)
      throw new Error(
        "Checksum da migration aplicada difere do arquivo local.",
      );
    return { ...migration, checksumMatches };
  });
  console.log(
    JSON.stringify(
      { connected: true, query: result, technicalRows, migrations },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      connected: false,
      code:
        typeof error?.code === "string" ? error.code : "DATABASE_CHECK_FAILED",
      message:
        "Falha no diagnóstico; verifique configuração, rede, certificado e migrations. Credenciais omitidas.",
    }),
  );
  process.exitCode = 1;
} finally {
  await database?.disconnect();
}
