import test from "node:test";
import assert from "node:assert/strict";
import { inputSchema, listQuery, decimal } from "@ethos/contracts";
import { businessRequest, ApiFault } from "../lib/business-client.ts";
import { display, documentFields } from "../lib/business-view.ts";
test("business contracts preserve decimal strings and reject protected client fields", () => {
  assert.equal(decimal.parse("1234567890123456.78"), "1234567890123456.78");
  assert.equal(decimal.safeParse(12.34).success, false);
  assert.equal(decimal.safeParse("12.345").success, false);
  assert.equal(
    inputSchema("owners").safeParse({
      name: "Fixture",
      kind: "INDIVIDUAL",
      organizationId: "00000000-0000-4000-8000-000000000000",
    }).success,
    false,
  );
  assert.equal(
    inputSchema("leases", true).safeParse({ baseRent: "1.00" }).success,
    false,
  );
  assert.equal(listQuery.safeParse({ pageSize: 101 }).success, false);
  assert.equal(listQuery.parse({}).pageSize, 20);
  assert.equal(documentFields.units, "unitId");
  assert.equal(display({ text: "Laudo preservado" }), "Laudo preservado");
});
test("typed HTTP client sends session-context expectation and a CSRF challenge", async () => {
  const original = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return new Response(
      JSON.stringify(
        url === "/api/auth/csrf"
          ? { csrfToken: "challenge" }
          : { success: true, data: { id: "created" } },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const result = await businessRequest("owners", "org-fixture", {
      method: "POST",
      body: { name: "Fixture" },
    });
    assert.equal(result.data.id, "created");
    assert.equal(calls[1].options.headers["x-ethos-context"], "org-fixture");
    assert.equal(calls[1].options.headers["x-csrf-token"], "challenge");
    assert.equal(calls[1].options.cache, "no-store");
    assert.match(
      calls[1].options.headers["idempotency-key"],
      /^[a-f0-9-]{36}$/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("expired access refreshes once preserving mutation identity and revision", async () => {
  const original = globalThis.fetch,
    mutations = [];
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/auth/csrf")
      return new Response(JSON.stringify({ csrfToken: "challenge" }));
    if (url === "/api/auth/refresh")
      return new Response(JSON.stringify({ success: true }));
    mutations.push(options);
    return new Response(
      JSON.stringify(
        mutations.length === 1
          ? { error: { code: "EXPIRED" } }
          : { success: true },
      ),
      { status: mutations.length === 1 ? 401 : 200 },
    );
  };
  try {
    await businessRequest("owners/id", "org", {
      method: "PATCH",
      body: { name: "Edit" },
      ifMatch: '"revision"',
    });
    assert.equal(mutations.length, 2);
    assert.equal(
      mutations[0].headers["idempotency-key"],
      mutations[1].headers["idempotency-key"],
    );
    assert.equal(mutations[1].headers["if-match"], '"revision"');
  } finally {
    globalThis.fetch = original;
  }
});

test("404, 412 and 429 remain explicit errors without mutation retries", async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [404, 412, 429]) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return new Response(JSON.stringify({ error: { code: "REJECTED" } }), {
          status,
        });
      };
      await assert.rejects(
        businessRequest("owners/id", "org"),
        (e) => e instanceof ApiFault && e.status === status,
      );
      assert.equal(calls, 1);
    }
  } finally {
    globalThis.fetch = original;
  }
});
test("network failure never blindly retries financial mutations", async () => {
  const original = globalThis.fetch;
  let mutations = 0;
  globalThis.fetch = async (url) => {
    if (url === "/api/auth/csrf")
      return new Response(JSON.stringify({ csrfToken: "challenge" }));
    mutations++;
    throw Error("Network interrupted");
  };
  try {
    await assert.rejects(
      businessRequest("payments", "org", { method: "POST", body: {} }),
    );
    assert.equal(mutations, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("authorization failures remain errors rather than fabricated empty data", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ success: false, error: { code: "ACCESS_DENIED" } }),
      { status: 403 },
    );
  try {
    await assert.rejects(
      businessRequest("owners", "org"),
      (e) =>
        e instanceof ApiFault && e.status === 403 && e.code === "ACCESS_DENIED",
    );
  } finally {
    globalThis.fetch = original;
  }
});
