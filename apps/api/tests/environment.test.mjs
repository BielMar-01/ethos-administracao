import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runtimeConfiguration } from "../dist/config.js";
const local = {
  APP_ENV: "development",
  WEB_ORIGIN: "http://localhost:3000",
  ETHOS_LOCAL_DATABASE: "1",
  DATABASE_URL:
    "postgresql://ethos_tenant_runtime:fixture@127.0.0.1:55439/ethos_auth_test",
  AUTH_IDENTITY_DATABASE_URL:
    "postgresql://ethos_auth_runtime:fixture@127.0.0.1:55439/ethos_auth_test",
};
test("normal server refuses invalid configuration before network and omits sensitive values", () => {
  const sentinel = "isolated-sensitive-sentinel-never-log";
  const result = spawnSync(process.execPath, ["dist/server.js"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    timeout: 5000,
    env: {
      ...process.env,
      DOTENV_CONFIG_PATH: "nonexistent-isolated-env",
      APP_ENV: "staging",
      WEB_ORIGIN: "",
      AUTH_COOKIE_SECRET: sentinel,
    },
  });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes("API_START_FAILED"));
  assert.equal((result.stdout + result.stderr).includes(sentinel), false);
});
test("runtime refuses missing config, remote development, admin credentials and mixed databases", () => {
  assert.equal(runtimeConfiguration(local).poolSize, 5);
  for (const patch of [
    { WEB_ORIGIN: undefined },
    { APP_ENV: "unknown" },
    { DIRECT_DATABASE_URL: "forbidden" },
    { TRUST_PROXY: "true" },
    { DATABASE_POOL_SIZE: "0" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    {
      DATABASE_URL: local.DATABASE_URL.replace(
        "127.0.0.1",
        "db.example.invalid",
      ),
    },
    {
      DATABASE_URL: local.DATABASE_URL.replace(
        "ethos_tenant_runtime",
        "postgres",
      ),
    },
    { DATABASE_URL: local.DATABASE_URL.replace("ethos_auth_test", "other") },
    { CORS_ORIGINS: "https://attacker.invalid" },
  ])
    assert.throws(
      () => runtimeConfiguration({ ...local, ...patch }),
      /CONFIGURATION_INVALID/,
    );
});
test("staging needs independent project, TLS origins and restricted roles", () => {
  const project = "abcdefghijklmnopqrst";
  const stage = {
    ...local,
    APP_ENV: "staging",
    NODE_ENV: "production",
    ETHOS_LOCAL_DATABASE: "0",
    WEB_ORIGIN: "https://staging.example.invalid",
    EXPECTED_DATABASE_PROJECT_REF: project,
    DATABASE_URL: `postgresql://ethos_tenant_runtime:fixture@db.${project}.supabase.co:5432/postgres`,
    AUTH_IDENTITY_DATABASE_URL: `postgresql://ethos_auth_runtime:fixture@db.${project}.supabase.co:5432/postgres`,
  };
  assert.equal(runtimeConfiguration(stage).stage, "staging");
  for (const patch of [
    { NODE_ENV: "development" },
    { EXPECTED_DATABASE_PROJECT_REF: undefined },
    { EXPECTED_DATABASE_PROJECT_REF: "wszrtvgjcgpgntsssbhd" },
    { ETHOS_LOCAL_DATABASE: "1" },
  ])
    assert.throws(() => runtimeConfiguration({ ...stage, ...patch }));
});
