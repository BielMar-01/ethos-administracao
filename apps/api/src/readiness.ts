import type { AuthDependencies } from "./auth/types.js";
export async function checkRuntimeSchema(deps: AuthDependencies) {
  // No migration-history privilege and no administrative connection in the server.
  await deps.identity
    .$queryRaw`SELECT 1 FROM ethos_identity."AuthCredential" LIMIT 0`;
  await deps.tenant
    .$queryRaw`SELECT "organizationId",resource,"recordId",revision FROM ethos_technical."ResourceRevision" LIMIT 0`;
  await deps.tenant
    .$queryRaw`SELECT "organizationId","membershipId",operation,"keyHash","inputHash",resource,"recordId","createdAt" FROM ethos_technical."MutationReceipt" LIMIT 0`;
  const flags = await deps.tenant.$queryRaw<Array<{ safe: boolean }>>`
    SELECT NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication) AS safe
    FROM pg_roles WHERE rolname = current_user`;
  const tables = await deps.tenant.$queryRaw<Array<{ safe: boolean }>>`
    SELECT count(*) = 44 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity) AS safe
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname IN ('ethos','ethos_identity') AND c.relkind='r') OR
      (n.nspname='ethos_technical' AND c.relname IN ('ResourceRevision','MutationReceipt'))`;
  const identityFlags = await deps.identity.$queryRaw<Array<{ safe: boolean }>>`
    SELECT NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication) AS safe
    FROM pg_roles WHERE rolname = current_user`;
  if (!flags[0]?.safe || !identityFlags[0]?.safe || !tables[0]?.safe)
    throw Error("RUNTIME_SCHEMA_UNSAFE");
}
export function readinessProbe(check: () => Promise<void>, timeout = 4000) {
  let pending: Promise<boolean> | undefined;
  let last = 0;
  let result = false;
  return () => {
    if (pending) return pending;
    if (Date.now() - last < 1000) return Promise.resolve(result);
    let timer: ReturnType<typeof setTimeout>;
    const work = check().then(
      () => true,
      () => false,
    );
    pending = Promise.race([
      work,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeout);
      }),
    ]).then((ok) => {
      result = ok;
      last = Date.now();
      return ok;
    });
    // Keep one actual query in flight even after the HTTP deadline expires.
    void work.finally(() => {
      clearTimeout(timer);
      pending = undefined;
    });
    return pending;
  };
}
