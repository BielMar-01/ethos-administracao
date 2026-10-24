import test from "node:test";
import assert from "node:assert/strict";
import { securityFixture } from "./helpers/security-fixtures.mjs";
import { checkRuntimeSchema } from "../dist/readiness.js";
import { buildApp } from "../dist/app.js";
import { spawn } from "node:child_process";
test("runtime schema gate and readiness use restricted connections", async () => {
  const f = await securityFixture();
  try {
    assert.equal((await f.app.inject("/api/v1/health/ready")).statusCode, 200);
    // An administrative credential must never pass the runtime safety gate.
    await assert.rejects(
      checkRuntimeSchema({ identity: f.admin, tenant: f.admin }),
    );
  } finally {
    await f.close();
  }
});
test("incompatible schema blocks startup and query; disposable table name is restored", async () => {
  const f = await securityFixture();
  let candidate;
  try {
    await f.admin.$executeRawUnsafe(
      'ALTER TABLE ethos_technical."MutationReceipt" RENAME TO "MutationReceipt_012_probe"',
    );
    await assert.rejects(checkRuntimeSchema(f.auth.dependencies));
    candidate = await buildApp({ auth: f.auth.dependencies, logger: false });
    await assert.rejects(candidate.ready());
  } finally {
    await candidate?.close();
    await f.admin.$executeRawUnsafe(
      'ALTER TABLE ethos_technical."MutationReceipt_012_probe" RENAME TO "MutationReceipt"',
    );
    await f.close();
  }
});
test(
  "normal server starts locally and drains on SIGTERM without external SMTP",
  {
    skip:
      process.platform === "win32"
        ? "Windows uses process termination, POSIX SIGTERM validated in CI/Linux"
        : false,
  },
  async () => {
    const env = {
      ...process.env,
      APP_ENV: "development",
      NODE_ENV: "development",
      API_HOST: "127.0.0.1",
      API_PORT: "3341",
      ETHOS_LOCAL_DATABASE: "1",
      DATABASE_URL:
        "postgresql://ethos_tenant_runtime:ethos-tenant-test-only@127.0.0.1:55439/ethos_auth_test",
      AUTH_IDENTITY_DATABASE_URL:
        "postgresql://ethos_auth_runtime:ethos-runtime-test-only@127.0.0.1:55439/ethos_auth_test",
      AUTH_COOKIE_SECRET: "isolated-runtime-test-cookie-secret-012",
      AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 12).toString("base64"),
      WEB_ORIGIN: "http://localhost:3000",
      CORS_ORIGINS: "http://localhost:3000",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "587",
      SMTP_FROM: "fixture@example.invalid",
      DOTENV_CONFIG_PATH: "/tmp/ethos-nonexistent-env",
    };
    delete env.DIRECT_DATABASE_URL;
    const child = spawn(process.execPath, ["dist/server.js"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (bytes) => {
      log += bytes;
    });
    child.stderr.on("data", (bytes) => {
      log += bytes;
    });
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          ready = (await fetch("http://127.0.0.1:3341/api/v1/health/ready")).ok;
        } catch {
          /* wait */
        }
        if (ready || child.exitCode !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(ready, true, "normal runtime must reach readiness");
      const exited = new Promise((resolve) =>
        child.once("exit", (code) => resolve(code)),
      );
      child.kill("SIGTERM");
      assert.equal(
        await Promise.race([
          exited,
          new Promise((_, reject) =>
            setTimeout(() => reject(Error("SHUTDOWN_TIMEOUT")), 8000).unref(),
          ),
        ]),
        0,
      );
      assert.ok(log.includes("API_DRAINING"));
      assert.ok(log.includes("API_STOPPED"));
      assert.equal(log.includes(env.AUTH_COOKIE_SECRET), false);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  },
);
