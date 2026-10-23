// Operational tooling: supplying --approved is not a substitute for user approval.
import { config } from "dotenv";
import { createHash, randomBytes } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  existsSync,
  statSync,
  readdirSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { poolConfiguration, caFile } from "../dist/settings.js";
import { supabaseTarget } from "./supabase-target.mjs";
import {
  catalogIntegritySql,
  dataIntegritySql,
  readIntegrity,
} from "./backup-integrity.mjs";

config({ path: new URL("../.env", import.meta.url), quiet: true });
const root = fileURLToPath(new URL("../../../", import.meta.url));
const mode = process.argv[2];
let client;
let restoreContainer;
try {
  if (
    !process.argv.includes("--approved") ||
    !["backup", "restore-check", "deploy", "grants", "credentials"].includes(
      mode,
    )
  )
    throw Error("EXPLICIT_APPROVAL_REQUIRED");
  const { url, reference, direct } = supabaseTarget(
    process.env.DIRECT_DATABASE_URL,
    process.env.EXPECTED_SUPABASE_PROJECT_REF,
  );
  if (process.env.ETHOS_LOCAL_DATABASE === "1")
    throw Error("CONFIRMED_SUPABASE_TARGET_REQUIRED");
  // Pin precisely the reviewed stage 0.9 plan; never deploy future migrations implicitly.
  const reviewed = {
    "20261022000000_init_infrastructure":
      "145a56ea984b9c55322bdb504bf113a07462fd83a7fa201d088814e988ff55e6",
    "20261022010000_multi_tenant_model":
      "bad76d74664eb2503fc9e29b55b31c7d6e6dd979b5fa87eab104420c9ea93410",
    "20261022020000_auth_identity":
      "2e3ba3f6aaceac65b4f106338e8e2edff008f267b95837a14b76e37a97114694",
    "20261022021000_auth_event_reason":
      "fceab468fb90d90c2c73f9ba13bba5028b57ca08188720de7c93e771330adc62",
    "20261022022000_auth_privilege_revocation":
      "95e74ebbc561c6b07b97ed37e4a77c8edf1ed41ece91f043f2e6368b0cf1a478",
  };
  const migrations = new URL("../prisma/migrations/", import.meta.url);
  const actual = readdirSync(migrations)
    .filter((name) => /^\d+_/.test(name))
    .sort();
  if (
    actual.join() !== Object.keys(reviewed).sort().join() ||
    actual.some(
      (name) =>
        createHash("sha256")
          .update(readFileSync(new URL(`${name}/migration.sql`, migrations)))
          .digest("hex") !== reviewed[name],
    )
  )
    throw Error("REVIEWED_MIGRATION_PLAN_CHANGED");
  const fingerprint = createHash("sha256").update(reference).digest("hex");
  const backupDir = resolve(root, ".backups", fingerprint);
  const manifestPath = resolve(backupDir, "activation.json");
  const dumpPath = resolve(backupDir, "before-auth.dump");
  client = new pg.Client(poolConfiguration(url.toString(), 1));
  await client.connect();
  const history = (
    await client.query(`SELECT migration_name,checksum,finished_at,rolled_back_at
    FROM ethos_technical._prisma_migrations`)
  ).rows;
  if (
    history.some(
      (entry) =>
        !entry.rolled_back_at &&
        (!entry.finished_at ||
          reviewed[entry.migration_name] !== entry.checksum),
    )
  )
    throw Error("DATABASE_MIGRATION_HISTORY_REQUIRES_REVIEW");
  if (mode === "backup") {
    const nativeDump = process.env.PG_DUMP_PATH;
    const nativeRestore = process.env.PG_RESTORE_PATH;
    if (direct && (!nativeDump || !nativeRestore))
      throw Error("NATIVE_DIRECT_BACKUP_CLIENT_REQUIRED");
    if (nativeDump) {
      const version = spawnSync(nativeDump, ["--version"], {
        encoding: "utf8",
      });
      if (version.status !== 0 || !/\(PostgreSQL\) 17\./.test(version.stdout))
        throw Error("POSTGRES_17_NATIVE_DUMP_REQUIRED");
    }
    if (nativeRestore) {
      const version = spawnSync(nativeRestore, ["--version"], {
        encoding: "utf8",
      });
      if (version.status !== 0 || !/\(PostgreSQL\) 17\./.test(version.stdout))
        throw Error("POSTGRES_17_NATIVE_RESTORE_REQUIRED");
    }
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const snapshot = (
      await client.query("SELECT pg_export_snapshot() AS snapshot")
    ).rows[0].snapshot;
    const integrity = await readIntegrity(client);
    const preflight = (
      await client.query(`SELECT to_regnamespace('ethos_identity') IS NULL AS baseline,
      NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime')) AS roles_absent,
      (SELECT count(*)::int FROM pg_tables WHERE schemaname IN ('ethos','ethos_technical')) AS table_count`)
    ).rows[0];
    if (!preflight.baseline || !preflight.roles_absent)
      throw Error("BASELINE_CHANGED_REVIEW_REQUIRED");
    mkdirSync(backupDir, { recursive: true });
    if (existsSync(dumpPath) || existsSync(manifestPath))
      throw Error("BACKUP_ALREADY_EXISTS_DO_NOT_OVERWRITE");
    // Restrict Windows directory ACLs before writing any data.
    const who = spawnSync("whoami.exe", [], { encoding: "utf8" });
    if (who.status !== 0) throw Error("BACKUP_ACL_IDENTITY_FAILED");
    const acl = spawnSync(
      "icacls.exe",
      [
        backupDir,
        "/inheritance:r",
        "/grant:r",
        `${who.stdout.trim()}:(OI)(CI)F`,
      ],
      { stdio: "ignore" },
    );
    if (acl.status !== 0) throw Error("BACKUP_ACL_FAILED");
    const fd = openSync(dumpPath, "wx");
    let dump;
    try {
      if (nativeDump) {
        dump = spawnSync(
          nativeDump,
          [
            "--format=custom",
            "--schema=ethos",
            "--schema=ethos_technical",
            "--lock-wait-timeout=5s",
            `--snapshot=${snapshot}`,
          ],
          {
            env: {
              ...process.env,
              PGHOST: url.hostname,
              PGPORT: url.port || "5432",
              PGUSER: decodeURIComponent(url.username),
              PGPASSWORD: decodeURIComponent(url.password),
              PGDATABASE: "postgres",
              PGSSLMODE: "verify-full",
              PGSSLROOTCERT: caFile,
              PGCONNECT_TIMEOUT: "10",
            },
            stdio: ["ignore", fd, "pipe"],
            timeout: 180000,
          },
        );
      } else
        dump = spawnSync(
          "docker",
          [
            "run",
            "--rm",
            "--network",
            "bridge",
            "--env",
            "PGHOST",
            "--env",
            "PGPORT",
            "--env",
            "PGUSER",
            "--env",
            "PGPASSWORD",
            "--env",
            "PGDATABASE",
            "--env",
            "PGSSLMODE=verify-full",
            "--env",
            "PGSSLROOTCERT=/supabase-ca.crt",
            "--mount",
            `type=bind,source=${caFile},target=/supabase-ca.crt,readonly`,
            "postgres:17.11",
            "pg_dump",
            "--format=custom",
            "--schema=ethos",
            "--schema=ethos_technical",
            "--lock-wait-timeout=5s",
            `--snapshot=${snapshot}`,
          ],
          {
            env: {
              ...process.env,
              PGHOST: url.hostname,
              PGPORT: url.port,
              PGUSER: decodeURIComponent(url.username),
              PGPASSWORD: decodeURIComponent(url.password),
              PGDATABASE: "postgres",
            },
            stdio: ["ignore", fd, "pipe"],
            timeout: 180000,
          },
        );
    } finally {
      closeSync(fd);
    }
    if (dump.status !== 0 || statSync(dumpPath).size === 0)
      throw Error("BACKUP_FAILED_KEEP_ARTIFACT_FOR_REVIEW");
    await client.query("ROLLBACK");
    const listing = nativeRestore
      ? spawnSync(nativeRestore, ["--list", dumpPath], {
          encoding: "utf8",
          timeout: 30000,
        })
      : spawnSync(
          "docker",
          ["run", "--rm", "-i", "postgres:17.11", "pg_restore", "--list"],
          { input: readFileSync(dumpPath), encoding: "utf8", timeout: 30000 },
        );
    if (listing.status !== 0) throw Error("BACKUP_ARCHIVE_CHECK_FAILED");
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          projectFingerprint: fingerprint,
          createdAt: new Date().toISOString(),
          sha256: createHash("sha256")
            .update(readFileSync(dumpPath))
            .digest("hex"),
          tableCount: preflight.table_count,
          integrity,
          runtimeRolesAbsent: true,
          archiveReadable: true,
          restoreVerified: false,
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        backupCreated: true,
        archiveReadable: true,
        restoreVerified: false,
      }),
    );
  } else {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (
      manifest.projectFingerprint !== fingerprint ||
      manifest.sha256 !==
        createHash("sha256").update(readFileSync(dumpPath)).digest("hex")
    )
      throw Error("BACKUP_CHECKSUM_MISMATCH");
    if (mode === "restore-check") {
      const started = spawnSync(
        "docker",
        [
          "run",
          "--detach",
          "--network",
          "none",
          "--env",
          "POSTGRES_HOST_AUTH_METHOD=trust",
          "postgres:17.11",
        ],
        { encoding: "utf8", timeout: 30000 },
      );
      if (started.status !== 0 || !/^[a-f0-9]{64}$/.test(started.stdout.trim()))
        throw Error("RESTORE_CONTAINER_FAILED");
      restoreContainer = started.stdout.trim();
      let ready = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        if (
          spawnSync(
            "docker",
            ["exec", restoreContainer, "pg_isready", "-U", "postgres"],
            { stdio: "ignore" },
          ).status === 0
        ) {
          ready = true;
          break;
        }
        await new Promise((done) => setTimeout(done, 300));
      }
      if (!ready) throw Error("RESTORE_DATABASE_NOT_READY");
      if (
        spawnSync(
          "docker",
          [
            "exec",
            "-i",
            restoreContainer,
            "pg_restore",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "--exit-on-error",
            "--no-owner",
            "--no-privileges",
          ],
          { input: readFileSync(dumpPath), timeout: 180000 },
        ).status !== 0
      )
        throw Error("RESTORE_FAILED");
      const count = spawnSync(
        "docker",
        [
          "exec",
          restoreContainer,
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-Atc",
          "SELECT count(*) FROM pg_tables WHERE schemaname IN ('ethos','ethos_technical')",
        ],
        { encoding: "utf8" },
      );
      if (
        count.status !== 0 ||
        Number(count.stdout.trim()) !== manifest.tableCount
      )
        throw Error("RESTORE_TABLE_COUNT_MISMATCH");
      if (!manifest.integrity) throw Error("BACKUP_INTEGRITY_SUMMARY_REQUIRED");
      const verification = spawnSync(
        "docker",
        [
          "exec",
          "-i",
          restoreContainer,
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-At",
          "--set",
          "ON_ERROR_STOP=1",
        ],
        {
          input: `SET TIME ZONE 'UTC';\n${catalogIntegritySql};\n${dataIntegritySql(manifest.integrity.catalog.tables)};`,
          encoding: "utf8",
          timeout: 180000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      if (verification.status !== 0)
        throw Error("RESTORE_INTEGRITY_QUERY_FAILED");
      const summaries = verification.stdout
        .split(/\r?\n/)
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line));
      const restoredIntegrity = {
        catalog: summaries[0],
        data: summaries.slice(1),
      };
      if (
        JSON.stringify(restoredIntegrity) !== JSON.stringify(manifest.integrity)
      )
        throw Error("RESTORED_CATALOG_OR_DATA_DIFFER");
      manifest.restoreVerified = true;
      manifest.restoreVerifiedAt = new Date().toISOString();
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(
        JSON.stringify({
          restoreVerified: true,
          isolatedNetwork: true,
          tableCount: manifest.tableCount,
          ownershipAndGrantsRestored: false,
          catalogAndDataVerified: true,
        }),
      );
    } else if (!manifest.restoreVerified)
      throw Error("VERIFIED_RESTORE_REQUIRED");
    else if (mode === "deploy") {
      const result = spawnSync(
        process.execPath,
        ["scripts/prisma.mjs", "migrate", "deploy"],
        {
          cwd: new URL("../", import.meta.url),
          env: process.env,
          encoding: "utf8",
          timeout: 310000,
        },
      );
      // The existing Prisma wrapper sanitizes credentials; suppress raw child diagnostics here too.
      if (result.status !== 0)
        throw Error("MIGRATION_DEPLOY_FAILED_REAUDIT_REQUIRED");
      console.log(JSON.stringify({ migrationsDeployed: true }));
    } else if (mode === "grants") {
      const before = (
        await client.query(
          "SELECT rolname FROM pg_roles WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime')",
        )
      ).rows;
      if (before.length && !manifest.runtimeRolesCreatedByActivation)
        throw Error("EXISTING_ROLES_REQUIRE_REVIEW");
      await client.query(
        readFileSync(
          new URL("./prepare-auth-runtime.sql", import.meta.url),
          "utf8",
        ),
      );
      manifest.runtimeRolesCreatedByActivation = true;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(JSON.stringify({ runtimeGrantsApplied: true }));
    } else {
      const secretDir = resolve(root, ".secrets");
      mkdirSync(secretDir, { recursive: true });
      const who = spawnSync("whoami.exe", [], { encoding: "utf8" });
      if (who.status !== 0) throw Error("SECRET_ACL_IDENTITY_FAILED");
      if (
        spawnSync(
          "icacls.exe",
          [
            secretDir,
            "/inheritance:r",
            "/grant:r",
            `${who.stdout.trim()}:(OI)(CI)F`,
          ],
          { stdio: "ignore" },
        ).status !== 0
      )
        throw Error("SECRET_ACL_FAILED");
      const destination = resolve(secretDir, "auth-runtime.env");
      if (existsSync(destination))
        throw Error("CREDENTIAL_FILE_ALREADY_EXISTS");
      // Only initial password assignment is authorized here, never implicit rotation.
      if (
        !manifest.runtimeRolesAbsent ||
        !manifest.runtimeRolesCreatedByActivation ||
        manifest.credentialsStarted
      )
        throw Error("EXISTING_CREDENTIAL_REQUIRES_REVIEW");
      await client.query(
        readFileSync(
          new URL("./prepare-auth-runtime.sql", import.meta.url),
          "utf8",
        ),
      );
      const identity = randomBytes(32).toString("base64url"),
        tenant = randomBytes(32).toString("base64url");
      const makeUrl = (role, password) => {
        const value = new URL(url);
        value.username = direct ? role : `${role}.${reference}`;
        value.password = password;
        value.search = "";
        return value.toString();
      };
      // Persist securely before assigning passwords, preventing loss after a partial failure.
      writeFileSync(
        destination,
        `AUTH_IDENTITY_DATABASE_URL=${makeUrl("ethos_auth_runtime", identity)}\nDATABASE_URL=${makeUrl("ethos_tenant_runtime", tenant)}\nAUTH_COOKIE_SECRET=${randomBytes(48).toString("base64url")}\nAUTH_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}\n`,
        { flag: "wx" },
      );
      manifest.credentialsStarted = true;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      await client.query("BEGIN");
      await client.query("SET LOCAL password_encryption = 'scram-sha-256'");
      // Password alphabet is deliberately base64url only; no user-controlled SQL interpolation.
      await client.query(
        `ALTER ROLE ethos_auth_runtime PASSWORD '${identity}'`,
      );
      await client.query(
        `ALTER ROLE ethos_tenant_runtime PASSWORD '${tenant}'`,
      );
      await client.query("COMMIT");
      console.log(
        JSON.stringify({
          initialCredentialsAssigned: true,
          storedLocally: true,
          secretsPrinted: false,
        }),
      );
    }
  }
} catch (error) {
  await client?.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({
      stopped: true,
      mode,
      reason: /^[A-Z_]+$/.test(error?.message ?? "")
        ? error.message
        : "OPERATION_FAILED_REAUDIT_REQUIRED",
    }),
  );
  process.exitCode = 1;
} finally {
  await client?.end();
  if (restoreContainer) {
    const removed = spawnSync(
      "docker",
      ["rm", "--force", "--volumes", restoreContainer],
      { stdio: "ignore" },
    );
    if (removed.status !== 0) {
      console.error("LOCAL_RESTORE_CONTAINER_CLEANUP_REQUIRED");
      process.exitCode = 1;
    }
  }
}
