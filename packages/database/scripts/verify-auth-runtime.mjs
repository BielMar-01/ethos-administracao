import assert from "node:assert/strict";
import { config } from "dotenv";
import { createDatabaseClient } from "../dist/index.js";

const local = process.argv.includes("--local-test");
const values = {};
if (local) {
  values.AUTH_IDENTITY_DATABASE_URL =
    "postgresql://ethos_auth_runtime:ethos-runtime-test-only@127.0.0.1:55439/ethos_auth_test";
  values.DATABASE_URL =
    "postgresql://ethos_tenant_runtime:ethos-tenant-test-only@127.0.0.1:55439/ethos_auth_test";
} else {
  config({
    path: new URL("../../../.secrets/auth-runtime.env", import.meta.url),
    processEnv: values,
    quiet: true,
  });
}
const clients = [];
try {
  for (const [key, role] of [
    ["AUTH_IDENTITY_DATABASE_URL", "ethos_auth_runtime"],
    ["DATABASE_URL", "ethos_tenant_runtime"],
  ]) {
    const database = createDatabaseClient({
      connectionString: values[key],
      maxConnections: 1,
      allowLocalPlaintext: local,
    });
    clients.push(database);
    const [identity] = await database.prisma
      .$queryRawUnsafe(`SELECT current_user::text AS name,
      current_user=session_user AS genuine_login, NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit)
      AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid)
      AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=pg_roles.oid)
      AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=pg_roles.oid)
      AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE proowner=pg_roles.oid)
      AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datdba=pg_roles.oid) AS safe
      FROM pg_roles WHERE rolname=current_user`);
    assert.equal(identity.name, role);
    assert.equal(identity.genuine_login, true);
    assert.equal(identity.safe, true);
  }
  const identity = clients[0].prisma,
    tenant = clients[1].prisma;
  await identity.authSession.count();
  const [rights] = await identity.$queryRawUnsafe(`SELECT
    has_table_privilege(current_user,'ethos_identity."AuthEvent"','INSERT') AS append,
    has_table_privilege(current_user,'ethos_identity."AuthEvent"','UPDATE') AS update,
    has_table_privilege(current_user,'ethos."Property"','INSERT') AS business_write`);
  assert.deepEqual(rights, {
    append: true,
    update: false,
    business_write: false,
  });
  assert.equal(await tenant.property.count(), 0);
  assert.equal(await tenant.organization.count(), 0);
  await tenant.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$queryRawUnsafe(
      "SELECT set_config('ethos.organization_id','invalid-context',true)",
    );
    assert.equal(await tx.property.count(), 0);
  });
  const [context] = await tenant.$queryRawUnsafe(
    "SELECT nullif(current_setting('ethos.organization_id',true),'') AS organization",
  );
  assert.equal(context.organization, null);
  const [denied] = await tenant.$queryRawUnsafe(`SELECT
    has_schema_privilege(current_user,'ethos_identity','USAGE') AS identity,
    has_table_privilege(current_user,'ethos."User"','SELECT') AS global_identity,
    has_table_privilege(current_user,'ethos."Property"','INSERT') AS business_write`);
  assert.deepEqual(denied, {
    identity: false,
    global_identity: false,
    business_write: false,
  });
  console.log(
    JSON.stringify({
      isolated: local,
      genuineRuntimeLogins: true,
      minimumPrivileges: true,
      noOrganizationDenied: true,
      invalidOrganizationDenied: true,
      transactionContextCleared: true,
      personalDataPrinted: false,
      persistentWrites: false,
    }),
  );
} catch {
  console.error("RUNTIME_VERIFICATION_FAILED_NO_SECRETS_LOGGED");
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map((client) => client.disconnect()));
}
