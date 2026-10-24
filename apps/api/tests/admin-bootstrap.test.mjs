import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { bootstrapRequest } from "../dist/auth/admin-bootstrap.js";
import { authRuntime } from "../dist/auth/runtime.js";
test("bootstrap rejects unsafe role requests and requires approval before connection", () => {
  const request = {
    kind: "FIRST_SUPER_ADMIN",
    email: "fixture@example.invalid",
    displayName: "Fixture",
    password: "Isolated!Strong2026",
    reason: "Isolated validation only",
  };
  assert.equal(
    bootstrapRequest.safeParse({ ...request, password: "weak" }).success,
    false,
  );
  assert.equal(
    bootstrapRequest.safeParse({ ...request, role: "GESTOR" }).success,
    false,
  );
  assert.equal(
    bootstrapRequest.safeParse({
      ...request,
      kind: "ORGANIZATION_USER",
      role: "SUPER_ADMIN",
    }).success,
    false,
  );
  assert.equal(
    bootstrapRequest.safeParse({ ...request, reason: request.password })
      .success,
    false,
  );
  const result = spawnSync(
    process.execPath,
    ["scripts/bootstrap-access.mjs", "apply", "--project=wszrtvgjcgpgntsssbhd"],
    { cwd: new URL("../", import.meta.url), encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes("EXPLICIT_APPROVAL_REQUIRED"));
  assert.equal(result.stdout.includes(request.password), false);
});
test("current normal runtime refuses missing SMTP; no silent email-policy bypass", () => {
  assert.throws(
    () =>
      authRuntime({
        AUTH_IDENTITY_DATABASE_URL: "unused",
        DATABASE_URL: "unused",
        AUTH_COOKIE_SECRET: "x".repeat(32),
        AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
        WEB_ORIGIN: "http://localhost:3000",
      }),
    /AUTH_CONFIGURATION_REQUIRED/,
  );
});
