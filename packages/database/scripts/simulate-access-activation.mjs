import assert from "node:assert/strict";
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dataIntegritySql } from "./backup-integrity.mjs";
import {
  applicationCatalogSql,
  applicationAclSql,
} from "./business-backup-integrity.mjs";
import { sha256 } from "./business-activation-guards.mjs";
import { root, native } from "./access-preparation-common.mjs";
import { resolve } from "node:path";
const clone = JSON.parse(
  readFileSync(
    resolve(root, "docs/etapa-0.11.1-simulation-restore.json"),
    "utf8",
  ),
);
assert.ok(clone.completed && clone.loopbackOnly);
assert.equal(
  native("docker", ["inspect", "--format", "{{.Id}}", "ethos-access-0111"])
    .toString()
    .trim(),
  clone.container,
);
const url =
  "postgresql://postgres:ethos-local-disposable@127.0.0.1:55439/ethos_auth_test";
const c = new pg.Client({ connectionString: url, ssl: false });
let stage = "before";
try {
  await c.connect();
  const catalog = (await c.query(applicationCatalogSql)).rows[0].catalog;
  const preserved = catalog.tables.filter(
    ([, table]) => table !== "_prisma_migrations",
  );
  const fingerprint = async () =>
    (await c.query(dataIntegritySql(preserved))).map((r) => r.rows[0].data);
  const before = await fingerprint(),
    aclBefore = (await c.query(applicationAclSql)).rows[0].acl;
  stage = "migration";
  const migration = spawnSync(
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
      timeout: 60000,
    },
  );
  assert.equal(migration.status, 0, "ISOLATED_MIGRATION_FAILED");
  stage = "grants";
  const sql = readFileSync(
    new URL("./propose-consistency-runtime.sql", import.meta.url),
    "utf8",
  );
  await c.query(sql);
  assert.deepEqual(await fingerprint(), before);
  const after = (await c.query(applicationAclSql)).rows[0].acl;
  assert.deepEqual(
    after.columns.filter((r) => r[0] !== "ethos_technical"),
    aclBefore.columns.filter((r) => r[0] !== "ethos_technical"),
  );
  assert.deepEqual(
    after.tables.filter((r) => r[0] !== "ethos_technical"),
    aclBefore.tables.filter((r) => r[0] !== "ethos_technical"),
  );
  const flags = (
    await c.query(
      "SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,rolinherit FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime')",
    )
  ).rows;
  assert.ok(flags.every((r) => Object.values(r).every((v) => v === false)));
  const report = {
    at: new Date().toISOString(),
    isolated: true,
    sourceConnection: false,
    sourceWrites: false,
    migrationApplied: "20261024000000_mutation_consistency",
    sqlSha256: sha256(sql),
    preexistingApplicationDataPreserved: true,
    preexistingBusinessColumnAndTableGrantsPreserved: true,
    runtimeFlagsRestricted: true,
  };
  writeFileSync(
    resolve(root, "docs/etapa-0.11.1-simulation.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} catch (error) {
  await c.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({ failed: true, stage, code: error.code ?? error.name }),
  );
  process.exitCode = 1;
} finally {
  await c.end();
}
