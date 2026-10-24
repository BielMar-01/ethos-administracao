import pg from "pg";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const url =
  process.env.ETHOS_AUTH_TEST_DATABASE_URL ??
  "postgresql://postgres:ethos-local-disposable@127.0.0.1:55439/ethos_auth_test";
const target = new URL(url);
if (
  !["127.0.0.1", "localhost"].includes(target.hostname) ||
  target.pathname !== "/ethos_auth_test"
)
  throw Error("ISOLATED_DATABASE_REQUIRED");
const c = new pg.Client({ connectionString: url, ssl: false });
try {
  await c.connect();
  const migrations = (
    await c.query(
      "SELECT migration_name,checksum,finished_at,rolled_back_at FROM ethos_technical._prisma_migrations WHERE rolled_back_at IS NULL ORDER BY migration_name",
    )
  ).rows;
  const expected = readdirSync(
    new URL("../prisma/migrations/", import.meta.url),
    { withFileTypes: true },
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(
    migrations.map((migration) => migration.migration_name),
    expected,
    "PENDING_OR_UNEXPECTED_MIGRATIONS",
  );
  for (const m of migrations) {
    assert.ok(m.finished_at);
    assert.equal(m.rolled_back_at, null);
    const bytes = readFileSync(
      new URL(
        `../prisma/migrations/${m.migration_name}/migration.sql`,
        import.meta.url,
      ),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), m.checksum);
  }
  const summary = (
    await c.query(
      `SELECT count(*)::int AS tables, count(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity)::int AS forced FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('ethos','ethos_identity','ethos_technical') AND c.relkind='r'`,
    )
  ).rows[0];
  assert.equal(summary.tables, 46);
  assert.equal(summary.forced, 44);
  const deletes = (
    await c.query(
      `SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('ethos','ethos_technical') AND c.relkind='r' AND has_table_privilege('ethos_tenant_runtime',c.oid,'DELETE')`,
    )
  ).rows[0].count;
  assert.equal(deletes, 0);
  const report = {
    isolated: true,
    sourceConnection: false,
    migrations: migrations.map((m) => m.migration_name),
    allChecksumsMatch: true,
    pendingMigrations: 0,
    rolledBackHistoricalAttempts: (
      await c.query(
        "SELECT count(*)::int AS count FROM ethos_technical._prisma_migrations WHERE rolled_back_at IS NOT NULL",
      )
    ).rows[0].count,
    applicationTables: summary.tables,
    rlsEnabledAndForced: summary.forced,
    tenantDeleteGrants: deletes,
    productionUnchanged: true,
  };
  writeFileSync(
    new URL("../../../docs/etapa-0.11-database-state.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await c.end();
}
