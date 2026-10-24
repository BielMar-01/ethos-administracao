import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { sha256 } from "../scripts/business-activation-guards.mjs";
test("access activation requires approval before source access and pins reviewed SQL", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/access-activation-plan.mjs",
      "apply",
      "--project=wszrtvgjcgpgntsssbhd",
    ],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('"stage":"guards"'));
  assert.equal(
    sha256(
      readFileSync(
        new URL(
          "../prisma/migrations/20261024000000_mutation_consistency/migration.sql",
          import.meta.url,
        ),
      ),
    ),
    "bcfe1a072f137f6bb10f8cebe39a000ff590b032826d1d97299838093eedfdf6",
  );
  assert.equal(
    sha256(
      readFileSync(
        new URL("../scripts/propose-consistency-runtime.sql", import.meta.url),
      ),
    ),
    "2ab9ea2e98a10b093df2f84523d5c4f4dd876d2097b2087d457621bbe8984c8f",
  );
});
