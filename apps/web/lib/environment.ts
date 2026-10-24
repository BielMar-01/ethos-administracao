export function webConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const stage = env.APP_ENV ?? "development";
  if (!["development", "staging", "production"].includes(stage))
    throw Error("WEB_CONFIGURATION_INVALID");
  const remote = stage !== "development";
  if (remote && env.NODE_ENV !== "production")
    throw Error("WEB_CONFIGURATION_INVALID");
  if (
    Object.keys(env).some((key) =>
      /^NEXT_PUBLIC_.*(SECRET|PASSWORD|TOKEN|DATABASE|ENCRYPTION)/i.test(key),
    )
  )
    throw Error("WEB_PRIVATE_VARIABLE_EXPOSED");
  // The BFF must never receive database or authentication signing credentials.
  if (
    env.DATABASE_URL ||
    env.DIRECT_DATABASE_URL ||
    env.AUTH_IDENTITY_DATABASE_URL ||
    env.AUTH_COOKIE_SECRET ||
    env.AUTH_ENCRYPTION_KEY
  )
    throw Error("WEB_SERVER_SCOPE_INVALID");
  const origin = (value: string | undefined, fallback: string) => {
    try {
      const url = new URL(value ?? (remote ? "" : fallback));
      if (
        url.origin !== (value ?? fallback) ||
        url.username ||
        url.password ||
        (remote
          ? url.protocol !== "https:"
          : !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) ||
        !["https:", "http:"].includes(url.protocol)
      )
        throw Error();
      return url.origin;
    } catch {
      throw Error("WEB_ORIGIN_INVALID");
    }
  };
  return {
    api: origin(env.ETHOS_API_ORIGIN, "http://127.0.0.1:3333"),
    web: origin(env.ETHOS_WEB_ORIGIN, "http://localhost:3000"),
  };
}
