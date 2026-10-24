const productionProject = "wszrtvgjcgpgntsssbhd";
const loopback = (host: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(host);
export function runtimeConfiguration(env: NodeJS.ProcessEnv) {
  const fail = (): never => {
    throw Error("RUNTIME_CONFIGURATION_INVALID");
  };
  const stage = env.APP_ENV ?? "development";
  if (!["development", "staging", "production"].includes(stage)) fail();
  const remote = stage !== "development";
  if (remote && env.NODE_ENV !== "production") fail();
  if (env.DIRECT_DATABASE_URL || env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
    fail();
  if (
    Object.keys(env).some((key) =>
      /^NEXT_PUBLIC_.*(SECRET|PASSWORD|TOKEN|DATABASE|ENCRYPTION)/i.test(key),
    )
  )
    fail();
  const origin = (value: string | undefined) => {
    try {
      const url = new URL(value ?? "");
      if (
        url.origin !== value ||
        url.username ||
        url.password ||
        (remote ? url.protocol !== "https:" : !loopback(url.hostname)) ||
        !["https:", "http:"].includes(url.protocol)
      )
        fail();
      return value!;
    } catch {
      return fail();
    }
  };
  const webOrigin = origin(env.WEB_ORIGIN);
  const cors = (env.CORS_ORIGINS ?? webOrigin)
    .split(",")
    .map((item) => origin(item.trim()));
  // A single BFF origin is intentional until additional origins are reviewed.
  if (cors.length !== 1 || cors[0] !== webOrigin) fail();
  const project = env.EXPECTED_DATABASE_PROJECT_REF;
  if (
    remote &&
    (!project ||
      !/^[a-z]{20}$/.test(project) ||
      (stage === "staging" && project === productionProject) ||
      (stage === "production" && project !== productionProject))
  )
    fail();
  let target: string | undefined;
  for (const [name, role] of [
    ["DATABASE_URL", "ethos_tenant_runtime"],
    ["AUTH_IDENTITY_DATABASE_URL", "ethos_auth_runtime"],
  ] as const) {
    try {
      const url = new URL(env[name] ?? "");
      const user = decodeURIComponent(url.username);
      if (
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        !url.password ||
        url.pathname === "/"
      )
        fail();
      if (remote) {
        const direct = url.hostname === `db.${project}.supabase.co`;
        const pooler =
          url.hostname.endsWith(".pooler.supabase.com") &&
          user === `${role}.${project}` &&
          url.port !== "6543";
        if (
          (!direct && !pooler) ||
          user !== (direct ? role : `${role}.${project}`) ||
          env.ETHOS_LOCAL_DATABASE === "1"
        )
          fail();
      } else if (
        !loopback(url.hostname) ||
        env.ETHOS_LOCAL_DATABASE !== "1" ||
        user !== role
      )
        fail();
      const address = `${url.hostname}:${url.port || "5432"}${url.pathname}`;
      if (target && target !== address) fail();
      target = address;
    } catch {
      fail();
    }
  }
  const integer = (
    value: string | undefined,
    fallback: number,
    max: number,
  ) => {
    const result = Number(value ?? fallback);
    if (!Number.isInteger(result) || result < 1 || result > max) fail();
    return result;
  };
  const host = env.API_HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "0.0.0.0", "::1", "::"].includes(host)) fail();
  if (env.TRUST_PROXY && env.TRUST_PROXY !== "false") fail();
  return {
    stage,
    host,
    port: integer(env.API_PORT ?? env.PORT, 3333, 65535),
    poolSize: integer(env.DATABASE_POOL_SIZE, 5, 20),
    cors,
    webOrigin,
  };
}
