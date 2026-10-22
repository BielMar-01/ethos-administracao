export function apiOrigin() {
  const origin = process.env.ETHOS_API_ORIGIN ?? "http://127.0.0.1:3333";
  const parsed = new URL(origin);
  if (
    parsed.origin !== origin ||
    parsed.username ||
    parsed.password ||
    (!["127.0.0.1", "localhost"].includes(parsed.hostname) &&
      parsed.protocol !== "https:")
  )
    throw new Error("INVALID_API_ORIGIN");
  return origin;
}
export const webOrigin = () =>
  process.env.ETHOS_WEB_ORIGIN ?? "http://localhost:3000";
const names = new Set([
  "ethos_access",
  "ethos_refresh",
  "ethos_csrf",
  "__Host-ethos_access",
  "__Host-ethos_refresh",
  "__Host-ethos_csrf",
]);
export const authCookies = (cookie: string) =>
  cookie
    .split(";")
    .map((s) => s.trim())
    .filter((s) => names.has(s.split("=")[0]))
    .join("; ");
export function patchCookies(cookie: string, changes: string[]) {
  const jar = new Map(
    cookie
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => [s.slice(0, s.indexOf("=")), s.slice(s.indexOf("=") + 1)]),
  );
  for (const change of changes) {
    const pair = change.split(";")[0],
      equals = pair.indexOf("=");
    jar.set(pair.slice(0, equals), pair.slice(equals + 1));
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}
export const apiFetch = (
  path: string,
  cookie: string,
  options: RequestInit = {},
) =>
  fetch(`${apiOrigin()}/api/v1/auth${path}`, {
    ...options,
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: { cookie: authCookies(cookie), ...options.headers },
  });
