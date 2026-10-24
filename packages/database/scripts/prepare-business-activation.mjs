import {
  applicationCatalogSql as schemaSql,
  applicationAclSql as aclSql,
} from "./business-backup-integrity.mjs";
// Read-only Supabase preparation. There is intentionally no grant/deploy mode.
import assert from "node:assert/strict";
import { config } from "dotenv";
import pg from "pg";
import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  statSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { poolConfiguration, caFile } from "../dist/settings.js";
import { supabaseTarget } from "./supabase-target.mjs";
import { dataIntegritySql } from "./backup-integrity.mjs";
import {
  canonicalConstraints,
  canonicalTableAcl,
} from "./normalize-business-backup.mjs";
const expected = "wszrtvgjcgpgntsssbhd",
  root = fileURLToPath(new URL("../../../", import.meta.url));
const mode = process.argv[2];
if (!["audit", "backup"].includes(mode))
  throw Error("READ_ONLY_PREPARATION_MODE_REQUIRED");
config({ path: new URL("../.env", import.meta.url), quiet: true });
const source = supabaseTarget(process.env.DIRECT_DATABASE_URL, expected),
  url = new URL(source.url);
url.hostname = `db.${expected}.supabase.co`;
url.username = decodeURIComponent(url.username).split(".")[0];
url.search = "";
assert(supabaseTarget(url.toString(), expected).direct);

const sha = (value) => createHash("sha256").update(value).digest("hex");
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const plan = readFileSync(
  new URL("./propose-business-runtime.sql", import.meta.url),
  "utf8",
);
const grants = [
  ...plan.matchAll(
    /GRANT (INSERT|UPDATE) \(([^)]+)\) ON ethos\."(\w+)" TO ethos_tenant_runtime;/g,
  ),
].map((m) => ({
  table: m[3],
  privilege: m[1],
  columns: m[2].split(", ").map((s) => s.slice(1, -1)),
}));
assert.equal(grants.length, 44);
assert(
  !/\bGRANT\s+(DELETE|ALL|TRUNCATE)\b|ALTER\s+ROLE|CREATE\s+ROLE/i.test(plan),
);
const client = new pg.Client(poolConfiguration(url.toString(), 1));
let container,
  stage = "connect";
const run = (exe, args, options = {}) => {
  const r = spawnSync(exe, args, {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 30 * 1024 * 1024,
    ...options,
  });
  if (r.status !== 0) throw Error(`${stage}_COMMAND_FAILED`);
  return r.stdout;
};
const report = {
  projectId: expected,
  at: new Date().toISOString(),
  sourceWrites: false,
  grantsApplied: false,
  deploy: false,
  sqlSha256: sha(plan),
  grants,
};

