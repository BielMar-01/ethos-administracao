import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const url =
  process.env.ETHOS_AUTH_TEST_DATABASE_URL ??
  "postgresql://postgres:ethos-local-disposable@127.0.0.1:55439/ethos_auth_test";
const target = new URL(url);
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.pathname !== "/ethos_auth_test"
)
  throw Error("ISOLATED_DATABASE_REQUIRED");
const c = new pg.Client({ connectionString: url, ssl: false });
const checks = [];
async function rejected(name, sql, parameters = [], code = "42501") {
  await c.query("SAVEPOINT forbidden");
  let actual;
  try {
    await c.query(sql, parameters);
    await c.query("SET CONSTRAINTS ALL IMMEDIATE");
  } catch (error) {
    actual = error.code;
  }
  await c.query("ROLLBACK TO SAVEPOINT forbidden");
  await c.query("RELEASE SAVEPOINT forbidden");
  assert.equal(actual, code, name);
  checks.push(name);
}
try {
  await c.connect();
  const sql = readFileSync(
    new URL("./propose-business-runtime.sql", import.meta.url),
    "utf8",
  );
  await c.query(sql);
  await c.query(sql);
  checks.push("column grants are idempotent in isolated database");
  for (const match of sql.matchAll(
    /GRANT INSERT \(([^)]+)\) ON ethos\."(\w+)"/g,
  )) {
    const allowed = match[1].split(", ").map((c) => c.slice(1, -1));
    const { rows } = await c.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='ethos' AND table_name=$1 AND has_column_privilege('ethos_tenant_runtime',format('%I.%I',table_schema,table_name),column_name,'INSERT') ORDER BY column_name",
      [match[2]],
    );
    assert.deepEqual(rows.map((r) => r.column_name).sort(), allowed.sort());
  }
  checks.push(
    "INSERT privileges match the exact narrowed column allowlist on all 23 tables",
  );
  await c.query("BEGIN");
  const a = randomUUID(),
    b = randomUUID(),
    user = randomUUID(),
    member = randomUUID(),
    ownerB = randomUUID(),
    property = randomUUID(),
    unit = randomUUID(),
    lease = randomUUID();
  await c.query(
    "INSERT INTO ethos.\"Organization\" (id,name,slug) VALUES ($1,'A',$2),($3,'B',$4)",
    [a, `a-${a}`, b, `b-${b}`],
  );
  await c.query(
    'INSERT INTO ethos."User" (id,email,"displayName") VALUES ($1,$2,\'Fixture\')',
    [user, `${user}@example.invalid`],
  );
  await c.query(
    'INSERT INTO ethos."OrganizationMembership" (id,"organizationId","userId",status) VALUES ($1,$2,$3,\'ACTIVE\')',
    [member, a, user],
  );
  await c.query(
    'INSERT INTO ethos."Owner" (id,"organizationId",name) VALUES ($1,$2,\'B\')',
    [ownerB, b],
  );
  await c.query("SET LOCAL ROLE ethos_tenant_runtime");
  assert.equal(
    (await c.query('SELECT count(*)::int AS n FROM ethos."Owner"')).rows[0].n,
    0,
  );
  checks.push("RLS denies missing organization");
  await c.query(
    "SELECT set_config('ethos.organization_id',$1,true),set_config('ethos.actor_membership_id',$2,true)",
    [a, member],
  );
  const owner = randomUUID();
  await c.query(
    'INSERT INTO ethos."Owner" (id,"organizationId",name) VALUES ($1,$2,\'Allowed\')',
    [owner, a],
  );
  await c.query("UPDATE ethos.\"Owner\" SET name='Edited' WHERE id=$1", [
    owner,
  ]);
  assert.equal(
    (await c.query('SELECT name FROM ethos."Owner"')).rows[0].name,
    "Edited",
  );
  checks.push("own organization INSERT and limited UPDATE succeed");
  assert.equal(
    (
      await c.query(
        'SELECT count(*)::int AS n FROM ethos."Owner" WHERE id=$1',
        [ownerB],
      )
    ).rows[0].n,
    0,
  );
  checks.push("RLS hides foreign organization rows");
  await rejected(
    "RLS rejects foreign inserts",
    'INSERT INTO ethos."Owner" (id,"organizationId",name) VALUES ($1,$2,\'Foreign\')',
    [randomUUID(), b],
  );
  for (const column of ["id", "organizationId", "createdAt"])
    await rejected(
      `protected ${column} cannot change`,
      `UPDATE ethos."Owner" SET "${column}"="${column}" WHERE id=$1`,
      [owner],
    );
  await rejected(
    "createdAt cannot be supplied on INSERT",
    'INSERT INTO ethos."Owner" (id,"organizationId",name,"createdAt") VALUES ($1,$2,\'Forbidden\',now())',
    [randomUUID(), a],
  );
  await rejected("DELETE is absent", 'DELETE FROM ethos."Owner" WHERE id=$1', [
    owner,
  ]);
  for (const table of [
    "User",
    "Permission",
    "Role",
    "MembershipRole",
    "RolePermission",
    "OrganizationMembership",
    "PlatformAccessGrant",
    "AuditLog",
    "ContractVersion",
    "Document",
    "PaymentAllocation",
  ])
    await rejected(
      `${table} protected from UPDATE`,
      `UPDATE ethos."${table}" SET id=id`,
    );
  await rejected(
    "organization status cannot change",
    'UPDATE ethos."Organization" SET status=status',
  );
  await rejected(
    "audit cannot be forged",
    'INSERT INTO ethos."AuditLog" (id) VALUES ($1)',
    [randomUUID()],
  );
  await rejected(
    "identity schema inaccessible",
    'SELECT * FROM ethos_identity."AuthCredential"',
  );
  await rejected(
    "migration history inaccessible",
    "SELECT * FROM ethos_technical._prisma_migrations",
  );
  await c.query(
    "INSERT INTO ethos.\"Property\" (id,\"organizationId\",code,name,kind,address) VALUES ($1,$2,'P','P','RESIDENTIAL','{}')",
    [property, a],
  );
  await c.query(
    'INSERT INTO ethos."PropertyUnit" (id,"organizationId","propertyId",code,name,"isMain") VALUES ($1,$2,$3,\'MAIN\',\'Main\',true)',
    [unit, a, property],
  );
  await rejected(
    "cross-tenant FK rejected",
    'INSERT INTO ethos."PropertyOwnership" (id,"organizationId","propertyId","ownerId",percentage,"startsOn") VALUES ($1,$2,$3,$4,100,\'2030-01-01\')',
    [randomUUID(), a, property, ownerB],
    "23503",
  );
  await rejected(
    "percent total integrity enforced",
    'INSERT INTO ethos."PropertyOwnership" (id,"organizationId","propertyId","ownerId",percentage,"startsOn") VALUES ($1,$2,$3,$4,101,\'2030-01-01\')',
    [randomUUID(), a, property, owner],
    "23514",
  );
  await c.query(
    'INSERT INTO ethos."Lease" (id,"organizationId","unitId",code,"startsOn","baseRent","dueDay") VALUES ($1,$2,$3,\'L\',\'2030-01-01\',123.45,10)',
    [lease, a, unit],
  );
  await rejected(
    "lease rent cannot rewrite history",
    'UPDATE ethos."Lease" SET "baseRent"=999 WHERE id=$1',
    [lease],
  );
  assert(
    (await c.query('SELECT count(*)::int AS n FROM ethos."AuditLog"')).rows[0]
      .n > 0,
  );
  checks.push("permitted mutations produce protected audit history");
  const role = (
    await c.query(
      "SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication FROM pg_roles WHERE rolname=current_user",
    )
  ).rows[0];
  assert(Object.values(role).every((v) => v === false));
  checks.push("runtime retains no administrative flags");
  await c.query("ROLLBACK");
  const report = {
    isolated: true,
    realSupabaseUnchanged: true,
    fixturesRolledBack: true,
    passed: checks.length,
    checks,
  };
  writeFileSync(
    new URL("../../../docs/etapa-0.10-privilege-tests.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} catch (error) {
  await c.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({
      failed: true,
      code: error.code ?? "BUSINESS_GRANTS_TEST_FAILED",
      check: error.name === "AssertionError" ? error.message : undefined,
    }),
  );
  process.exitCode = 1;
} finally {
  await c.end();
}
