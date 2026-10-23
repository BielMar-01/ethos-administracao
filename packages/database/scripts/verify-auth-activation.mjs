// Read-only checks against the approved project. No fixtures, workers or HTTP listener.
import assert from "node:assert/strict";
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import pg from "pg";
import { createDatabaseClient } from "../dist/index.js";
import { poolConfiguration } from "../dist/settings.js";
import { readIntegrity, dataIntegritySql } from "./backup-integrity.mjs";
import { supabaseTarget } from "./supabase-target.mjs";
import { registerAuth } from "../../../apps/api/dist/auth/routes.js";

config({ path: new URL("../.env", import.meta.url), quiet: true });
const secret = {};
config({
  path: new URL("../../../.secrets/auth-runtime.env", import.meta.url),
  quiet: true,
  processEnv: secret,
});
const expected = process.env.EXPECTED_SUPABASE_PROJECT_REF;
const connections = [];
let admin, app;
try {
  assert.equal(expected, "wszrtvgjcgpgntsssbhd");
  const source = supabaseTarget(process.env.DIRECT_DATABASE_URL, expected);
  const direct = new URL(source.url);
  direct.hostname = `db.${expected}.supabase.co`;
  direct.username = decodeURIComponent(direct.username).split(".")[0];
  direct.search = "";
  const fingerprint = createHash("sha256").update(expected).digest("hex");
  const manifest = JSON.parse(
    readFileSync(
      new URL(
        `../../../.backups/${fingerprint}/activation.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  admin = new pg.Client(poolConfiguration(direct.toString(), 1));
  await admin.connect();
  await admin.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await admin.query("SET LOCAL TIME ZONE 'UTC'");
  const current = await readIntegrity(admin);
  const oldMigrationSql = dataIntegritySql([
    ["ethos_technical", "_prisma_migrations"],
  ]).replace(
    'FROM "ethos_technical"."_prisma_migrations" t',
    "FROM (SELECT * FROM \"ethos_technical\".\"_prisma_migrations\" WHERE migration_name IN ('20261022000000_init_infrastructure','20261022010000_multi_tenant_model')) t",
  );
  const oldHistory = (await admin.query(oldMigrationSql)).rows[0].data;
  const original = current.data.map((entry) =>
    entry.table === "ethos_technical._prisma_migrations" ? oldHistory : entry,
  );
  assert.deepEqual(original, manifest.integrity.data);
  const tables = (
    await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='ethos_identity' AND c.relkind='r' ORDER BY 1`)
  ).rows;
  assert.equal(tables.length, 8);
  assert(tables.every((t) => t.relrowsecurity && t.relforcerowsecurity));
  const counts = [];
  for (const table of tables) {
    assert.match(table.relname, /^Auth[A-Za-z]+$/);
    counts.push(
      Number(
        (
          await admin.query(
            `SELECT count(*)::int AS n FROM ethos_identity."${table.relname}"`,
          )
        ).rows[0].n,
      ),
    );
  }
  assert(counts.every((count) => count === 0));
  const policies = (
    await admin.query(
      "SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='ethos_identity'",
    )
  ).rows[0].n;
  assert.equal(policies, 8);
  const definer = (
    await admin.query(`SELECT p.prosecdef,p.proconfig,r.rolbypassrls,
    EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND privilege_type='EXECUTE') AS public_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
    WHERE n.nspname='ethos_identity' AND p.proname='revoke_on_privilege_change'`)
  ).rows[0];
  assert.equal(definer.prosecdef, true);
  assert.equal(definer.rolbypassrls, true);
  assert.equal(definer.public_execute, false);
  assert.deepEqual(definer.proconfig, ["search_path=pg_catalog"]);
  await admin.query("ROLLBACK");
  for (const key of ["AUTH_IDENTITY_DATABASE_URL", "DATABASE_URL"]) {
    assert.equal(supabaseTarget(secret[key], expected).direct, true);
    const client = createDatabaseClient({
      connectionString: secret[key],
      maxConnections: 1,
    });
    connections.push(client);
    const [ssl] = await client.prisma.$queryRawUnsafe(
      "SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()",
    );
    assert.equal(ssl.ssl, true);
  }
  const require = createRequire(
    new URL("../../../apps/api/package.json", import.meta.url),
  );
  app = require("fastify")({ logger: false });
  await registerAuth(app, {
    identity: connections[0].prisma,
    tenant: connections[1].prisma,
    cookieSecret: secret.AUTH_COOKIE_SECRET,
    encryptionKey: Buffer.from(secret.AUTH_ENCRYPTION_KEY, "base64"),
    origin: "http://localhost:3000",
    production: false,
    deliver: async () => {
      throw Error("MAIL_FORBIDDEN_IN_READ_ONLY_VERIFICATION");
    },
  });
  await app.ready();
  const unauthenticated = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
  });
  assert.equal(unauthenticated.statusCode, 401);
  const report = {
    at: new Date().toISOString(),
    projectId: expected,
    persistentWrites: false,
    preexistingDataAndMigrationRowsPreserved: true,
    identityTables: 8,
    identityPolicies: 8,
    identityTablesForceRls: true,
    identityTablesEmpty: true,
    runtimeBackendTls: true,
    definerRestrictedToTriggers: true,
    actualAuthPluginStartup: true,
    unauthenticatedRequestDenied: true,
    noMailWorkerOrListener: true,
  };
  writeFileSync(
    new URL(
      "../../../docs/etapa-0.9.1-activation-verification.json",
      import.meta.url,
    ),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} catch {
  console.error("AUTH_ACTIVATION_VERIFICATION_FAILED_NO_SECRETS_LOGGED");
  process.exitCode = 1;
} finally {
  await app?.close();
  await admin?.query("ROLLBACK").catch(() => {});
  await admin?.end();
  await Promise.all(connections.map((client) => client.disconnect()));
}
