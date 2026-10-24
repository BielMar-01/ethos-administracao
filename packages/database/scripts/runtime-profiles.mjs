// Pure SQL builder. Does not connect, create passwords or infer a production profile.
import { readFileSync } from "node:fs";
import { reviewedGrants } from "./business-activation-guards.mjs";
export const runtimeProfiles = [
  "auth-only",
  "business-0.10.1",
  "business-0.11-isolated",
];
const inner = (sql) =>
  sql.replace(/^BEGIN;\r?$/m, "").replace(/^COMMIT;\r?$/m, "");
export function runtimeProvisioningSql(profile) {
  if (!runtimeProfiles.includes(profile))
    throw Error("EXPLICIT_RUNTIME_PROFILE_REQUIRED");
  const auth = readFileSync(
    new URL("./prepare-auth-runtime.sql", import.meta.url),
    "utf8",
  );
  const business = readFileSync(
    new URL("./propose-business-runtime.sql", import.meta.url),
    "utf8",
  );
  reviewedGrants(business);
  const consistency = readFileSync(
    new URL("./propose-consistency-runtime.sql", import.meta.url),
    "utf8",
  );
  // Production profile remains unchanged. The new profile is restricted by a
  // database-side guard too; a SQL plan cannot silently activate it remotely.
  const isolatedGuard =
    profile === "business-0.11-isolated"
      ? `DO $$ BEGIN
    IF current_database() <> 'ethos_auth_test' OR inet_server_addr() IS NULL OR
      inet_server_addr()::text !~ '^(127\\.|172\\.|192\\.168\\.|10\\.)' THEN
      RAISE EXCEPTION 'ISOLATED_CONSISTENCY_PROFILE_REQUIRED';
    END IF;
  END $$;`
      : "";
  return `BEGIN;\n${isolatedGuard}\nSELECT set_config('ethos.provisioning_profile','${profile}',true);\n${inner(auth)}\n${profile !== "auth-only" ? inner(business) : ""}\n${profile === "business-0.11-isolated" ? inner(consistency) : ""}\nCOMMIT;\n`;
}
