import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { securityFixture } from "./helpers/security-fixtures.mjs";
const f = await securityFixture(),
  checks = [];
test.after(async () => {
  await f.close();
  writeFileSync(
    new URL("../../../docs/etapa-0.11-security-tests.json", import.meta.url),
    JSON.stringify({ isolated: true, passed: checks.length, checks }, null, 2),
  );
});
test("revoked and disabled credentials fail on both access and refresh across devices", async () => {
  const a = await f.account(),
    b = await f.auth.createSession(a.user.id, a.csrf, "second device");
  await f.auth.authenticate(a.access);
  await f.auth.authenticate(b.access);
  await f.auth.revoke(await f.auth.authenticate(a.access), true);
  await assert.rejects(f.auth.authenticate(a.access));
  await assert.rejects(f.auth.authenticate(b.access));
  await assert.rejects(f.auth.rotate(a.refresh, a.csrf));
  await assert.rejects(f.auth.rotate(b.refresh, a.csrf));
  const c = await f.account();
  await f.admin.user.update({
    where: { id: c.user.id },
    data: { disabledAt: new Date() },
  });
  await assert.rejects(f.auth.authenticate(c.access));
  await assert.rejects(f.auth.rotate(c.refresh, c.csrf));
  await assert.rejects(f.auth.checkPassword(c.user.email, c.password));
  checks.push(
    "disabled users and all-device revocation reject old access and refresh",
  );
});
test("absolute expiry and wrong CSRF cannot consume a valid refresh", async () => {
  const a = await f.account();
  await assert.rejects(f.auth.rotate(a.refresh, "foreign-csrf"));
  const valid = await f.auth.rotate(a.refresh, a.csrf);
  await f.auth.authenticate(valid.access);
  f.advance(31 * 86400000);
  await assert.rejects(f.auth.authenticate(valid.access));
  await assert.rejects(f.auth.rotate(valid.refresh, a.csrf));
  checks.push(
    "wrong CSRF leaves token unused and absolute expiry denies both tokens",
  );
});
test("unknown and wrong-password accounts receive identical HTTP messages", async () => {
  const a = await f.account();
  const known = await f.request(
      a,
      "auth/login",
      "POST",
      { email: a.user.email, password: "Wrong!Password2026" },
      401,
    ),
    unknown = await f.request(
      a,
      "auth/login",
      "POST",
      {
        email: "nonexistent-security@example.invalid",
        password: "Wrong!Password2026",
      },
      401,
    );
  assert.deepEqual(known, unknown);
  const resetKnown = await f.request(a, "auth/forgot-password", "POST", {
      email: a.user.email,
    }),
    resetUnknown = await f.request(a, "auth/forgot-password", "POST", {
      email: "nonexistent-security@example.invalid",
    });
  assert.deepEqual(resetKnown, resetUnknown);
  checks.push("login and recovery responses do not disclose account existence");
});
test("suspended membership and organization stop an already issued business session", async () => {
  const a = await f.account("ADMIN_ORGANIZACAO");
  await f.request(a, "owners");
  await f.admin.organizationMembership.update({
    where: { id: a.membership.id },
    data: { status: "SUSPENDED" },
  });
  await f.request(a, "owners", "GET", undefined, 401);
  const b = await f.account("ADMIN_ORGANIZACAO");
  await f.request(b, "owners");
  await f.admin.organization.update({
    where: { id: b.org },
    data: { status: "SUSPENDED" },
  });
  await f.request(b, "owners", "GET", undefined, 401);
  checks.push(
    "suspended membership or organization denies existing session without stale authorization",
  );
});
