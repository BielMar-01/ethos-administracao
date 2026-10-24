import { createHash } from "node:crypto";
export const approvedProject = "wszrtvgjcgpgntsssbhd";
export const approvedSha256 =
  "bf190ef6241b9be22ac68690db53ab272f1b88c5d24a334937523d2350a6aae0";
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export function reviewedGrants(sql) {
  if (sha256(sql) !== approvedSha256) throw Error("APPROVED_SQL_HASH_MISMATCH");
  const grants = [
    ...sql.matchAll(
      /GRANT (INSERT|UPDATE) \(([^)]+)\) ON ethos\."(\w+)" TO ethos_tenant_runtime;/g,
    ),
  ].map((m) => ({
    privilege: m[1],
    table: m[3],
    columns: m[2].split(", ").map((c) => c.slice(1, -1)),
  }));
  if (grants.length !== 44) throw Error("APPROVED_GRANTS_CHANGED");
  return grants;
}
export function approvalGuard(mode, args) {
  if (!["preflight", "apply", "verify"].includes(mode))
    throw Error("INVALID_ACTIVATION_MODE");
  if (mode === "apply" && !args.includes("--approved"))
    throw Error("EXPLICIT_APPROVAL_REQUIRED");
}
