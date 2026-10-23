// Read-only review: no DDL, role changes, migrations or data exports.
import { config } from "dotenv";
import { resolve4, resolve6 } from "node:dns/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import { poolConfiguration } from "../dist/settings.js";

config({ path: new URL("../.env", import.meta.url), quiet: true });
let client;
try {
  const url = new URL(process.env.DIRECT_DATABASE_URL);
  const [role, reference] = decodeURIComponent(url.username).split(".");
  if (
    !reference ||
    !url.hostname.endsWith(".pooler.supabase.com") ||
    url.port !== "5432"
  )
    throw Error("UNEXPECTED_REVIEW_TARGET");
  client = new pg.Client(poolConfiguration(url.toString(), 1));
  await client.connect();
  const clientTls = {
    encrypted: client.connection.stream.encrypted === true,
    authorized: client.connection.stream.authorized === true,
  };
  await client.query("BEGIN READ ONLY");
  const server = (
    await client.query(`SELECT current_setting('server_version') AS version,
    current_setting('ssl') AS ssl_supported, current_setting('createrole_self_grant') AS createrole_self_grant,
    s.ssl AS upstream_tls, s.version AS upstream_tls_version,
    inet_client_addr() <<= '10.0.0.0/8'::inet OR inet_client_addr() <<= '172.16.0.0/12'::inet
      OR inet_client_addr() <<= '192.168.0.0/16'::inet AS backend_peer_private_ipv4
    FROM pg_stat_ssl s WHERE pid=pg_backend_pid()`)
  ).rows[0];
  const privileges = (
    await client.query(`SELECT rolsuper,rolcreaterole,rolbypassrls,rolcreatedb,
    has_database_privilege(current_user,current_database(),'CREATE') AS create_schema,
    has_database_privilege(current_user,current_database(),'CONNECT') AS connect
    FROM pg_roles WHERE rolname=current_user`)
  ).rows[0];
  const tables = (
    await client.query(`SELECT n.nspname AS schema,c.relname AS table,
    c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS owned,
    has_table_privilege(current_user,c.oid,'SELECT') AS can_dump,
    c.relrowsecurity AS rls,c.relforcerowsecurity AS forced
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('ethos','ethos_technical') AND c.relkind='r' ORDER BY 1,2`)
  ).rows;
  const schemas = (
    await client.query(`SELECT nspname,
    nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS owned,
    has_schema_privilege(current_user,oid,'USAGE') AS usage
    FROM pg_namespace WHERE nspname IN ('ethos','ethos_technical') ORDER BY 1`)
  ).rows;
  const policies = (
    await client.query(`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    FROM pg_policies WHERE schemaname='ethos' ORDER BY tablename,policyname`)
  ).rows;
  const roleNamesAbsent =
    (
      await client.query(`SELECT count(*)::int AS count FROM pg_roles
    WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime')`)
    ).rows[0].count === 0;
  const events = (
    await client.query(
      `SELECT count(*)::int AS enabled FROM pg_event_trigger WHERE evtenabled<>'D'`,
    )
  ).rows[0];
  const history = (
    await client.query(`SELECT migration_name,finished_at IS NOT NULL AS applied,
    rolled_back_at IS NOT NULL AS rolled_back FROM ethos_technical._prisma_migrations ORDER BY started_at`)
  ).rows;
  await client.query("ROLLBACK");
  await client.end();
  client = undefined;
  const hostname = `db.${reference}.supabase.co`;
  const dns = await Promise.allSettled([
    resolve4(hostname),
    resolve6(hostname),
  ]);
  const addresses = dns.map((result) =>
    result.status === "fulfilled"
      ? { count: result.value.length }
      : { count: 0, code: result.reason.code },
  );
  const direct = new URL(url);
  direct.hostname = hostname;
  direct.username = role;
  direct.search = "";
  let directProbe;
  const probe = new pg.Client({
    ...poolConfiguration(direct.toString(), 1),
    connectionTimeoutMillis: 6000,
  });
  try {
    await probe.connect();
    const ssl = (
      await probe.query(
        "SELECT ssl,version,cipher FROM pg_stat_ssl WHERE pid=pg_backend_pid()",
      )
    ).rows[0];
    directProbe = {
      connected: true,
      clientEncrypted: probe.connection.stream.encrypted === true,
      certificateAuthorized: probe.connection.stream.authorized === true,
      backend: ssl,
    };
  } catch (error) {
    directProbe = {
      connected: false,
      code:
        typeof error.code === "string"
          ? error.code
          : "DIRECT_CONNECTION_FAILED",
    };
  } finally {
    await probe.end().catch(() => {});
  }
  console.log(
    JSON.stringify(
      {
        reviewedAt: new Date().toISOString(),
        readOnly: true,
        projectFingerprint: createHash("sha256")
          .update(reference)
          .digest("hex"),
        clientTls,
        server,
        privileges,
        tables,
        schemas,
        policies,
        runtimeRolesAbsent: roleNamesAbsent,
        enabledEventTriggers: events.enabled,
        history,
        directDns: { ipv4: addresses[0], ipv6: addresses[1] },
        directProbe,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      failed: true,
      code:
        typeof error.code === "string" ? error.code : "READ_ONLY_REVIEW_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await client?.end();
}