try {
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  const tls = client.connection.stream;
  const backend = (
    await client.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()")
  ).rows[0];
  report.connection = {
    direct: true,
    ipv6: isIP(tls.remoteAddress) === 6,
    encrypted: tls.encrypted === true,
    authorized: tls.authorized === true,
    backendTls: backend?.ssl === true,
  };
  assert(Object.values(report.connection).every(Boolean));
  stage = "migrations";
  const history = (
    await client.query(
      "SELECT migration_name,checksum,finished_at IS NOT NULL AS applied,rolled_back_at IS NOT NULL AS rolled_back FROM ethos_technical._prisma_migrations ORDER BY migration_name",
    )
  ).rows;
  const dir = new URL("../prisma/migrations/", import.meta.url),
    local = readdirSync(dir)
      .filter((n) => /^\d+_/.test(n))
      .sort();
  report.migrationChecks = history.map((r) => ({
    name: r.migration_name,
    applied: r.applied,
    rolledBack: r.rolled_back,
    local: local.includes(r.migration_name),
    checksumMatches:
      local.includes(r.migration_name) &&
      r.checksum ===
        sha(readFileSync(new URL(`${r.migration_name}/migration.sql`, dir))),
  }));
  // Prisma retains resolved rolled-back attempts; only active executions define applied state.
  assert.deepEqual(
    history.filter((r) => !r.rolled_back).map((r) => r.migration_name),
    local,
  );
  assert(
    report.migrationChecks
      .filter((r) => !r.rolledBack)
      .every((r) => r.applied && r.checksumMatches),
  );
  report.migrations = { pending: [], applied: local, checksumsMatch: true };
  stage = "runtime_roles";
  const roles = (
    await client.query(
      "SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolinherit FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime') ORDER BY rolname",
    )
  ).rows;
  assert.equal(roles.length, 2);
  assert(
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
  report.roles = roles;
  report.runtimeRoleMemberships = (
    await client.query(
      "SELECT count(*)::int AS n FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('ethos_auth_runtime','ethos_tenant_runtime')",
    )
  ).rows[0].n;
  assert.equal(report.runtimeRoleMemberships, 0);
  const columns = (
    await client.query(
      `SELECT c.relname AS "table",a.attname AS "column",has_column_privilege('ethos_tenant_runtime',c.oid,a.attnum,'INSERT') AS insert,has_column_privilege('ethos_tenant_runtime',c.oid,a.attnum,'UPDATE') AS update FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ethos' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attname`,
    )
  ).rows;
  report.currentWrites = columns.filter((c) => c.insert || c.update);
  assert.equal(report.currentWrites.length, 0);
  const tables = (
    await client.query(
      `SELECT c.relname AS "table",c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced,has_table_privilege('ethos_tenant_runtime',c.oid,'SELECT') AS readable,has_table_privilege('ethos_tenant_runtime',c.oid,'DELETE') AS delete,has_table_privilege('ethos_tenant_runtime',c.oid,'TRUNCATE') AS truncate FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ethos' AND c.relkind='r' ORDER BY c.relname`,
    )
  ).rows;
  assert(tables.every((t) => !t.delete && !t.truncate));
  assert(
    grants.every((g) =>
      tables.some(
        (t) => t.table === g.table && t.enabled && t.forced && t.readable,
      ),
    ),
  );
  report.tables = tables;
  report.policies = (
    await client.query(
      "SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('ethos','ethos_identity') ORDER BY schemaname,tablename,policyname",
    )
  ).rows;
  report.proposedColumnCount = grants.reduce((n, g) => n + g.columns.length, 0);
  if (mode === "backup") {
    stage = "backup_tools";
    const bin = resolve(root, ".tools/postgresql17/native/pgsql/bin"),
      dumpExe = resolve(bin, "pg_dump.exe"),
      restoreExe = resolve(bin, "pg_restore.exe");
    report.tools = [
      run(dumpExe, ["--version"]).trim(),
      run(restoreExe, ["--version"]).trim(),
    ];
    assert(report.tools.every((v) => /PostgreSQL\) 17\./.test(v)));
    const id = `stage-0.10.1-${randomUUID()}`,
      primary = resolve(root, ".backups", id),
      secondary = resolve(root, ".backups/secondary", id);
    const who = run("whoami.exe", []).trim();
    for (const p of [primary, secondary]) {
      mkdirSync(p, { recursive: true });
      run("icacls.exe", [p, "/inheritance:r", "/grant:r", `${who}:(OI)(CI)F`]);
    }
    const snapshot = (
      await client.query("SELECT pg_export_snapshot() AS snapshot")
    ).rows[0].snapshot;
    const catalog = (await client.query(schemaSql)).rows[0].catalog;
    const data = (await client.query(dataIntegritySql(catalog.tables))).map(
      (r) => r.rows[0].data,
    );
    const acl = (await client.query(aclSql)).rows[0].acl;
    // Passwordless role inventory, only for resolving owners/ACLs in the isolated rehearsal.
    const roleNames = (
      await client.query(
        "SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' AND rolname<>'postgres' ORDER BY rolname",
      )
    ).rows.map((r) => r.rolname);
    const roleSql = roleNames
      .map((n) => `CREATE ROLE ${quote(n)} NOLOGIN NOINHERIT;`)
      .join("\n");
    const path = resolve(primary, "application.dump");
    stage = "dump";
    run(
      dumpExe,
      [
        "--format=custom",
        "--schema=ethos",
        "--schema=ethos_identity",
        "--schema=ethos_technical",
        "--lock-wait-timeout=5s",
        `--snapshot=${snapshot}`,
        "--file",
        path,
      ],
      {
        env: {
          ...process.env,
          PGHOST: url.hostname,
          PGPORT: "5432",
          PGDATABASE: "postgres",
          PGUSER: decodeURIComponent(url.username),
          PGPASSWORD: decodeURIComponent(url.password),
          PGSSLMODE: "verify-full",
          PGSSLROOTCERT: caFile,
          PGCONNECT_TIMEOUT: "10",
        },
      },
    );
    await client.query("ROLLBACK");
    assert(statSync(path).size > 0);
    run(restoreExe, ["--list", path]);
    const manifest = {
      projectId: expected,
      createdAt: new Date().toISOString(),
      sha256: sha(readFileSync(path)),
      integrity: { catalog, data },
      acl,
      roleSql,
      roles,
      report,
    };
    writeFileSync(
      resolve(primary, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      { flag: "wx" },
    );
    for (const name of ["application.dump", "manifest.json"]) {
      copyFileSync(resolve(primary, name), resolve(secondary, name));
      assert.equal(
        sha(readFileSync(resolve(primary, name))),
        sha(readFileSync(resolve(secondary, name))),
      );
    }
    report.backup = {
      completed: true,
      primary: primary.slice(root.length).replaceAll("\\", "/"),
      secondary: secondary.slice(root.length).replaceAll("\\", "/"),
      sha256: manifest.sha256,
      bytes: statSync(path).size,
      schemas: ["ethos", "ethos_identity", "ethos_technical"],
      secondCopyVerified: true,
      protectedAcl: true,
    };
    writeFileSync(
      resolve(root, "docs/etapa-0.10.1-backup.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    stage = "restore_start";
    container = run("docker", [
      "run",
      "--detach",
      "--network",
      "none",
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "postgres:17.11",
    ]).trim();
    assert(/^[a-f0-9]{64}$/.test(container));
    for (let n = 0; n < 50; n++) {
      const ready = spawnSync(
        "docker",
        ["exec", container, "pg_isready", "-U", "postgres"],
        { stdio: "ignore" },
      );
      if (ready.status === 0) break;
      if (n === 49) throw Error("RESTORE_NOT_READY");
      await new Promise((r) => setTimeout(r, 300));
    }
    stage = "restore_roles";
    run(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: roleSql },
    );
    stage = "restore_archive";
    run(
      "docker",
      [
        "exec",
        "-i",
        container,
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "--exit-on-error",
      ],
      { input: readFileSync(path) },
    );
    stage = "restore_verify";
    const result = run(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input: `SET TIME ZONE 'UTC';\n${schemaSql};\n${dataIntegritySql(catalog.tables)};\n${aclSql};`,
      },
    )
      .split(/\r?\n/)
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l));
    assert.deepEqual(
      {
        ...result[0],
        constraints: canonicalConstraints(result[0].constraints),
      },
      { ...catalog, constraints: canonicalConstraints(catalog.constraints) },
    );
    assert.deepEqual(result.slice(1, -1), data);
    assert.deepEqual(
      { ...result.at(-1), tables: canonicalTableAcl(result.at(-1).tables) },
      { ...acl, tables: canonicalTableAcl(acl.tables) },
    );
    report.backup = {
      completed: true,
      primary: primary.slice(root.length).replaceAll("\\", "/"),
      secondary: secondary.slice(root.length).replaceAll("\\", "/"),
      sha256: manifest.sha256,
      bytes: statSync(path).size,
      schemas: ["ethos", "ethos_identity", "ethos_technical"],
      secondCopyVerified: true,
      protectedAcl: true,
    };
    report.restore = {
      completed: true,
      isolatedNetwork: true,
      tables: catalog.tables.length,
      policies: catalog.policies.length,
      forcedRlsTables: catalog.tables.filter((t) => t[2] && t[3]).length,
      catalogDataOwnersAndAclMatch: true,
      passwordsRestored: false,
    };
  } else await client.query("ROLLBACK");
  writeFileSync(
    resolve(root, `docs/etapa-0.10.1-${mode}.json`),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      mode,
      projectId: expected,
      verified: true,
      migrations: local.length,
      connection: report.connection,
      backup: report.backup,
      restore: report.restore,
    }),
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  writeFileSync(
    resolve(root, "docs/etapa-0.10.1-preparation-failure.json"),
    JSON.stringify(
      { ...report, failed: true, stage, code: error.code ?? error.name },
      null,
      2,
    ),
  );
  console.error(
    JSON.stringify({
      failed: true,
      stage,
      code: error.code ?? error.name,
      sourceWrites: false,
      migrationChecks: report.migrationChecks,
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
  if (container && /^[a-f0-9]{64}$/.test(container)) {
    const r = spawnSync("docker", ["rm", "--force", "--volumes", container], {
      stdio: "ignore",
    });
    if (r.status !== 0) {
      console.error("ISOLATED_CONTAINER_CLEANUP_REQUIRED");
      process.exitCode = 1;
    }
  }
}
