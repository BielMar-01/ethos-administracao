import { webConfiguration } from "./environment";
export const apiOrigin = () => webConfiguration().api;
export const webOrigin = () => webConfiguration().web;
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
