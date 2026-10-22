import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
const url =
  process.env.ETHOS_AUTH_TEST_DATABASE_URL ??
  "postgresql://postgres:ethos-local-disposable@127.0.0.1:55439/ethos_auth_test";
const parsed = new URL(url);
if (
  !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
  parsed.pathname != "/ethos_auth_test"
)
  throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
const result = spawnSync(
  process.execPath,
  ["scripts/prisma.mjs", "migrate", "deploy"],
  {
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env,
      DIRECT_DATABASE_URL: url,
      ETHOS_LOCAL_DATABASE: "1",
    },
    encoding: "utf8",
  },
);
if (result.status !== 0) {
  console.error("TEST_MIGRATION_FAILED");
  process.exit(1);
}
const c = new pg.Client({ connectionString: url, ssl: false });
try {
  await c.connect();
  let sql = readFileSync(
    new URL("./provision-auth.sql", import.meta.url),
    "utf8",
  );
  const existing = (
    await c.query(
      "SELECT rolname,rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime')",
    )
  ).rows;
  if (existing.length) {
    if (
      existing.length !== 2 ||
      existing.some((r) => r.rolsuper || r.rolbypassrls || r.rolcreaterole)
    )
      throw Error("UNEXPECTED_TEST_ROLES");
    sql = sql.replace(/^CREATE ROLE.*;$/gm, "");
  }
  await c.query(sql);
  await c.query(
    "ALTER ROLE ethos_auth_runtime PASSWORD 'ethos-runtime-test-only'",
  );
  await c.query(
    "ALTER ROLE ethos_tenant_runtime PASSWORD 'ethos-tenant-test-only'",
  );
  console.log(
    JSON.stringify({
      isolated: true,
      migrationsApplied: true,
      runtimeRolesProvisioned: true,
    }),
  );
} catch {
  console.error("ISOLATED_SETUP_FAILED");
  process.exitCode = 1;
} finally {
  await c.end();
}
