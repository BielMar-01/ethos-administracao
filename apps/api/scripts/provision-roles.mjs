// Explicit administrative command, never invoked by API startup/public signup.
import "dotenv/config";
import { createDatabaseClient } from "@ethos/database";
import { provisionRoles } from "../dist/auth/provisioning.js";
const [organizationId, membershipId] = process.argv.slice(2);
if (
  !/^[0-9a-f-]{36}$/i.test(organizationId ?? "") ||
  (membershipId && !/^[0-9a-f-]{36}$/i.test(membershipId))
)
  throw Error(
    "USAGE: provision-roles <organization UUID> [admin membership UUID]",
  );
if (!process.env.DIRECT_DATABASE_URL)
  throw Error("ADMINISTRATIVE_URL_REQUIRED");
const database = createDatabaseClient({
  connectionString: process.env.DIRECT_DATABASE_URL,
});
try {
  await provisionRoles(database.prisma, organizationId, membershipId);
  console.log("RBAC_PROVISIONED");
} catch {
  console.error("RBAC_PROVISION_FAILED");
  process.exitCode = 1;
} finally {
  await database.disconnect();
}
