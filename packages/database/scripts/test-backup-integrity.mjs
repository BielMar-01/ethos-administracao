import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { catalogIntegritySql, dataIntegritySql } from "./backup-integrity.mjs";

let container;
const native = Boolean(process.env.PG_DUMP_PATH && process.env.PG_RESTORE_PATH);
function exec(args, input) {
  const result = spawnSync("docker", ["exec", "-i", container, ...args], {
    input,
    encoding: input instanceof Buffer ? undefined : "utf8",
    timeout: 30000,
  });
  assert.equal(result.status, 0, "ISOLATED_COMMAND_FAILED");
  return result.stdout;
}
function query(sql, database = "postgres") {
  return exec(
    [
      "psql",
      "-U",
      "postgres",
      "-d",
      database,
      "-At",
      "--set",
      "ON_ERROR_STOP=1",
    ],
    sql,
  );
}
function summary(database = "postgres") {
  const catalog = JSON.parse(query(catalogIntegritySql, database));
  const data = query(
    `SET TIME ZONE 'UTC'; ${dataIntegritySql(catalog.tables)}`,
    database,
  )
    .split(/\r?\n/)
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
  return { catalog, data };
}
try {
  const network = native
    ? ["--publish", "127.0.0.1:55441:5432"]
    : ["--network", "none"];
  const started = spawnSync(
    "docker",
    [
      "run",
      "--detach",
      ...network,
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "postgres:17.11",
    ],
    { encoding: "utf8" },
  );
  assert.equal(started.status, 0);
  container = started.stdout.trim();
  assert.match(container, /^[a-f0-9]{64}$/);
  let ready = false;
  for (let i = 0; i < 30; i++) {
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
  assert.equal(ready, true);
  const rows =
    "(1,12.34,'2030-01-01T00:00:00Z','ficticio'),(2,55.00,'2030-02-01T00:00:00Z','ensaio')";
  query(`CREATE SCHEMA ethos; CREATE SCHEMA ethos_technical;
    CREATE TABLE ethos.sample(id integer PRIMARY KEY, amount numeric(14,2) CHECK(amount>=0), happened timestamptz, label text);
    ALTER TABLE ethos.sample ENABLE ROW LEVEL SECURITY; ALTER TABLE ethos.sample FORCE ROW LEVEL SECURITY;
    CREATE POLICY scoped ON ethos.sample USING(false);
    INSERT INTO ethos.sample VALUES ${rows};`);
  const original = summary();
  query(
    `DELETE FROM ethos.sample; INSERT INTO ethos.sample VALUES (2,55.00,'2030-02-01T00:00:00Z','ensaio'),(1,12.34,'2030-01-01T00:00:00Z','ficticio');`,
  );
  assert.deepEqual(summary(), original);
  query("UPDATE ethos.sample SET amount=12.35 WHERE id=1");
  const changed = summary();
  assert.notEqual(changed.data[0].sha256, original.data[0].sha256);
  let archive;
  if (native) {
    const result = spawnSync(
      process.env.PG_DUMP_PATH,
      [
        "-h",
        "127.0.0.1",
        "-p",
        "55441",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "--format=custom",
        "--schema=ethos",
        "--schema=ethos_technical",
      ],
      {
        env: { ...process.env, PGSSLMODE: "disable", PGCONNECT_TIMEOUT: "5" },
        timeout: 30000,
      },
    );
    assert.equal(result.status, 0, "NATIVE_DUMP_FAILED");
    archive = result.stdout;
    assert.equal(
      spawnSync(process.env.PG_RESTORE_PATH, ["--list"], {
        input: archive,
        timeout: 10000,
      }).status,
      0,
    );
  } else
    archive = exec(
      [
        "pg_dump",
        "-U",
        "postgres",
        "--format=custom",
        "--schema=ethos",
        "--schema=ethos_technical",
      ],
      Buffer.alloc(0),
    );
  exec(["createdb", "-U", "postgres", "integrity_restore"]);
  if (native) {
    const result = spawnSync(
      process.env.PG_RESTORE_PATH,
      [
        "-h",
        "127.0.0.1",
        "-p",
        "55441",
        "-U",
        "postgres",
        "-d",
        "integrity_restore",
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
      ],
      {
        input: archive,
        env: { ...process.env, PGSSLMODE: "disable", PGCONNECT_TIMEOUT: "5" },
        timeout: 30000,
      },
    );
    assert.equal(result.status, 0, "NATIVE_RESTORE_FAILED");
  } else
    exec(
      [
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        "integrity_restore",
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
      ],
      archive,
    );
  assert.deepEqual(summary("integrity_restore"), changed);
  console.log(
    JSON.stringify({
      isolated: true,
      nativeClients: native,
      noSourceConnection: true,
      sha256DetectsChanges: true,
      insertionOrderIndependent: true,
      decimalAndTimestampPreserved: true,
      fullDataRestoreMatches: true,
      catalogAndRlsMatch: true,
    }),
  );
} catch {
  console.error("BACKUP_INTEGRITY_TEST_FAILED");
  process.exitCode = 1;
} finally {
  if (
    container &&
    spawnSync("docker", ["rm", "--force", "--volumes", container], {
      stdio: "ignore",
    }).status !== 0
  ) {
    console.error("LOCAL_INTEGRITY_CONTAINER_CLEANUP_REQUIRED");
    process.exitCode = 1;
  }
}
