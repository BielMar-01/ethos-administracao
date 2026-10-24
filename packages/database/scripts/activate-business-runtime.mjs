// Supplying --approved never substitutes for explicit user approval.
import assert from "node:assert/strict";
import { config } from "dotenv";
import pg from "pg";
import { isIP } from "node:net";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { poolConfiguration } from "../dist/settings.js";
import { supabaseTarget } from "./supabase-target.mjs";
import {
  applicationCatalogSql,
  applicationAclSql,
} from "./business-backup-integrity.mjs";
import { dataIntegritySql } from "./backup-integrity.mjs";
import {
  approvedProject,
  approvedSha256,
  sha256,
  reviewedGrants,
  approvalGuard,
} from "./business-activation-guards.mjs";
const mode = process.argv[2];
approvalGuard(mode, process.argv);
const root = fileURLToPath(new URL("../../../", import.meta.url)),
  sql = readFileSync(
    new URL("./propose-business-runtime.sql", import.meta.url),
    "utf8",
  ),
  grants = reviewedGrants(sql);
const backupReport = JSON.parse(
    readFileSync(resolve(root, "docs/etapa-0.10.1-backup.json"), "utf8"),
  ),
  restoreReport = JSON.parse(
    readFileSync(resolve(root, "docs/etapa-0.10.1-restore.json"), "utf8"),
  );
const folder = resolve(root, backupReport.backup.primary),
  secondary = resolve(root, backupReport.backup.secondary),
  beforePath = resolve(folder, "business-activation-before.json");
assert(folder.startsWith(resolve(root, ".backups") + "\\"));
assert(secondary.startsWith(resolve(root, ".backups/secondary") + "\\"));
const manifest = JSON.parse(
  readFileSync(resolve(folder, "manifest.json"), "utf8"),
);
assert.equal(manifest.projectId, approvedProject);
assert(restoreReport.completed);
assert.equal(restoreReport.archiveSha256, backupReport.backup.sha256);
for (const dir of [folder, secondary]) {
  assert.equal(
    sha256(readFileSync(resolve(dir, "application.dump"))),
    backupReport.backup.sha256,
  );
  assert.equal(
    sha256(readFileSync(resolve(dir, "manifest.json"))),
    sha256(readFileSync(resolve(folder, "manifest.json"))),
  );
}
config({ path: new URL("../.env", import.meta.url), quiet: true });
const secret = {};
config({
  path: new URL("../../../.secrets/auth-runtime.env", import.meta.url),
  processEnv: secret,
  quiet: true,
});
function direct(value, role) {
  const checked = supabaseTarget(value, approvedProject),
    u = new URL(checked.url);
  if (role) assert.equal(decodeURIComponent(u.username).split(".")[0], role);
  u.hostname = `db.${approvedProject}.supabase.co`;
  u.username = role ?? decodeURIComponent(u.username).split(".")[0];
  u.search = "";
  return u.toString();
}
const client = new pg.Client(
  poolConfiguration(direct(process.env.DIRECT_DATABASE_URL), 1),
);
let stage = "connect",
  committed = false;
const checks = [],
  report = {
    projectId: approvedProject,
    at: new Date().toISOString(),
    mode,
    sqlSha256: approvedSha256,
    checks,
    deploy: false,
  };
