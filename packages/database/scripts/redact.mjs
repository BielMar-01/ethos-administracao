export function redact(output, environment = process.env) {
  let safe = output.replace(
    /postgres(?:ql)?:\/\/[^\s"'<>]+/gi,
    "[URL_POSTGRESQL_OCULTA]",
  );
  for (const key of ["DATABASE_URL", "DIRECT_DATABASE_URL"]) {
    try {
      const url = new URL(environment[key]);
      for (const secret of [
        url.password,
        decodeURIComponent(url.password),
        url.username,
        decodeURIComponent(url.username),
      ]) {
        if (secret) safe = safe.split(secret).join("[OCULTO]");
      }
    } catch {
      /* Invalid URLs are never included in configuration errors. */
    }
  }
  return safe;
}
