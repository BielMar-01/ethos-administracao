import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  approvalGuard,
  reviewedGrants,
  approvedSha256,
  sha256,
} from "../scripts/business-activation-guards.mjs";
test("activation requires approval and pins the exact reviewed SQL bytes", () => {
  assert.throws(() => approvalGuard("apply", []), /EXPLICIT_APPROVAL_REQUIRED/);
  approvalGuard("apply", ["--approved"]);
  const sql = readFileSync(
    new URL("../scripts/propose-business-runtime.sql", import.meta.url),
    "utf8",
  );
  assert.equal(sha256(sql), approvedSha256);
  assert.equal(reviewedGrants(sql).length, 44);
  assert.throws(
    () =>
      reviewedGrants(
        sql + '\nGRANT DELETE ON ethos."Owner" TO ethos_tenant_runtime;',
      ),
    /APPROVED_SQL_HASH_MISMATCH/,
  );
});
