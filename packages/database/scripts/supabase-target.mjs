/** No DNS/network or environment mutation. Project ref must be independently supplied. */
export function supabaseTarget(value, expected) {
  const url = new URL(value);
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(url.hostname);
  const session = url.hostname.endsWith(".pooler.supabase.com");
  const reference =
    direct?.[1] ??
    (session
      ? decodeURIComponent(url.username).split(".").slice(1).join(".")
      : "");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !expected ||
    reference !== expected ||
    (!direct && !session) ||
    (url.port || "5432") !== "5432" ||
    url.pathname !== "/postgres" ||
    (direct && decodeURIComponent(url.username).includes("."))
  )
    throw Error("CONFIRMED_SUPABASE_TARGET_REQUIRED");
  return { url, reference, direct: Boolean(direct) };
}
