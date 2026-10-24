// Source is read-only; archive contents never appear on stdout or disk in plaintext.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { caFile } from "../dist/settings.js";
import {
  applicationCatalogSql,
  applicationAclSql,
} from "./business-backup-integrity.mjs";
import { dataIntegritySql } from "./backup-integrity.mjs";
import { encryptBackup, decryptBackup } from "./backup-envelope.mjs";
import {
  root,
  projectId,
  sourceConnection,
  protectedDirectory,
  protectedWrite,
  native,
} from "./access-preparation-common.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
let c,
  stage = "tools";
try {
  const bin = resolve(root, ".tools/postgresql17/native/pgsql/bin"),
    dumpExe = resolve(bin, "pg_dump.exe"),
    restoreExe = resolve(bin, "pg_restore.exe");
  const versions = [dumpExe, restoreExe].map((exe) =>
    native(exe, ["--version"]).toString().trim(),
  );
  assert.ok(versions.every((v) => /PostgreSQL\) 17\./.test(v)));
  stage = "snapshot";
  const source = await sourceConnection();
  c = source.client;
  await c.query("SET LOCAL TIME ZONE 'UTC'");
  const snapshot = (await c.query("SELECT pg_export_snapshot() AS snapshot"))
    .rows[0].snapshot;
  const catalog = (await c.query(applicationCatalogSql)).rows[0].catalog;
  const data = (await c.query(dataIntegritySql(catalog.tables))).map(
    (r) => r.rows[0].data,
  );
  const acl = (await c.query(applicationAclSql)).rows[0].acl;
  const roles = (
    await c.query(
      "SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' AND rolname<>'postgres' ORDER BY rolname",
    )
  ).rows;
  const quote = (n) => '"' + n.replaceAll('"', '""') + '"';
  const roleSql = roles
    .map((r) => `CREATE ROLE ${quote(r.rolname)} NOLOGIN NOINHERIT;`)
    .join("\n");
  stage = "dump";
  const dump = native(
    dumpExe,
    [
      "--format=custom",
      "--schema=ethos",
      "--schema=ethos_identity",
      "--schema=ethos_technical",
      "--lock-wait-timeout=5s",
      `--snapshot=${snapshot}`,
    ],
    {
      env: {
        ...process.env,
        PGHOST: source.url.hostname,
        PGPORT: "5432",
        PGDATABASE: "postgres",
        PGUSER: decodeURIComponent(source.url.username),
        PGPASSWORD: decodeURIComponent(source.url.password),
        PGSSLMODE: "verify-full",
        PGSSLROOTCERT: caFile,
        PGCONNECT_TIMEOUT: "10",
      },
    },
  );
  await c.query("ROLLBACK");
  assert.ok(dump.length > 0);
  native(restoreExe, ["--list"], { input: dump });
  const id = `stage-0.11.1-${randomUUID()}`,
    key = randomBytes(32),
    keyPath = resolve(root, ".secrets", `${id}.key`);
  const manifest = {
    projectId,
    createdAt: new Date().toISOString(),
    sha256: sha(dump),
    integrity: { catalog, data },
    acl,
    roleSql,
  };
  const bundle = Buffer.from(
      JSON.stringify({ manifest, dump: dump.toString("base64") }),
    ),
    encrypted = encryptBackup(bundle, key);
  const primary = resolve(root, ".backups", id),
    secondary = resolve(root, ".backups/secondary", id);
  protectedWrite(keyPath, key);
  for (const folder of [primary, secondary]) {
    protectedDirectory(folder);
    protectedWrite(resolve(folder, "application.enc"), encrypted);
  }
  assert.deepEqual(
    decryptBackup(
      readFileSync(resolve(secondary, "application.enc")),
      readFileSync(keyPath),
    ),
    bundle,
  );
  assert.equal(
    sha(readFileSync(resolve(primary, "application.enc"))),
    sha(readFileSync(resolve(secondary, "application.enc"))),
  );
  const report = {
    at: new Date().toISOString(),
    projectId,
    id,
    sourceReadOnly: true,
    sourceWrites: false,
    tlsValidated: true,
    directIpv6: true,
    versions,
    schemas: ["ethos", "ethos_identity", "ethos_technical"],
    tables: catalog.tables.length,
    policies: catalog.policies.length,
    forcedRlsTables: catalog.tables.filter((t) => t[2] && t[3]).length,
    archiveSha256: sha(dump),
    encryptedSha256: sha(encrypted),
    bytes: encrypted.length,
    encrypted: true,
    twoProtectedLocalCopies: true,
    plaintextArchiveWritten: false,
    rolePasswordsExported: false,
    externalTransmission: false,
    restorePending: true,
  };
  writeFileSync(
    resolve(root, "docs/etapa-0.11.1-backup.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} catch (error) {
  if (c) await c.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({ failed: true, stage, code: error.code ?? error.name }),
  );
  process.exitCode = 1;
} finally {
  if (c) await c.end();
}
