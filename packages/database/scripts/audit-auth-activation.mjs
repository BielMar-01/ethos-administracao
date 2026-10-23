import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createDatabaseClient } from "../dist/index.js";
import pg from "pg";
import { poolConfiguration } from "../dist/settings.js";
import { supabaseTarget } from "./supabase-target.mjs";

config({ path: new URL("../.env", import.meta.url), quiet: true });
let database;
let stage = "target";
let transport;
try {
  const direct = new URL(process.env.DIRECT_DATABASE_URL);
  const runtime = new URL(process.env.DATABASE_URL);
  const derived =
    /^db\.([a-z0-9]+)\.supabase\.co$/.exec(direct.hostname)?.[1] ??
    decodeURIComponent(direct.username).split(".").slice(1).join(".");
  const { reference } = supabaseTarget(direct.toString(), derived);
  let sameProject = false;
  try {
    supabaseTarget(runtime.toString(), reference);
    sameProject = true;
  } catch {
    /* Invalid alternate URL is not a confirmed match. */
  }
  const expected = process.env.EXPECTED_SUPABASE_PROJECT_REF;
  if (expected && reference !== expected)
    throw new Error("DATABASE_PROJECT_MISMATCH");
  transport = new pg.Client(poolConfiguration(direct.toString(), 1));
  await transport.connect();
  const clientTls = {
    encrypted: transport.connection.stream.encrypted === true,
    authorized: transport.connection.stream.authorized === true,
  };
  await transport.end();
  transport = undefined;
  database = createDatabaseClient({
    connectionString: direct.toString(),
    maxConnections: 1,
  });
  const report = await database.prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    stage = "server";
    const [server] =
      await tx.$queryRawUnsafe(`SELECT current_database() AS database,
      current_setting('server_version') AS version,
      (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS backend_tls,
      r.rolsuper, r.rolbypassrls, r.rolcreaterole FROM pg_roles r WHERE rolname=current_user`);
    stage = "migrations";
    const migrations =
      await tx.$queryRawUnsafe(`SELECT migration_name, checksum,
      finished_at IS NOT NULL AS applied, rolled_back_at IS NOT NULL AS rolled_back
      FROM ethos_technical._prisma_migrations ORDER BY started_at`);
    const directory = new URL("../prisma/migrations/", import.meta.url);
    const local = readdirSync(directory)
      .filter((name) => /^\d+_/.test(name))
      .sort();
    const history = migrations.map(({ checksum, ...row }) => ({
      ...row,
      checksumMatches: row.rolled_back
        ? null
        : checksum ===
          createHash("sha256")
            .update(
              readFileSync(
                new URL(`${row.migration_name}/migration.sql`, directory),
              ),
            )
            .digest("hex"),
    }));
    stage = "tables";
    const tables =
      await tx.$queryRawUnsafe(`SELECT n.nspname AS schema, c.relname AS table,
      c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('ethos','ethos_identity') AND c.relkind='r' ORDER BY 1,2`);
    stage = "roles";
    const roles =
      await tx.$queryRawUnsafe(`SELECT rolname, rolcanlogin, rolsuper, rolbypassrls,
      rolcreaterole, rolcreatedb, rolreplication, rolinherit FROM pg_roles
      WHERE rolname IN ('ethos_auth_runtime','ethos_tenant_runtime') ORDER BY 1`);
    stage = "identity";
    const identity = await tx.$queryRawUnsafe(
      `SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='ethos_identity') AS exists`,
    );
    stage = "functions";
    const definers =
      await tx.$queryRawUnsafe(`SELECT n.nspname AS schema, p.proname AS function,
      p.prosecdef AS definer, p.proconfig AS settings, r.rolbypassrls AS owner_bypassrls,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname IN ('ethos','ethos_identity') ORDER BY 1,2`);
    stage = "catalog";
    const external =
      await tx.$queryRawUnsafe(`SELECT n.nspname,c.relname,c.relkind::text,c.oid::int
      FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
      WHERE n.nspname NOT IN ('pg_catalog','information_schema','ethos_technical','ethos','ethos_identity')
      AND n.nspname NOT LIKE 'pg_toast%' ORDER BY 1,2,3`);
    stage = "defaults";
    const defaultPrivileges =
      await tx.$queryRawUnsafe(`SELECT coalesce(n.nspname,'ALL_SCHEMAS') AS schema,
      d.defaclobjtype::text AS type, a.privilege_type AS privilege,
      CASE WHEN a.grantee=0 THEN 'PUBLIC' WHEN r.rolname IN ('anon','authenticated','service_role')
      THEN r.rolname ELSE 'OTHER_ROLE' END AS recipient
      FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
      WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname=current_user)`);
    // ACLs are checked without printing role names or provider-managed definitions.
    return {
      server,
      identitySchemaExists: identity[0].exists,
      migrations: history,
      pending: local.filter(
        (name) =>
          !history.some(
            (m) => m.migration_name === name && m.applied && !m.rolled_back,
          ),
      ),
      tables,
      roles,
      functions: definers,
      defaultPrivileges,
      protectedCatalog: {
        objects: external.length,
        sha256: createHash("sha256")
          .update(JSON.stringify(external))
          .digest("hex"),
      },
    };
  });
  console.log(
    JSON.stringify(
      {
        auditedAt: new Date().toISOString(),
        readOnly: true,
        clientTls,
        target: {
          host: direct.hostname,
          port: direct.port,
          projectFingerprint: createHash("sha256")
            .update(reference)
            .digest("hex"),
          configuredUrlsSameProject: sameProject,
          independentlyConfirmed: Boolean(expected),
        },
        ...report,
      },
      null,
      2,
    ),
  );
  if (
    report.migrations.some(
      (m) => !m.rolled_back && (!m.applied || !m.checksumMatches),
    )
  )
    process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      stage,
      code:
        typeof error?.code === "string"
          ? error.code
          : "ACTIVATION_AUDIT_FAILED",
      databaseCode: error?.meta?.code,
    }),
  );
  process.exitCode = 1;
} finally {
  await transport?.end();
  await database?.disconnect();
}
