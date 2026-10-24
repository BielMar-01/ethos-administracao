import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { runtimeProvisioningSql } from "./runtime-profiles.mjs";
import { reviewedGrants } from "./business-activation-guards.mjs";
import { applicationAclSql } from "./business-backup-integrity.mjs";
const url =
  process.env.ETHOS_AUTH_TEST_DATABASE_URL ??
  "postgresql://postgres:ethos-local-disposable@127.0.0.1:55439/ethos_auth_test";
const target = new URL(url);
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.pathname !== "/ethos_auth_test"
)
  throw Error("ISOLATED_DATABASE_REQUIRED");
const c = new pg.Client({ connectionString: url, ssl: false }),
  checks = [];
const legacy = readFileSync(
    new URL("./prepare-auth-runtime.sql", import.meta.url),
    "utf8",
  ),
  plan = readFileSync(
    new URL("./propose-business-runtime.sql", import.meta.url),
    "utf8",
  );
const grants = reviewedGrants(plan),
  business = runtimeProvisioningSql("business-0.10.1");
async function exact() {
  for (const g of grants) {
    const rows = (
      await c.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='ethos' AND table_name=$1 AND has_column_privilege('ethos_tenant_runtime',format('%I.%I',table_schema,table_name),column_name,$2)",
        [g.table, g.privilege],
      )
    ).rows
      .map((r) => r.column_name)
      .sort();
    assert.deepEqual(rows, [...g.columns].sort());
  }
}
async function snapshot() {
  return (await c.query(applicationAclSql)).rows[0].acl;
}
try {
  await c.connect();
  await c.query(plan);
  await c.query(business);
  await exact();
  const before = await snapshot();
  const memberships = (
    await c.query(
      "SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member,grantor",
    )
  ).rows;
  await c.query(business);
  assert.deepEqual(await snapshot(), before);
  await c.query(business);
  assert.deepEqual(await snapshot(), before);
  checks.push(
    "explicit business profile is idempotent and preserves all reviewed column grants",
  );
  await assert.rejects(
    c.query(legacy),
    (e) => e.message === "EXPLICIT_BUSINESS_PROFILE_REQUIRED",
  );
  await c.query("ROLLBACK");
  await exact();
  assert.deepEqual(await snapshot(), before);
  checks.push(
    "legacy reconciliation refuses to downgrade active business grants",
  );
  await assert.rejects(
    c.query(runtimeProvisioningSql("auth-only")),
    (e) => e.message === "EXPLICIT_BUSINESS_PROFILE_REQUIRED",
  );
  await c.query("ROLLBACK");
  await exact();
  checks.push(
    "explicit auth-only profile cannot silently downgrade business profile",
  );
  await c.query('GRANT DELETE ON ethos."Owner" TO ethos_tenant_runtime');
  await c.query(
    'GRANT UPDATE ("organizationId") ON ethos."Owner" TO ethos_tenant_runtime',
  );
  await c.query("GRANT USAGE ON SCHEMA ethos_identity TO ethos_tenant_runtime");
  await c.query(business);
  await exact();
  assert.deepEqual(await snapshot(), before);
  checks.push(
    "unauthorized DELETE, protected column UPDATE and identity USAGE are removed atomically",
  );
  assert.deepEqual(
    (
      await c.query(
        "SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member,grantor",
      )
    ).rows,
    memberships,
  );
  checks.push("administrative memberships, SET and INHERIT are unchanged");
  await c.query("BEGIN");
  await c.query("ALTER ROLE ethos_tenant_runtime BYPASSRLS");
  await c.query("SAVEPOINT unsafe");
  await assert.rejects(
    c.query(business.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")),
    (e) => e.message === "UNSAFE_RESERVED_RUNTIME_ROLE",
  );
  await c.query("ROLLBACK");
  await exact();
  checks.push(
    "unsafe runtime flags stop provisioning and rollback preserves grants",
  );
  assert.equal(
    (
      await c.query(
        "SELECT rolbypassrls FROM pg_roles WHERE rolname='ethos_tenant_runtime'",
      )
    ).rows[0].rolbypassrls,
    false,
  );
  const report = {
    isolated: true,
    productionProvisioningExecuted: false,
    passed: checks.length,
    checks,
  };
  writeFileSync(
    new URL(
      "../../../docs/etapa-0.11-provisioning-tests.json",
      import.meta.url,
    ),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({ failed: true, code: e.code ?? e.name, checks }),
  );
  process.exitCode = 1;
} finally {
  await c.end();
}