const same = (a, b) => assert.deepEqual(a, b);
async function tls(c) {
  const s = c.connection.stream;
  assert(s.encrypted && s.authorized && isIP(s.remoteAddress) === 6);
  assert(
    (await c.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()"))
      .rows[0].ssl,
  );
}
async function snapshot(c) {
  await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await c.query("SET LOCAL TIME ZONE 'UTC'");
  try {
    const catalog = (await c.query(applicationCatalogSql)).rows[0].catalog;
    const data = (await c.query(dataIntegritySql(catalog.tables))).map(
      (r) => r.rows[0].data,
    );
    const acl = (await c.query(applicationAclSql)).rows[0].acl;
    return { catalog, data, acl };
  } finally {
    await c.query("ROLLBACK");
  }
}
async function rolesAndRights(c, active) {
  const roles = (
    await c.query(
      "SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,rolinherit FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime') ORDER BY rolname",
    )
  ).rows;
  same(roles, backupReport.roles);
  const risky = (
    await c.query(
      `SELECT (SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('ethos_auth_runtime','ethos_tenant_runtime'))+(SELECT count(*) FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE r.rolname IN ('ethos_auth_runtime','ethos_tenant_runtime'))+(SELECT count(*) FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE r.rolname IN ('ethos_auth_runtime','ethos_tenant_runtime'))+(SELECT count(*) FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE r.rolname IN ('ethos_auth_runtime','ethos_tenant_runtime')) AS n`,
    )
  ).rows[0];
  assert.equal(Number(risky.n), 0);
  const columns = (
    await c.query(
      `SELECT n.nspname AS schema,c.relname AS "table",a.attname AS "column",has_column_privilege('ethos_tenant_runtime',c.oid,a.attnum,'INSERT') AS insert,has_column_privilege('ethos_tenant_runtime',c.oid,a.attnum,'UPDATE') AS update,has_column_privilege('ethos_tenant_runtime',c.oid,a.attnum,'INSERT WITH GRANT OPTION') AS insert_grant,has_column_privilege('ethos_tenant_runtime',c.oid,a.attnum,'UPDATE WITH GRANT OPTION') AS update_grant FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('ethos','ethos_identity','ethos_technical') AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,3`,
    )
  ).rows;
  for (const col of columns) {
    for (const privilege of ["INSERT", "UPDATE"]) {
      const expected =
        active &&
        col.schema === "ethos" &&
        grants.some(
          (g) =>
            g.table === col.table &&
            g.privilege === privilege &&
            g.columns.includes(col.column),
        );
      assert.equal(col[privilege.toLowerCase()], Boolean(expected));
    }
    assert(!col.insert_grant && !col.update_grant);
  }
  const tables = (
    await c.query(
      `SELECT n.nspname,c.relname,has_table_privilege('ethos_tenant_runtime',c.oid,'DELETE') AS delete,has_table_privilege('ethos_tenant_runtime',c.oid,'TRUNCATE') AS truncate FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('ethos','ethos_identity','ethos_technical') AND c.relkind='r'`,
    )
  ).rows;
  assert(tables.every((t) => !t.delete && !t.truncate));
  return { roles, columns };
}
async function realRuntimeConnections() {
  for (const [key, role] of [
    ["AUTH_IDENTITY_DATABASE_URL", "ethos_auth_runtime"],
    ["DATABASE_URL", "ethos_tenant_runtime"],
  ]) {
    const c = new pg.Client(poolConfiguration(direct(secret[key], role), 1));
    try {
      await c.connect();
      await tls(c);
      await c.query("BEGIN READ ONLY");
      const row = (await c.query("SELECT current_user,session_user")).rows[0];
      assert.equal(row.current_user, role);
      assert.equal(row.session_user, role);
      if (role === "ethos_tenant_runtime") {
        assert.equal(
          (await c.query('SELECT count(*)::int AS n FROM ethos."Owner"'))
            .rows[0].n,
          0,
        );
      } else await c.query('SELECT count(*) FROM ethos_identity."AuthSession"');
      await c.query("ROLLBACK");
      checks.push(`${role}: genuine direct IPv6 TLS login and read-only check`);
    } finally {
      await c.end();
    }
  }
}
async function fixtureChecks() {
  if (!process.argv.includes("--approved-transient-membership"))
    throw Error("TRANSIENT_MEMBERSHIP_APPROVAL_REQUIRED");
  const membership = async () =>
    (
      await client.query(
        "SELECT g.rolname AS grantor,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member JOIN pg_roles g ON g.oid=m.grantor WHERE r.rolname='ethos_tenant_runtime' AND u.rolname=session_user ORDER BY g.rolname",
      )
    ).rows;
  const originalMembership = await membership();
  assert.equal(originalMembership.length, 1);
  assert(
    originalMembership[0].admin_option &&
      !originalMembership[0].inherit_option &&
      !originalMembership[0].set_option,
  );
  assert.equal(
    (await client.query("SELECT session_user")).rows[0].session_user,
    "postgres",
  );
  const temporaryMembership = [
    ...originalMembership,
    {
      grantor: "postgres",
      admin_option: false,
      inherit_option: false,
      set_option: true,
    },
  ].sort((a, b) => a.grantor.localeCompare(b.grantor));
  const backendPid = (await client.query("SELECT pg_backend_pid() AS pid"))
    .rows[0].pid;
  report.transaction = {
    exclusiveClient: true,
    usesPool: false,
    concurrentQueries: false,
    backendPid,
    originalMembership,
  };
  const a = randomUUID(),
    b = randomUUID(),
    owner = randomUUID(),
    foreign = randomUUID(),
    property = randomUUID(),
    unit = randomUUID(),
    lease = randomUUID();
  async function denied(name, statement, params = [], code = "42501") {
    await client.query("SAVEPOINT denied");
    let actual;
    try {
      await client.query(statement, params);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    } catch (e) {
      actual = e.code;
    }
    await client.query("ROLLBACK TO SAVEPOINT denied");
    await client.query("RELEASE SAVEPOINT denied");
    assert.equal(actual, code);
    checks.push(name);
  }
  await client.query("BEGIN");
  await client.query("SET LOCAL statement_timeout='15s'");
  try {
    // Prove transactional role DDL via a savepoint before creating any fixtures.
    await client.query("SAVEPOINT transactional_role_probe");
    await client.query(
      "GRANT ethos_tenant_runtime TO postgres WITH SET TRUE, INHERIT FALSE",
    );
    report.transaction.temporaryMembership = await membership();
    same(await membership(), temporaryMembership);
    await client.query("ROLLBACK TO SAVEPOINT transactional_role_probe");
    same(await membership(), originalMembership);
    await client.query("RELEASE SAVEPOINT transactional_role_probe");
    report.transaction.ddlRollbackProven = true;
    checks.push(
      "transactional GRANT proven by savepoint rollback on same physical session",
    );
    await client.query(
      "GRANT ethos_tenant_runtime TO postgres WITH SET TRUE, INHERIT FALSE",
    );
    same(await membership(), temporaryMembership);
    checks.push("temporary SET enabled without changing ADMIN or INHERIT");
    // No User, identity, session, RBAC or administrative role fixtures are created.
    await client.query(
      "INSERT INTO ethos.\"Organization\" (id,name,slug) VALUES ($1,'Activation rollback fixture A',$2),($3,'Activation rollback fixture B',$4)",
      [a, `verify-${a}`, b, `verify-${b}`],
    );
    await client.query(
      'INSERT INTO ethos."Owner" (id,"organizationId",name) VALUES ($1,$2,\'Foreign rollback fixture\')',
      [foreign, b],
    );
    await client.query(
      "SELECT set_config('ethos.organization_id','',true),set_config('ethos.actor_membership_id','',true)",
    );
    await client.query("SET LOCAL ROLE ethos_tenant_runtime");
    assert.equal(
      (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
      backendPid,
    );
    assert.equal(
      (await client.query("SELECT current_user")).rows[0].current_user,
      "ethos_tenant_runtime",
    );
    assert.equal(
      (await client.query('SELECT count(*)::int AS n FROM ethos."Owner"'))
        .rows[0].n,
      0,
    );
    checks.push("missing organization context denies rows");
    await denied(
      "INSERT denied without context",
      'INSERT INTO ethos."Owner" (id,"organizationId",name) VALUES ($1,$2,\'Denied\')',
      [randomUUID(), a],
    );
    await client.query("SELECT set_config('ethos.organization_id',$1,true)", [
      a,
    ]);
    await client.query(
      'INSERT INTO ethos."Owner" (id,"organizationId",name) VALUES ($1,$2,\'Allowed rollback fixture\')',
      [owner, a],
    );
    checks.push("own-tenant INSERT succeeds as effective runtime");
    await client.query(
      "UPDATE ethos.\"Owner\" SET name='Updated rollback fixture' WHERE id=$1",
      [owner],
    );
    assert.equal(
      (
        await client.query('SELECT name FROM ethos."Owner" WHERE id=$1', [
          owner,
        ])
      ).rows[0].name,
      "Updated rollback fixture",
    );
    checks.push("allowed column UPDATE succeeds");
    assert.equal(
      (
        await client.query(
          "UPDATE ethos.\"Owner\" SET name='Forbidden foreign' WHERE id=$1",
          [foreign],
        )
      ).rowCount,
      0,
    );
    checks.push("foreign UPDATE changes zero rows");
    assert.equal(
      (
        await client.query(
          'SELECT count(*)::int AS n FROM ethos."Owner" WHERE id=$1',
          [foreign],
        )
      ).rows[0].n,
      0,
    );
    checks.push("foreign organization SELECT hidden");
    await denied(
      "foreign organization INSERT denied",
      'INSERT INTO ethos."Owner" (id,"organizationId",name) VALUES ($1,$2,\'Denied\')',
      [randomUUID(), b],
    );
    for (const col of ["id", "organizationId", "createdAt"])
      await denied(
        `${col} UPDATE denied`,
        `UPDATE ethos."Owner" SET "${col}"="${col}" WHERE id=$1`,
        [owner],
      );
    await denied(
      "createdAt INSERT denied",
      'INSERT INTO ethos."Owner" (id,"organizationId",name,"createdAt") VALUES ($1,$2,\'Denied\',now())',
      [randomUUID(), a],
    );
    await denied("DELETE denied", 'DELETE FROM ethos."Owner" WHERE id=$1', [
      owner,
    ]);
    await denied(
      "identity reads denied",
      'SELECT * FROM ethos_identity."AuthCredential"',
    );
    for (const table of [
      "User",
      "Permission",
      "Role",
      "OrganizationMembership",
      "MembershipRole",
      "RolePermission",
      "PlatformAccessGrant",
      "AuditLog",
      "Document",
      "ContractVersion",
      "PaymentAllocation",
    ])
      await denied(
        `${table} protected UPDATE denied`,
        `UPDATE ethos."${table}" SET id=id`,
      );
    await denied(
      "audit forgery denied",
      'INSERT INTO ethos."AuditLog" (id) VALUES ($1)',
      [randomUUID()],
    );
    await client.query(
      "INSERT INTO ethos.\"Property\" (id,\"organizationId\",code,name,kind,address) VALUES ($1,$2,'P','Rollback fixture','RESIDENTIAL','{}')",
      [property, a],
    );
    await client.query(
      'INSERT INTO ethos."PropertyUnit" (id,"organizationId","propertyId",code,name,"isMain") VALUES ($1,$2,$3,\'MAIN\',\'Rollback fixture\',true)',
      [unit, a, property],
    );
    await denied(
      "composite FK rejects cross-tenant reference",
      'INSERT INTO ethos."PropertyOwnership" (id,"organizationId","propertyId","ownerId",percentage,"startsOn") VALUES ($1,$2,$3,$4,100,\'2030-01-01\')',
      [randomUUID(), a, property, foreign],
      "23503",
    );
    await denied(
      "ownership percentage integrity",
      'INSERT INTO ethos."PropertyOwnership" (id,"organizationId","propertyId","ownerId",percentage,"startsOn") VALUES ($1,$2,$3,$4,101,\'2030-01-01\')',
      [randomUUID(), a, property, owner],
      "23514",
    );
    await client.query(
      'INSERT INTO ethos."Lease" (id,"organizationId","unitId",code,"startsOn","baseRent","dueDay") VALUES ($1,$2,$3,\'L\',\'2030-01-01\',123.45,10)',
      [lease, a, unit],
    );
    await denied(
      "lease core history protected",
      'UPDATE ethos."Lease" SET "baseRent"=999 WHERE id=$1',
      [lease],
    );
    assert(
      (
        await client.query(
          'SELECT count(*)::int AS n FROM ethos."AuditLog" WHERE "organizationId"=$1',
          [a],
        )
      ).rows[0].n > 0,
    );
    checks.push("allowed writes produce audit within rollback transaction");
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  } finally {
    await client.query("ROLLBACK");
    // Verify this immediately, including failure paths; never leave SET enabled.
    same(await membership(), originalMembership);
    assert.equal(
      (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
      backendPid,
    );
    report.transaction.membershipAfterRollback = await membership();
    report.transaction.samePhysicalSession = true;
    report.transaction.rollbackConfirmed = true;
    checks.push(
      "ROLLBACK restored SET=false, ADMIN/INHERIT and original physical session",
    );
  }
  assert.equal(
    (
      await client.query(
        'SELECT count(*)::int AS n FROM ethos."Organization" WHERE id=ANY($1::uuid[])',
        [[a, b]],
      )
    ).rows[0].n,
    0,
  );
  checks.push("all fixtures and generated audit rolled back");
  const gucs = (
    await client.query(
      "SELECT nullif(current_setting('ethos.organization_id',true),'') IS NULL AS cleared,current_user=session_user AS role_reset",
    )
  ).rows[0];
  assert(gucs.cleared && gucs.role_reset);
  checks.push("connection role and tenant context cleared after rollback");
}
try {
  await client.connect();
  await tls(client);
  report.connection = {
    direct: true,
    ipv6: true,
    authorizedTls: true,
    backendTls: true,
  };
  stage = "migration_preconditions";
  const history = (
    await client.query(
      "SELECT migration_name,checksum,finished_at,rolled_back_at FROM ethos_technical._prisma_migrations ORDER BY migration_name",
    )
  ).rows.filter((r) => !r.rolled_back_at);
  const dir = new URL("../prisma/migrations/", import.meta.url),
    local = readdirSync(dir)
      .filter((n) => /^\d+_/.test(n))
      .sort();
  same(
    history.map((r) => r.migration_name),
    local,
  );
  assert(
    history.every(
      (r) =>
        r.finished_at &&
        sha256(
          readFileSync(new URL(`${r.migration_name}/migration.sql`, dir)),
        ) === r.checksum,
    ),
  );
  report.migrations = { applied: local, pending: [] };
  if (mode !== "verify") {
    stage = "preflight_snapshot";
    const before = await snapshot(client);
    same(before.catalog, manifest.integrity.catalog);
    same(before.data, manifest.integrity.data);
    same(before.acl, manifest.acl);
    await rolesAndRights(client, false);
    await realRuntimeConnections();
    checks.push(
      "backup primary/secondary hashes verified and live catalog/data/ACL equal protected snapshot",
    );
    if (mode === "preflight") {
      writeFileSync(beforePath, JSON.stringify(before, null, 2), {
        flag: "wx",
      });
      copyFileSync(
        beforePath,
        resolve(secondary, "business-activation-before.json"),
      );
      report.completed = true;
    } else {
      assert.equal(
        sha256(readFileSync(beforePath)),
        sha256(
          readFileSync(resolve(secondary, "business-activation-before.json")),
        ),
      );
      same(before, JSON.parse(readFileSync(beforePath, "utf8")));
      stage = "apply_approved_sql";
      await client.query(sql);
      committed = true;
      report.grantsApplied = true;
      report.completed = true;
      report.grants = grants;
    }
  } else {
    stage = "verify_privileges";
    const rights = await rolesAndRights(client, true);
    report.effectiveWrites = rights.columns.filter((c) => c.insert || c.update);
    checks.push(
      "exact column privileges, no grant option, DELETE, TRUNCATE or administrative flags",
    );
    const before = JSON.parse(readFileSync(beforePath, "utf8"));
    stage = "verify_unchanged_structure";
    const after = await snapshot(client);
    same(after.catalog, before.catalog);
    same(after.data, before.data);
    same({ ...after.acl, columns: before.acl.columns }, before.acl);
    checks.push(
      "data, RLS, policies, structures, owners and non-column ACL unchanged",
    );
    await realRuntimeConnections();
    stage = "verify_rollback_fixtures";
    await fixtureChecks();
    stage = "verify_final_integrity";
    const final = await snapshot(client);
    same(final.data, before.data);
    same(final.catalog, before.catalog);
    same(final.acl, after.acl);
    report.completed = true;
    report.fixturesRolledBack = true;
    report.userAuthRbacWrites = false;
    report.validationMode =
      "genuine runtime logins read-only; positive/negative writes under SET LOCAL ROLE in reverted admin transaction";
    report.grantsApplied = true;
  }
  report.passed = checks.length;
  writeFileSync(
    resolve(root, `docs/etapa-0.10.1-${mode}.json`),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      mode,
      completed: true,
      projectId: approvedProject,
      sqlSha256: approvedSha256,
      passed: checks.length,
      grantsApplied: report.grantsApplied ?? false,
    }),
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  report.failed = true;
  report.stage = stage;
  report.code = error.code ?? error.name;
  report.grantsCommittedThisRun = committed;
  report.requiresReview = true;
  writeFileSync(
    resolve(root, `docs/etapa-0.10.1-${mode}-failure.json`),
    JSON.stringify(report, null, 2),
  );
  console.error(
    JSON.stringify({
      failed: true,
      stage,
      code: report.code,
      grantsCommittedThisRun: committed,
      noAutomaticRecovery: true,
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
