// No source connection: restores an existing protected archive into network-none Docker.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const id = process.argv[2];
assert(/^stage-0\.10\.1-[0-9a-f-]{36}$/.test(id ?? ""));
const root = fileURLToPath(new URL("../../../", import.meta.url)),
  folder = resolve(root, ".backups", id),
  manifest = JSON.parse(readFileSync(resolve(folder, "manifest.json"), "utf8")),
  archive = process.argv.includes("--encrypted")
    ? JSON.parse(
        decryptBackup(
          readFileSync(
            resolve(root, ".backups/encrypted-0.11/application.enc"),
          ),
          readFileSync(resolve(root, ".secrets/backup-0.11.key")),
        ).toString("utf8"),
      )
    : undefined,
  dump = archive
    ? Buffer.from(archive.dump, "base64")
    : readFileSync(resolve(folder, "application.dump"));
if (archive) assert.deepEqual(archive.manifest, manifest);
assert.equal(manifest.projectId, "wszrtvgjcgpgntsssbhd");
assert.equal(createHash("sha256").update(dump).digest("hex"), manifest.sha256);
let container,
  stage = "start";
const run = (args, options = {}) => {
  const r = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 30 * 1024 * 1024,
    ...options,
  });
  if (r.status !== 0) throw Error(`${stage}_FAILED`);
  return r.stdout;
};
try {
  container = run([
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
    if (
      spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], {
        stdio: "ignore",
      }).status === 0
    )
      break;
    await new Promise((r) => setTimeout(r, 300));
  }
  stage = "roles";
  run(
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
    { input: manifest.roleSql },
  );
  stage = "restore";
  run(
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
    { input: dump },
  );
  stage = "compare";
  const result = run(
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
      input: `SET TIME ZONE 'UTC';\n${applicationCatalogSql};\n${dataIntegritySql(manifest.integrity.catalog.tables)};\n${applicationAclSql};`,
    },
  )
    .split(/\r?\n/)
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l));
  writeFileSync(
    resolve(folder, "restored-integrity.json"),
    JSON.stringify(result, null, 2),
  );
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const report = {
    projectId: manifest.projectId,
    at: new Date().toISOString(),
    sourceConnection: false,
    sourceWrites: false,
    archiveSha256: manifest.sha256,
    archiveVerified: true,
    isolatedNetwork: true,
    catalog: Object.fromEntries(
      Object.keys(manifest.integrity.catalog).map((k) => [
        k,
        same(result[0][k], manifest.integrity.catalog[k]),
      ]),
    ),
    dataMatch: same(result.slice(1, -1), manifest.integrity.data),
    acl: Object.fromEntries(
      Object.keys(manifest.acl).map((k) => [
        k,
        same(result.at(-1)[k], manifest.acl[k]),
      ]),
    ),
  };
  report.normalizedConstraintsMatch = same(
    canonicalConstraints(result[0].constraints),
    canonicalConstraints(manifest.integrity.catalog.constraints),
  );
  report.effectiveTableAclMatch = same(
    canonicalTableAcl(result.at(-1).tables),
    canonicalTableAcl(manifest.acl.tables),
  );
  report.completed =
    Object.entries(report.catalog).every(([k, v]) =>
      k === "constraints" ? report.normalizedConstraintsMatch : v,
    ) &&
    report.dataMatch &&
    Object.entries(report.acl).every(([k, v]) =>
      k === "tables" ? report.effectiveTableAclMatch : v,
    );
  report.normalizations = [
    "varchar array cast versus per-element text casts in literal CHECK lists",
    "explicit owner-only default table ACL versus implicit default owner ACL",
  ];
  if (process.argv.includes("--encrypted")) {
    report.encryptedEnvelope = true;
    const encryptionPath = resolve(root, "docs/etapa-0.11-encryption.json");
    const encryption = JSON.parse(readFileSync(encryptionPath, "utf8"));
    encryption.recoveryPending = !report.completed;
    encryption.restoreEvidence = "docs/etapa-0.11-restore.json";
    writeFileSync(encryptionPath, JSON.stringify(encryption, null, 2) + "\n");
  }
  writeFileSync(
    resolve(
      root,
      process.argv.includes("--encrypted")
        ? "docs/etapa-0.11-restore.json"
        : "docs/etapa-0.10.1-restore.json",
    ),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  if (!report.completed) process.exitCode = 1;
} catch (e) {
  console.error(
    JSON.stringify({ failed: true, stage, code: e.code ?? e.name }),
  );
  process.exitCode = 1;
} finally {
  if (container && /^[a-f0-9]{64}$/.test(container))
    run(["rm", "--force", "--volumes", container]);
}
