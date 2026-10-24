// No database connection and no transmission. Only the previously reviewed archive.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { encryptBackup, decryptBackup } from "./backup-envelope.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url)),
  id = "stage-0.10.1-b377f036-b23d-4c3c-b74d-9d6e76f2a9a8";
const manifest = JSON.parse(
  readFileSync(resolve(root, ".backups", id, "manifest.json"), "utf8"),
);
const dump = readFileSync(resolve(root, ".backups", id, "application.dump"));
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(manifest.projectId, "wszrtvgjcgpgntsssbhd");
assert.equal(
  sha(dump),
  "5fbcd042675e56812ff1298d8e1a93c2b0da19513ddcc76d3556c2a6d3d3b353",
);
assert.equal(sha(dump), manifest.sha256);
assert.equal(
  sha(
    readFileSync(resolve(root, ".backups/secondary", id, "application.dump")),
  ),
  manifest.sha256,
);
const keyPath = resolve(root, ".secrets/backup-0.11.key");
function protect(path, directory = false) {
  if (process.platform !== "win32") return;
  const sid = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
    ],
    { encoding: "utf8" },
  ).trim();
  assert.match(sid, /^S-1-[0-9-]+$/);
  const rights = directory ? "(OI)(CI)F" : "F";
  execFileSync(
    "icacls.exe",
    [
      path,
      "/inheritance:r",
      "/grant:r",
      `*${sid}:${rights}`,
      `*S-1-5-18:${rights}`,
    ],
    { stdio: "pipe" },
  );
  execFileSync(
    "icacls.exe",
    [path, "/remove:g", "*S-1-1-0", "*S-1-5-11", "*S-1-5-32-545"],
    { stdio: "pipe" },
  );
}
const renew = process.argv.includes("--renew-local-key");
if (!existsSync(keyPath))
  writeFileSync(keyPath, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
protect(keyPath);
if (renew || readFileSync(keyPath).length === 0)
  writeFileSync(keyPath, randomBytes(32));
const key = readFileSync(keyPath),
  bundle = Buffer.from(
    JSON.stringify({ manifest, dump: dump.toString("base64") }),
  );
const encrypted = encryptBackup(bundle, key),
  primary = resolve(root, ".backups/encrypted-0.11"),
  secondary = resolve(root, ".backups/secondary/encrypted-0.11");
for (const folder of [primary, secondary]) {
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  protect(folder, true);
  const file = resolve(folder, "application.enc");
  if (existsSync(file) && !renew)
    throw Error("ENCRYPTED_ARCHIVE_ALREADY_EXISTS");
  if (!existsSync(file))
    writeFileSync(file, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
  protect(file);
  writeFileSync(file, encrypted);
}
assert.deepEqual(
  decryptBackup(readFileSync(resolve(secondary, "application.enc")), key),
  bundle,
);
assert.equal(
  sha(readFileSync(resolve(primary, "application.enc"))),
  sha(readFileSync(resolve(secondary, "application.enc"))),
);
const report = {
  sourceSnapshot: id,
  sourceConnection: false,
  sourceWrites: false,
  archiveVerified: true,
  metadataIncluded: true,
  algorithm: "AES-256-GCM",
  encryptedSha256: sha(encrypted),
  bytes: encrypted.length,
  twoLocalCopiesVerified: true,
  externalTransmission: false,
  keyStoredSeparately: true,
  localAclsRestricted: true,
  recoveryPending: true,
};
writeFileSync(
  resolve(root, "docs/etapa-0.11-encryption.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
