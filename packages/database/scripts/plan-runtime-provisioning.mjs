// Produces reviewable SQL only. Execution against production needs separate approval.
import { runtimeProvisioningSql } from "./runtime-profiles.mjs";
try {
  process.stdout.write(runtimeProvisioningSql(process.argv[2]));
} catch {
  console.error("EXPLICIT_RUNTIME_PROFILE_REQUIRED");
  process.exitCode = 1;
}
