// Stage 0.11.1: SELECT-only source transaction. Never starts application workers.
import assert from "node:assert/strict";
import { config } from "dotenv";
import pg from "pg";
import { isIP } from "node:net";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { poolConfiguration } from "../dist/settings.js";
import { supabaseTarget } from "./supabase-target.mjs";
import {
  reviewedGrants,
  sha256,
  approvedProject,
} from "./business-activation-guards.mjs";
const mode = process.argv[2];
if (mode !== "audit") throw Error("READ_ONLY_AUDIT_REQUIRED");
config({ path: new URL("../.env", import.meta.url), quiet: true });
const checked = supabaseTarget(
  process.env.DIRECT_DATABASE_URL,
  approvedProject,
);
const url = new URL(checked.url);
url.hostname = `db.${approvedProject}.supabase.co`;
url.username = decodeURIComponent(url.username).split(".")[0];
url.search = "";
const c = new pg.Client(poolConfiguration(url.toString(), 1));
let stage = "connect";
try {
  await c.connect();
  await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const s = c.connection.stream;
  const tls = {
    direct: true,
    ipv6: isIP(s.remoteAddress) === 6,
    encrypted: s.encrypted === true,
    authorized: s.authorized === true,
    backendTls:
      (await c.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()"))
        .rows[0]?.ssl === true,
  };
  assert.ok(Object.values(tls).every(Boolean));
  stage = "migrations";
  const directory = new URL("../prisma/migrations/", import.meta.url);
  const local = readdirSync(directory)
    .filter((n) => /^\d+_/.test(n))
    .sort();
  const history = (
    await c.query(
      "SELECT migration_name,checksum,finished_at IS NOT NULL AS applied FROM ethos_technical._prisma_migrations WHERE rolled_back_at IS NULL ORDER BY migration_name",
    )
  ).rows;
  for (const m of history) {
    assert.ok(local.includes(m.migration_name) && m.applied);
    assert.equal(
      m.checksum,
      sha256(
        readFileSync(new URL(`${m.migration_name}/migration.sql`, directory)),
      ),
    );
  }
  const pending = local.filter(
    (n) => !history.some((m) => m.migration_name === n),
  );
  assert.deepEqual(pending, ["20261024000000_mutation_consistency"]);
  stage = "privileges";
  const plan = readFileSync(
      new URL("./propose-business-runtime.sql", import.meta.url),
      "utf8",
    ),
    grants = reviewedGrants(plan);
  const columns = (
    await c.query(
      `SELECT c.relname AS table,a.attname AS column,has_column_privilege('ethos_tenant_runtime',c.oid,a.attnum,'INSERT') AS insert,has_column_privilege('ethos_tenant_runtime',c.oid,a.attnum,'UPDATE') AS update FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ethos' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attname`,
    )
  ).rows;
  for (const col of columns)
    for (const privilege of ["INSERT", "UPDATE"])
      assert.equal(
        col[privilege.toLowerCase()],
        grants.some(
          (g) =>
            g.table === col.table &&
            g.privilege === privilege &&
            g.columns.includes(col.column),
        ),
      );
  const roles = (
    await c.query(
      "SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolinherit FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime') ORDER BY rolname",
    )
  ).rows;
  assert.equal(roles.length, 2);
  assert.ok(
    roles.every(
      (r) =>
        r.rolcanlogin &&
        !r.rolsuper &&
        !r.rolbypassrls &&
        !r.rolcreatedb &&
        !r.rolcreaterole &&
        !r.rolreplication &&
        !r.rolinherit,
    ),
  );
  const tables = (
    await c.query(
      `SELECT n.nspname AS schema,c.relname AS table,c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced,has_table_privilege('ethos_tenant_runtime',c.oid,'DELETE') AS delete FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('ethos','ethos_identity','ethos_technical') AND c.relkind='r' ORDER BY n.nspname,c.relname`,
    )
  ).rows;
  assert.ok(
    tables
      .filter((t) => t.schema === "ethos")
      .every((t) => t.enabled && t.forced && !t.delete),
  );
  const runtimeMemberships = (
    await c.query(
      "SELECT count(*)::int AS n FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime'))",
    )
  ).rows[0].n;
  assert.equal(runtimeMemberships, 0);
  const runtimeOwnership = (
    await c.query(
      "SELECT (SELECT count(*) FROM pg_class WHERE relowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime'))) + (SELECT count(*) FROM pg_namespace WHERE nspowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime'))) + (SELECT count(*) FROM pg_proc WHERE proowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime'))) AS n",
    )
  ).rows[0].n;
  assert.equal(Number(runtimeOwnership), 0);
  const paths = [
    "../prisma/migrations/20261024000000_mutation_consistency/migration.sql",
    "./propose-consistency-runtime.sql",
    "./propose-business-runtime.sql",
  ];
  const report = {
    at: new Date().toISOString(),
    projectId: approvedProject,
    sourceReadOnly: true,
    sourceWrites: false,
    tls,
    migrations: {
      applied: history.map((m) => m.migration_name),
      pending,
      checksumsMatch: true,
    },
    businessPrivilegesMatchApproved: true,
    currentWrites: columns.filter((c) => c.insert || c.update),
    roles,
    runtimeMemberships,
    runtimeOwnedRelationsSchemasFunctions: Number(runtimeOwnership),
    tables,
    sqlHashes: Object.fromEntries(
      paths.map((p) => [p, sha256(readFileSync(new URL(p, import.meta.url)))]),
    ),
  };
  await c.query("ROLLBACK");
  writeFileSync(
    new URL("../../../docs/etapa-0.11.1-audit.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      projectId: approvedProject,
      readOnly: true,
      tls,
      applied: history.length,
      pending,
      businessPrivilegesMatchApproved: true,
      applicationTables: tables.length,
      forcedRlsTables: tables.filter((t) => t.enabled && t.forced).length,
    }),
  );
} catch (error) {
  await c.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({ failed: true, stage, code: error.code ?? error.name }),
  );
  process.exitCode = 1;
} finally {
  await c.end();
}
