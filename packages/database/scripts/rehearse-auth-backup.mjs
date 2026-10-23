// Read-only schema export; no business rows, source DDL, roles or migrations.
// Restores only into a newly created local container with no network or published ports.
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { caFile } from "../dist/settings.js";

config({ path: new URL("../.env", import.meta.url), quiet: true });
let container;
try {
  const url = new URL(process.env.DIRECT_DATABASE_URL);
  if (!url.hostname.endsWith(".pooler.supabase.com") || url.port !== "5432")
    throw Error("AUDITED_SESSION_TARGET_REQUIRED");
  const dumped = spawnSync(
    "docker",
    [
      "run",
      "--rm",
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
      "PGCONNECT_TIMEOUT=6",
      "--env",
      "PGSSLMODE=verify-full",
      "--env",
      "PGSSLROOTCERT=/ca.crt",
      "--mount",
      `type=bind,source=${caFile},target=/ca.crt,readonly`,
      "postgres:17.11",
      "pg_dump",
      "--schema-only",
      "--format=custom",
      "--schema=ethos",
      "--schema=ethos_technical",
      "--lock-wait-timeout=5s",
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
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (dumped.status !== 0 || !dumped.stdout.length)
    throw Error("SCHEMA_DUMP_FAILED");
  const start = spawnSync(
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
  if (start.status !== 0 || !/^[a-f0-9]{64}$/.test(start.stdout.trim()))
    throw Error("LOCAL_RESTORE_START_FAILED");
  container = start.stdout.trim();
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (
      spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], {
        stdio: "ignore",
      }).status === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((done) => setTimeout(done, 300));
  }
  if (!ready) throw Error("LOCAL_RESTORE_NOT_READY");
  const restored = spawnSync(
    "docker",
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
      "--no-owner",
      "--no-privileges",
    ],
    { input: dumped.stdout, timeout: 30000 },
  );
  if (restored.status !== 0) throw Error("LOCAL_RESTORE_FAILED");
  const result = spawnSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-U",
      "postgres",
      "-Atc",
      `SELECT json_build_object(
    'tables',(SELECT count(*) FROM pg_tables WHERE schemaname IN ('ethos','ethos_technical')),
    'forcedRlsTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ethos' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity),
    'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='ethos'))`,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw Error("LOCAL_RESTORE_VERIFICATION_FAILED");
  const summary = JSON.parse(result.stdout);
  if (summary.tables !== 36 || summary.forcedRlsTables !== 34)
    throw Error("LOCAL_RESTORE_COUNTS_DIFFER");
  console.log(
    JSON.stringify({
      schemaOnly: true,
      sourceReadOnly: true,
      dumpVersion: "17.11",
      sourceClientTlsVerifyFull: true,
      sourceConnection: "session-pooler",
      noBusinessRowsExported: true,
      isolatedRestorePassed: true,
      ownershipAndAclRestored: false,
      ...summary,
    }),
  );
} catch {
  console.error("SCHEMA_BACKUP_REHEARSAL_FAILED_NO_SECRETS_LOGGED");
  process.exitCode = 1;
} finally {
  if (
    container &&
    spawnSync("docker", ["rm", "--force", "--volumes", container], {
      stdio: "ignore",
    }).status !== 0
  ) {
    console.error("LOCAL_RESTORE_CLEANUP_REQUIRED");
    process.exitCode = 1;
  }
}
