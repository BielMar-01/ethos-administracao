import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { readinessProbe } from "../dist/readiness.js";
test("liveness survives unavailable dependency; readiness is generic and uncached", async () => {
  const app = await buildApp({ logger: false });
  try {
    assert.equal((await app.inject("/api/v1/health")).statusCode, 200);
    const response = await app.inject("/api/v1/health/ready");
    assert.equal(response.statusCode, 503);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.body.includes("postgres"), false);
  } finally {
    await app.close();
  }
});
test("readiness bounds concurrent probes during dependency outage", async () => {
  let calls = 0,
    release;
  const probe = readinessProbe(() => {
    calls++;
    return new Promise((resolve) => {
      release = resolve;
    });
  }, 20);
  assert.deepEqual(await Promise.all([probe(), probe()]), [false, false]);
  assert.equal(await probe(), false);
  assert.equal(calls, 1);
  release();
});
