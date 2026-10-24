import test from "node:test";
import assert from "node:assert/strict";
import { runtimeProvisioningSql } from "../scripts/runtime-profiles.mjs";
test("reconciliation requires an explicit reviewed profile and one atomic transaction", () => {
  for (const value of [undefined, "", "auto", "business';GRANT ALL"])
    assert.throws(
      () => runtimeProvisioningSql(value),
      /EXPLICIT_RUNTIME_PROFILE_REQUIRED/,
    );
  const sql = runtimeProvisioningSql("business-0.10.1");
  assert.equal((sql.match(/^BEGIN;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
  assert.match(sql, /EXPLICIT_BUSINESS_PROFILE_REQUIRED/);
  assert.match(sql, /GRANT UPDATE \("name"\) ON ethos\."Organization"/);
});
