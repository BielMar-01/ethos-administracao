import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createDatabaseClient,
  getDatabaseClient,
  disconnectDatabase,
} from "../dist/index.js";
import { poolConfiguration, migrationUrl, caFile } from "../dist/settings.js";
import { redact } from "../scripts/redact.mjs";

const fake = "postgresql://user:fake-password@localhost:5432/ethos";
test("configuração exige URL válida sem revelar o valor", () => {
  for (const value of [undefined, "segredo-invalido", "https://example.com"])
    assert.throws(() => poolConfiguration(value), /DATABASE_URL/);
});
test("pool limitado e TLS estrito não podem ser sobrescritos pela URI", () => {
  const options = poolConfiguration(`${fake}?sslmode=no-verify&ssl=false`, 2);
  assert.equal(options.max, 2);
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(
    new URL(options.connectionString).searchParams.has("sslmode"),
    false,
  );
  assert.equal(
    new URL(options.connectionString).searchParams.has("ssl"),
    false,
  );
  assert.ok(options.connectionTimeoutMillis > 0);
  assert.ok(options.query_timeout > 0);
  for (const size of [0, -1, 21, 1.5])
    assert.throws(() => poolConfiguration(fake, size));
});
test("migrations rejeitam pooler transacional e fixam schema técnico e CA", () => {
  assert.throws(
    () =>
      migrationUrl({
        DIRECT_DATABASE_URL:
          "postgresql://user:fake-password@aws-0-example.pooler.supabase.com:6543/postgres",
      }),
    /5432/,
  );
  const url = new URL(migrationUrl({ DIRECT_DATABASE_URL: fake }));
  assert.equal(url.searchParams.get("schema"), "ethos_technical");
  assert.equal(url.searchParams.get("sslaccept"), "strict");
  assert.equal(url.searchParams.get("sslmode"), "require");
  assert.ok(url.searchParams.get("sslcert"));
});
test("certificado público corresponde à CA oficial esperada", () => {
  const certificate = new X509Certificate(readFileSync(caFile));
  assert.equal(certificate.ca, true);
  assert.equal(
    certificate.fingerprint256,
    "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
  );
});
test("instâncias são lazy e fechamento é idempotente, inclusive sem consulta", async () => {
  const database = createDatabaseClient({ connectionString: fake });
  const first = database.disconnect();
  assert.equal(database.disconnect(), first);
  await first;
});
test("singleton reutiliza instância e é liberado no shutdown", async () => {
  const before = process.env.DATABASE_URL;
  process.env.DATABASE_URL = fake;
  try {
    const first = getDatabaseClient();
    assert.equal(getDatabaseClient(), first);
    await disconnectDatabase();
    const second = getDatabaseClient();
    assert.notEqual(first, second);
    await disconnectDatabase();
  } finally {
    if (before === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = before;
    await disconnectDatabase();
  }
});
test("condição browser bloqueia importação sem carregar o cliente PostgreSQL", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=browser",
      "--input-type=module",
      "-e",
      'import("@ethos/database")',
    ],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /só pode ser utilizado em servidor/);
});
test("logs removem URLs, usuários e senhas codificadas", () => {
  const environment = {
    DATABASE_URL: "postgresql://example-user:p%40ssword@localhost/db",
  };
  const safe = redact(
    "postgresql://example-user:p%40ssword@localhost/db example-user p@ssword p%40ssword",
    environment,
  );
  for (const secret of [
    "example-user",
    "p%40ssword",
    "p@ssword",
    "postgresql://",
  ])
    assert.equal(safe.includes(secret), false);
});
test("migration inicial é aditiva, transacional e restrita ao schema técnico", () => {
  const sql = readFileSync(
    new URL(
      "../prisma/migrations/20261022000000_init_infrastructure/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/i);
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /CREATE TABLE "ethos_technical"\."infrastructure_checks"/);
});
