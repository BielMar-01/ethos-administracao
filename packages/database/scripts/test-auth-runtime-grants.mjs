import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";

const url =
  process.env.ETHOS_AUTH_TEST_DATABASE_URL ??
  "postgresql://postgres:ethos-local-disposable@127.0.0.1:55439/ethos_auth_test";
const target = new URL(url);
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.pathname !== "/ethos_auth_test"
)
  throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
const admin = new pg.Client({ connectionString: url, ssl: false });
try {
  await admin.connect();
  const sql = readFileSync(
    new URL("./prepare-auth-runtime.sql", import.meta.url),
    "utf8",
  );
  await admin.query(sql);
  await admin.query(sql);
  const {
    rows: [rights],
  } = await admin.query(`SELECT
    has_table_privilege('ethos_auth_runtime','ethos_identity."AuthEvent"','INSERT') AS event_insert,
    has_table_privilege('ethos_auth_runtime','ethos_identity."AuthEvent"','UPDATE') AS event_update,
    has_table_privilege('ethos_auth_runtime','ethos_identity."AuthEvent"','DELETE') AS event_delete,
    has_table_privilege('ethos_tenant_runtime','ethos."User"','SELECT') AS global_read,
    has_table_privilege('ethos_tenant_runtime','ethos."Property"','INSERT') AS business_write,
    has_schema_privilege('ethos_tenant_runtime','ethos_identity','USAGE') AS identity_access`);
  assert.deepEqual(rights, {
    event_insert: true,
    event_update: false,
    event_delete: false,
    global_read: false,
    business_write: false,
    identity_access: false,
  });
  await admin.query("BEGIN");
  await admin.query("ALTER ROLE ethos_tenant_runtime BYPASSRLS");
  // Run the transactional SQL inside a savepoint, replacing only its outer BEGIN/COMMIT.
  await admin.query("SAVEPOINT unsafe_role");
  await assert.rejects(
    admin.query(sql.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "")),
    (error) => error.message === "UNSAFE_RESERVED_RUNTIME_ROLE",
  );
  await admin.query("ROLLBACK TO SAVEPOINT unsafe_role");
  await admin.query("ROLLBACK");
  console.log(
    JSON.stringify({
      isolated: true,
      idempotent: true,
      minimumGrants: true,
      unsafeRoleRejected: true,
    }),
  );
} catch {
  await admin.query("ROLLBACK").catch(() => {});
  console.error("RUNTIME_GRANTS_TEST_FAILED");
  process.exitCode = 1;
} finally {
  await admin.end();
}
