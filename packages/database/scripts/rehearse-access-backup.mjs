// Restores encrypted source snapshot locally. No source connection exists here.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { root, projectId, native } from "./access-preparation-common.mjs";
import { decryptBackup } from "./backup-envelope.mjs";
import {
  applicationCatalogSql,
  applicationAclSql,
} from "./business-backup-integrity.mjs";
import { dataIntegritySql } from "./backup-integrity.mjs";
import {
  canonicalConstraints,
  canonicalTableAcl,
} from "./normalize-business-backup.mjs";
const simulation = process.argv.includes("--prepare-simulation");
const backup = JSON.parse(
  readFileSync(resolve(root, "docs/etapa-0.11.1-backup.json"), "utf8"),
);
assert.equal(backup.projectId, projectId);
assert.match(backup.id, /^stage-0\.11\.1-[a-f0-9-]{36}$/);
const encrypted = readFileSync(
  resolve(root, ".backups", backup.id, "application.enc"),
);
assert.equal(
  createHash("sha256").update(encrypted).digest("hex"),
  backup.encryptedSha256,
);
const { manifest, dump: encoded } = JSON.parse(
  decryptBackup(
    encrypted,
    readFileSync(resolve(root, ".secrets", `${backup.id}.key`)),
  ).toString("utf8"),
);
const dump = Buffer.from(encoded, "base64");
assert.equal(manifest.projectId, projectId);
assert.equal(
  createHash("sha256").update(dump).digest("hex"),
  backup.archiveSha256,
);
let container,
  verified = false,
  stage = "start";
const run = (args, input) => native("docker", args, { input }).toString("utf8");
try {
  const network = simulation
    ? [
        "--name",
        "ethos-access-0111",
        "--publish",
        "127.0.0.1:55439:5432",
        "--env",
        "POSTGRES_DB=ethos_auth_test",
        "--env",
        "POSTGRES_PASSWORD=ethos-local-disposable",
      ]
    : ["--network", "none", "--env", "POSTGRES_HOST_AUTH_METHOD=trust"];
  container = run(["run", "--detach", ...network, "postgres:17.11"]).trim();
  assert.match(container, /^[a-f0-9]{64}$/);
  let ready = false;
  for (let n = 0; n < 40; n++) {
    try {
      run(["exec", container, "pg_isready", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  assert.ok(ready);
  const db = simulation ? "ethos_auth_test" : "postgres";
  const query = (sql) =>
    run(
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        db,
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      sql,
    );
  stage = "restore";
  query(manifest.roleSql);
  run(
    [
      "exec",
      "-i",
      container,
      "pg_restore",
      "-U",
      "postgres",
      "-d",
      db,
      "--exit-on-error",
    ],
    dump,
  );
  stage = "compare";
  const result = query(
    `SET TIME ZONE 'UTC';\n${applicationCatalogSql};\n${dataIntegritySql(manifest.integrity.catalog.tables)};\n${applicationAclSql};`,
  )
    .split(/\r?\n/)
    .filter((s) => s.startsWith("{"))
    .map((s) => JSON.parse(s));
  assert.deepEqual(
    { ...result[0], constraints: canonicalConstraints(result[0].constraints) },
    {
      ...manifest.integrity.catalog,
      constraints: canonicalConstraints(manifest.integrity.catalog.constraints),
    },
  );
  assert.deepEqual(result.slice(1, -1), manifest.integrity.data);
  assert.deepEqual(
    { ...result.at(-1), tables: canonicalTableAcl(result.at(-1).tables) },
    { ...manifest.acl, tables: canonicalTableAcl(manifest.acl.tables) },
  );
  if (simulation)
    query(
      "ALTER ROLE ethos_auth_runtime LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD 'ethos-runtime-test-only'; ALTER ROLE ethos_tenant_runtime LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD 'ethos-tenant-test-only';",
    );
  verified = true;
  const report = {
    at: new Date().toISOString(),
    projectId,
    sourceConnection: false,
    sourceWrites: false,
    archiveSha256: backup.archiveSha256,
    encryptedSha256: backup.encryptedSha256,
    completed: true,
    tables: result[0].tables.length,
    policies: result[0].policies.length,
    catalogDataAndEffectiveAclMatch: true,
    encryptedArchiveRestored: true,
    isolated: true,
    networkNone: !simulation,
    loopbackOnly: simulation,
    retainedForSimulation: simulation,
    container: simulation ? container : undefined,
    normalizations: [
      "equivalent literal CHECK casts",
      "owner-only default table ACL representation",
    ],
  };
  writeFileSync(
    resolve(
      root,
      simulation
        ? "docs/etapa-0.11.1-simulation-restore.json"
        : "docs/etapa-0.11.1-restore.json",
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
  if (!simulation) {
    backup.restorePending = false;
    writeFileSync(
      resolve(root, "docs/etapa-0.11.1-backup.json"),
      JSON.stringify(backup, null, 2) + "\n",
    );
  }
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(
    JSON.stringify({ failed: true, stage, code: error.code ?? error.name }),
  );
  process.exitCode = 1;
} finally {
  if (container && (!simulation || !verified))
    run(["rm", "--force", "--volumes", container]);
}
