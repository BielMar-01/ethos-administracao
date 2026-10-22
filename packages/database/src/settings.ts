import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PoolConfig } from "pg";

export const databaseSchema = "ethos_technical";
export const caFile = fileURLToPath(
  new URL("../certs/supabase-ca.crt", import.meta.url),
);

function connectionUrl(value: string | undefined, name: string): URL {
  if (!value) throw new Error(`${name} não definida.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} inválida; informe uma URL PostgreSQL.`);
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.pathname.slice(1)
  )
    throw new Error(`${name} inválida; informe servidor, usuário e banco.`);
  return url;
}

export function migrationUrl(environment: NodeJS.ProcessEnv): string {
  const url = connectionUrl(
    environment.DIRECT_DATABASE_URL,
    "DIRECT_DATABASE_URL",
  );
  if (url.hostname.includes(".pooler.supabase.com") && url.port === "6543")
    throw new Error(
      "Migrations exigem conexão direta ou pooler de sessão na porta 5432.",
    );
  url.searchParams.set("schema", databaseSchema);
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("sslaccept", "strict");
  url.searchParams.set("sslcert", caFile.replaceAll("\\", "/"));
  url.searchParams.set("connect_timeout", "10");
  if (environment.ETHOS_LOCAL_DATABASE === "1") {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      throw new Error("LOCAL_DATABASE_MUST_USE_LOOPBACK");
    url.searchParams.set("sslmode", "disable");
    url.searchParams.delete("sslaccept");
    url.searchParams.delete("sslcert");
  }
  return url.toString();
}

export function poolConfiguration(
  value: string | undefined,
  maxConnections = 5,
  allowLocalPlaintext = false,
): PoolConfig {
  const url = connectionUrl(value, "DATABASE_URL");
  if (
    allowLocalPlaintext &&
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    throw new Error("LOCAL_DATABASE_MUST_USE_LOOPBACK");
  if (
    !Number.isInteger(maxConnections) ||
    maxConnections < 1 ||
    maxConnections > 20
  )
    throw new Error("O pool deve conter de 1 a 20 conexões.");
  // Driver SSL is configured separately: URI flags must not override the trusted CA.
  for (const key of [
    "sslmode",
    "sslcert",
    "sslrootcert",
    "sslkey",
    "sslpassword",
    "sslaccept",
    "ssl",
    "uselibpqcompat",
  ])
    url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    // Only an explicitly loopback database may use plaintext for disposable local tests.
    ssl: allowLocalPlaintext
      ? false
      : { ca: readFileSync(caFile, "utf8"), rejectUnauthorized: true },
    max: maxConnections,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
    application_name: "ethos-database",
    allowExitOnIdle: true,
  };
}
