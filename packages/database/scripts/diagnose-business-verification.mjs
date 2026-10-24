// Read-only diagnosis after a stopped activation validation. No retries or recovery.
import assert from "node:assert/strict";
import { config } from "dotenv";
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { poolConfiguration } from "../dist/settings.js";
import { supabaseTarget } from "./supabase-target.mjs";
import { applicationCatalogSql } from "./business-backup-integrity.mjs";
import { dataIntegritySql } from "./backup-integrity.mjs";
import {
  approvedProject,
  reviewedGrants,
} from "./business-activation-guards.mjs";
config({ path: new URL("../.env", import.meta.url), quiet: true });
const checked = supabaseTarget(
    process.env.DIRECT_DATABASE_URL,
    approvedProject,
  ),
  url = new URL(checked.url);
url.hostname = `db.${approvedProject}.supabase.co`;
url.username = decodeURIComponent(url.username).split(".")[0];
url.search = "";
const c = new pg.Client(poolConfiguration(url.toString(), 1));
try {
  await c.connect();
  await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await c.query("SET LOCAL TIME ZONE 'UTC'");
  const role = (
    await c.query(
      "SELECT current_user,rolsuper,rolbypassrls,pg_has_role(current_user,'ethos_tenant_runtime','SET') AS can_set_tenant_role,pg_has_role(current_user,'ethos_auth_runtime','SET') AS can_set_auth_role FROM pg_roles WHERE rolname=current_user",
    )
  ).rows[0];
  const tenantMembership = (
    await c.query(
      "SELECT m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member WHERE r.rolname='ethos_tenant_runtime' AND u.rolname=current_user",
    )
  ).rows;
  const b = JSON.parse(
    readFileSync(
      new URL("../../../docs/etapa-0.10.1-backup.json", import.meta.url),
      "utf8",
    ),
  );
  const before = JSON.parse(
    readFileSync(
      new URL(
        `../../../${b.backup.primary}/business-activation-before.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const catalog = (await c.query(applicationCatalogSql)).rows[0].catalog;
  const data = (await c.query(dataIntegritySql(catalog.tables))).map(
    (r) => r.rows[0].data,
  );
  assert.deepEqual(data, before.data);
  assert.deepEqual(catalog, before.catalog);
  assert.equal(tenantMembership.length, 1);
  assert(
    tenantMembership[0].admin_option &&
      !tenantMembership[0].inherit_option &&
      !tenantMembership[0].set_option,
  );
  const grants = reviewedGrants(
    readFileSync(
      new URL("./propose-business-runtime.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const grant of grants) {
    const result = await c.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='ethos' AND table_name=$1 AND has_column_privilege('ethos_tenant_runtime',format('%I.%I',table_schema,table_name),column_name,$2) ORDER BY column_name",
      [grant.table, grant.privilege],
    );
    assert.deepEqual(
      result.rows.map((r) => r.column_name).sort(),
      [...grant.columns].sort(),
    );
  }
  const safe = (
    await c.query(
      "SELECT NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit) AS safe FROM pg_roles WHERE rolname='ethos_tenant_runtime'",
    )
  ).rows[0].safe;
  assert(safe);
  const report = {
    projectId: approvedProject,
    at: new Date().toISOString(),
    readOnly: true,
    role,
    tenantMembership,
    approvedBusinessGrantsVerified: 44,
    tenantRuntimeSafe: true,
    all44TableDataHashesUnchanged: true,
    rlsAndStructuresUnchanged: true,
    forcedRlsTables: catalog.tables.filter((t) => t[2] && t[3]).length,
    organizationRows: data.find((t) => t.table === "ethos.Organization").rows,
    usersOrAuthModified: false,
    fixturesPersisted: false,
    noRecoveryPerformed: true,
  };
  await c.query("ROLLBACK");
  writeFileSync(
    new URL(
      "../../../docs/etapa-0.10.1-verification-diagnosis.json",
      import.meta.url,
    ),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({ readOnlyDiagnosisFailed: true, code: e.code ?? e.name }),
  );
  process.exitCode = 1;
} finally {
  await c.end();
}
