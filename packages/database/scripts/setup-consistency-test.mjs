import pg from "pg";
import { runtimeProvisioningSql } from "./runtime-profiles.mjs";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { applicationAclSql } from "./business-backup-integrity.mjs";
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
  await c.query(runtimeProvisioningSql("business-0.11-isolated"));
  const before = JSON.stringify((await c.query(applicationAclSql)).rows);
  await c.query(runtimeProvisioningSql("business-0.11-isolated"));
  assert.equal(JSON.stringify((await c.query(applicationAclSql)).rows), before);
  await assert.rejects(
    c.query(runtimeProvisioningSql("business-0.10.1")),
    /CONSISTENCY_PROFILE_REQUIRED/,
  );
  await c.query("ROLLBACK");
  assert.equal(JSON.stringify((await c.query(applicationAclSql)).rows), before);
  const flags = (
    await c.query(
      "SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime')",
    )
  ).rows;
  assert.equal(flags.length, 2);
  assert.ok(flags.every((row) => Object.values(row).every((v) => v === false)));
  for (const table of ["ResourceRevision", "MutationReceipt"]) {
    const relation = `ethos_technical."${table}"`;
    const p = (
      await c.query(
        "SELECT has_table_privilege('ethos_tenant_runtime',$1,'DELETE') AS del, has_any_column_privilege('ethos_auth_runtime',$1,'INSERT,UPDATE,SELECT') AS identity",
        [relation],
      )
    ).rows[0];
    assert.equal(p.del, false);
    assert.equal(p.identity, false);
  }
  writeFileSync(
    new URL(
      "../../../docs/etapa-0.11-consistency-provisioning.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        isolated: true,
        profile: "business-0.11-isolated",
        repeatedAclIdentical: true,
        oldProfileDowngradeBlocked: true,
        runtimeAdminFlagsFalse: true,
        noTechnicalDelete: true,
        identityRoleDeniedTechnicalAccess: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      isolated: true,
      profile: "business-0.11-isolated",
      applied: true,
    }),
  );
} catch (error) {
  await c.query("ROLLBACK").catch(() => {});
  console.error(error.code ?? "ISOLATED_PROFILE_FAILED");
  process.exitCode = 1;
} finally {
  await c.end();
}
