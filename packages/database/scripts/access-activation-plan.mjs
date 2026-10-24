// Preflight is read-only. Apply may only be invoked after separate explicit approval.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  root,
  projectId,
  sourceConnection,
} from "./access-preparation-common.mjs";
import { decryptBackup } from "./backup-envelope.mjs";
import {
  applicationCatalogSql,
  applicationAclSql,
} from "./business-backup-integrity.mjs";
import { dataIntegritySql } from "./backup-integrity.mjs";
import { sha256, reviewedGrants } from "./business-activation-guards.mjs";
const migrationName = "20261024000000_mutation_consistency";
const proposedMigrationSha =
  "bcfe1a072f137f6bb10f8cebe39a000ff590b032826d1d97299838093eedfdf6";
const proposedGrantsSha =
  "2ab9ea2e98a10b093df2f84523d5c4f4dd876d2097b2087d457621bbe8984c8f";
const mode = process.argv[2];
let c,
  stage = "guards",
  migrationApplied = false,
  grantsApplied = false;
try {
  if (!["preflight", "apply"].includes(mode))
    throw Error("EXPLICIT_MODE_REQUIRED");
  if (mode === "apply" && !process.argv.includes("--approved"))
    throw Error("EXPLICIT_APPROVAL_REQUIRED");
  assert.ok(process.argv.includes(`--project=${projectId}`));
  stage = "sql_hashes";
  const migration = readFileSync(
    new URL(
      `../prisma/migrations/${migrationName}/migration.sql`,
      import.meta.url,
    ),
  );
  const sql = readFileSync(
    new URL("./propose-consistency-runtime.sql", import.meta.url),
    "utf8",
  );
  assert.equal(sha256(migration), proposedMigrationSha);
  assert.equal(sha256(sql), proposedGrantsSha);
  reviewedGrants(
    readFileSync(
      new URL("./propose-business-runtime.sql", import.meta.url),
      "utf8",
    ),
  );
  stage = "backup_validation";
  const backup = JSON.parse(
    readFileSync(resolve(root, "docs/etapa-0.11.1-backup.json"), "utf8"),
  );
  const restore = JSON.parse(
    readFileSync(resolve(root, "docs/etapa-0.11.1-restore.json"), "utf8"),
  );
  assert.equal(backup.projectId, projectId);
  assert.match(backup.id, /^stage-0\.11\.1-[a-f0-9-]{36}$/);
  assert.ok(restore.completed && !backup.restorePending);
  assert.equal(restore.archiveSha256, backup.archiveSha256);
  assert.ok(
    Date.now() - Date.parse(backup.at) < 24 * 3600000,
    "BACKUP_REFRESH_REQUIRED",
  );
  let encrypted;
  for (const prefix of [".backups", ".backups/secondary"]) {
    const copy = readFileSync(
      resolve(root, prefix, backup.id, "application.enc"),
    );
    assert.equal(sha256(copy), backup.encryptedSha256);
    encrypted = copy;
  }
  const { manifest, dump } = JSON.parse(
    decryptBackup(
      encrypted,
      readFileSync(resolve(root, ".secrets", `${backup.id}.key`)),
    ).toString("utf8"),
  );
  assert.equal(manifest.projectId, projectId);
  assert.equal(sha256(Buffer.from(dump, "base64")), backup.archiveSha256);
  stage = "source_read_only";
  const source = await sourceConnection();
  c = source.client;
  await c.query("SET LOCAL TIME ZONE 'UTC'");
  const catalog = (await c.query(applicationCatalogSql)).rows[0].catalog;
  assert.deepEqual(
    catalog,
    manifest.integrity.catalog,
    "CATALOG_CHANGED_REFRESH_BACKUP",
  );
  const current = (await c.query(dataIntegritySql(catalog.tables))).map(
    (r) => r.rows[0].data,
  );
  assert.deepEqual(
    current,
    manifest.integrity.data,
    "DATA_CHANGED_REFRESH_BACKUP",
  );
  assert.deepEqual(
    (await c.query(applicationAclSql)).rows[0].acl,
    manifest.acl,
    "ACL_CHANGED_REVIEW_REQUIRED",
  );
  stage = "runtime_privileges";
  const roles = (
    await c.query(
      "SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolinherit FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime') AND rolcanlogin ORDER BY rolname",
    )
  ).rows;
  assert.equal(roles.length, 2);
  assert.ok(
    roles.every((r) =>
      Object.entries(r).every(([k, v]) => k === "rolname" || v === false),
    ),
  );
  assert.equal(
    (
      await c.query(
        "SELECT count(*)::int AS n FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime'))",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await c.query(
        "SELECT count(*)::int AS n FROM pg_class WHERE relowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime'))",
      )
    ).rows[0].n,
    0,
  );
  stage = "migration_history";
  const history = (
    await c.query(
      "SELECT migration_name,checksum,finished_at,rolled_back_at FROM ethos_technical._prisma_migrations WHERE rolled_back_at IS NULL ORDER BY migration_name",
    )
  ).rows;
  const directory = new URL("../prisma/migrations/", import.meta.url),
    local = readdirSync(directory)
      .filter((n) => /^\d+_/.test(n))
      .sort();
  assert.deepEqual(
    local.filter((n) => !history.some((h) => h.migration_name === n)),
    [migrationName],
  );
  for (const item of history) {
    assert.ok(item.finished_at);
    assert.equal(
      item.checksum,
      sha256(
        readFileSync(
          new URL(`${item.migration_name}/migration.sql`, directory),
        ),
      ),
    );
  }
  await c.query("ROLLBACK");
  const report = {
    at: new Date().toISOString(),
    projectId,
    mode,
    sourceWrites: false,
    backupId: backup.id,
    backupMatchesCurrentDataCatalogAndAcl: true,
    migrationSha256: proposedMigrationSha,
    grantsSha256: proposedGrantsSha,
    migrationPending: migrationName,
    migrationApplied: false,
    grantsApplied: false,
    usersCreated: false,
    organizationsCreated: false,
    deploy: false,
  };
  if (mode === "apply") {
    // No old provisioning is called. Failures stop; there is no automatic recovery.
    stage = "migration";
    const result = spawnSync(
      process.execPath,
      ["scripts/prisma.mjs", "migrate", "deploy"],
      {
        cwd: new URL("../", import.meta.url),
        env: { ...process.env, DIRECT_DATABASE_URL: source.url.toString() },
        encoding: "utf8",
        timeout: 180000,
      },
    );
    assert.equal(result.status, 0, "MIGRATION_FAILED_REVIEW_REQUIRED");
    migrationApplied = true;
    writeFileSync(
      resolve(root, "docs/etapa-0.11.1-activation-progress.json"),
      JSON.stringify(
        { ...report, sourceWrites: true, migrationApplied },
        null,
        2,
      ) + "\n",
    );
    stage = "grants";
    await c.query(sql);
    grantsApplied = true;
    report.sourceWrites = true;
    report.migrationApplied = true;
    report.grantsApplied = true;
    report.validationPending = true;
  }
  writeFileSync(
    resolve(root, `docs/etapa-0.11.1-${mode}.json`),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} catch (error) {
  if (c) await c.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({
      failed: true,
      stage,
      code: ["EXPLICIT_MODE_REQUIRED", "EXPLICIT_APPROVAL_REQUIRED"].includes(
        error.message,
      )
        ? error.message
        : (error.code ?? error.name),
      migrationApplied,
      grantsApplied,
      recoveryAttempted: false,
    }),
  );
  process.exitCode = 1;
} finally {
  if (c) await c.end();
}
