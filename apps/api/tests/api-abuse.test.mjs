import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
test("API limits malformed input and uses server correlation without logging secrets", async () => {
  const logs = [];
  const app = await buildApp({ logStream: { write: (m) => logs.push(m) } });
  try {
    const response = await app.inject({
      url: "/health?token=DO_NOT_LOG_QUERY",
      headers: {
        "x-request-id": "UNTRUSTED_CORRELATION",
        cookie: "token=DO_NOT_LOG_COOKIE",
        authorization: "Bearer DO_NOT_LOG_AUTH",
      },
    });
    assert.match(response.headers["x-request-id"], /^[a-f0-9-]{36}$/);
    assert.notEqual(response.headers["x-request-id"], "UNTRUSTED_CORRELATION");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    const denied = await app.inject({
      url: "/health",
      headers: { origin: "https://untrusted.invalid" },
    });
    assert.notEqual(
      denied.headers["access-control-allow-origin"],
      "https://untrusted.invalid",
    );
    const malformed = await app.inject({
      url: "/api/v1/auth/login",
      method: "POST",
      headers: { "content-type": "application/json" },
      payload: "{",
    });
    assert.equal(malformed.statusCode, 400);
    const huge = await app.inject({
      url: "/api/v1/auth/login",
      method: "POST",
      payload: { data: "x".repeat(70000) },
    });
    assert.equal(huge.statusCode, 413);
    const all = logs.join("");
    for (const marker of [
      "DO_NOT_LOG_QUERY",
      "DO_NOT_LOG_COOKIE",
      "DO_NOT_LOG_AUTH",
      "UNTRUSTED_CORRELATION",
    ])
      assert.equal(all.includes(marker), false, marker);
  } finally {
    await app.close();
  }
});

test("production does not expose Swagger UI or its JSON route", async () => {
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const app = await buildApp({ logger: false });
  try {
    for (const url of ["/docs", "/docs/json", "/docs/yaml"])
      assert.equal((await app.inject({ url })).statusCode, 404);
  } finally {
    await app.close();
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  }
});
