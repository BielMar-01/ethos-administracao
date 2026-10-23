import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = new URL("../scripts/auth-activation.mjs", import.meta.url);
function run(args, environment) {
  return spawnSync(process.execPath, [fileURLToPath(script), ...args], {
    env: { ...process.env, ...environment },
    encoding: "utf8",
    timeout: 10000,
  });
}
test("activation refuses missing approval before any connection", () => {
  const result = run(["deploy"], {
    DIRECT_DATABASE_URL: "invalid-secret-that-must-not-be-logged",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /EXPLICIT_APPROVAL_REQUIRED/);
  assert.doesNotMatch(result.stderr, /invalid-secret/);
});
test("activation rejects a project different from the independent reference", () => {
  const result = run(["grants", "--approved"], {
    DIRECT_DATABASE_URL:
      "postgresql://postgres.project-a:sentinel-secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    EXPECTED_SUPABASE_PROJECT_REF: "project-b",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CONFIRMED_SUPABASE_TARGET_REQUIRED/);
  assert.doesNotMatch(result.stderr, /sentinel-secret|postgresql:/);
});
test("activation refuses loopback and transaction-pooler destinations", () => {
  for (const host of [
    "127.0.0.1:5432",
    "aws-0-us-east-1.pooler.supabase.com:6543",
  ]) {
    const result = run(["credentials", "--approved"], {
      DIRECT_DATABASE_URL: `postgresql://postgres.project:sentinel-secret@${host}/postgres`,
      EXPECTED_SUPABASE_PROJECT_REF: "project",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CONFIRMED_SUPABASE_TARGET_REQUIRED/);
    assert.doesNotMatch(result.stderr, /sentinel-secret|postgresql:/);
  }
});
