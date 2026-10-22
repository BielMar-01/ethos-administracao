import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseClient, withOrganization } from "@ethos/database";
import { AuthService } from "../dist/auth/mfa.js";
import { provisionRoles } from "../dist/auth/provisioning.js";
import { buildApp } from "../dist/app.js";
import { totp } from "../dist/auth/security.js";

const base =
  process.env.ETHOS_AUTH_TEST_DATABASE_URL ??
  "postgresql://postgres:ethos-local-disposable@127.0.0.1:55439/ethos_auth_test";
const parsed = new URL(base);
if (
  !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
  parsed.pathname != "/ethos_auth_test"
)
  throw Error("ISOLATED_DATABASE_REQUIRED");
const url = (user, password) => {
  const value = new URL(base);
  value.username = user;
  value.password = password;
  return value.toString();
};
export const identity = createDatabaseClient({
  connectionString: url("ethos_auth_runtime", "ethos-runtime-test-only"),
  allowLocalPlaintext: true,
});
export const tenant = createDatabaseClient({
  connectionString: url("ethos_tenant_runtime", "ethos-tenant-test-only"),
  allowLocalPlaintext: true,
  maxConnections: 1,
});
export const admin = createDatabaseClient({
  connectionString: base,
  allowLocalPlaintext: true,
});
export const messages = [];
let timestamp = Date.now();
export const dependencies = {
  identity: identity.prisma,
  tenant: tenant.prisma,
  cookieSecret: "isolated-test-cookie-key-at-least-32-characters",
  encryptionKey: Buffer.alloc(32, 9),
  origin: "http://localhost:3000",
  production: false,
  deliver: async (message) => {
    messages.push(message);
  },
  now: () => new Date(timestamp),
};
export const service = new AuthService(dependencies);
const password = "Ethos!Secure2026";
export async function account() {
  const email = `${randomUUID()}@example.invalid`;
  await service.register(email, password, "Isolated test");
  await service.drainMail();
  const mail = messages.find(
    (m) => m.to === email && m.purpose === "VERIFY_EMAIL",
  );
  assert.ok(mail);
  await service.consume(mail.token, "VERIFY_EMAIL");
  return {
    email,
    password,
    user: await service.checkPassword(email, password),
  };
}
test("registration, single-use confirmation, password reset, refresh rotation/replay and expiry", async () => {
  const { email, user } = await account();
  const mail = messages.find((m) => m.to === email);
  await assert.rejects(service.consume(mail.token, "VERIFY_EMAIL"));
  await assert.rejects(service.checkPassword(email, "Incorrect!Password2026"));
  await service.register(email, password, "No overwrite");
  const issued = await service.createSession(user.id, "csrf-fixture", "test");
  await service.authenticate(issued.access);
  const rotated = await service.rotate(issued.refresh, "csrf-fixture");
  await assert.rejects(service.authenticate(issued.access));
  await service.authenticate(rotated.access);
  await assert.rejects(service.rotate(issued.refresh, "csrf-fixture"));
  await assert.rejects(service.authenticate(rotated.access));
  const next = await service.createSession(user.id, "csrf-fixture", "test");
  timestamp += 6 * 60_000;
  await assert.rejects(service.authenticate(next.access));
  const refreshed = await service.rotate(next.refresh, "csrf-fixture");
  await service.authenticate(refreshed.access);
  await service.requestAction(email, "RESET_PASSWORD");
  await service.drainMail();
  const reset = messages
    .filter((m) => m.to === email && m.purpose === "RESET_PASSWORD")
    .at(-1);
  await service.consume(reset.token, "RESET_PASSWORD", "New!Password2027");
  await assert.rejects(
    service.consume(reset.token, "RESET_PASSWORD", "New!Password2027"),
  );
  await assert.rejects(service.authenticate(refreshed.access));
  await service.checkPassword(email, "New!Password2027");
});
test("concurrent refresh consumption is atomic and replay revokes family", async () => {
  const { user } = await account(),
    issued = await service.createSession(user.id, "csrf-fixture", "test");
  const results = await Promise.allSettled([
    service.rotate(issued.refresh, "csrf-fixture"),
    service.rotate(issued.refresh, "csrf-fixture"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const valid = results.find((r) => r.status === "fulfilled").value;
  await assert.rejects(service.authenticate(valid.access));
});
test("organization selection, runtime RLS, RBAC and revoked assignments fail closed", async () => {
  const { user } = await account(),
    a = randomUUID(),
    b = randomUUID();
  await admin.prisma.organization.create({
    data: { id: a, name: "Test A", slug: `test-${a}` },
  });
  await admin.prisma.organization.create({
    data: { id: b, name: "Test B", slug: `test-${b}` },
  });
  const member = await admin.prisma.organizationMembership.create({
    data: { organizationId: a, userId: user.id, status: "ACTIVE" },
  });
  await provisionRoles(admin.prisma, a, member.id);
  const issued = await service.createSession(user.id, "csrf-fixture", "test"),
    session = await service.authenticate(issued.access);
  await assert.rejects(service.permissions(session));
  await assert.rejects(service.selectOrganization(session, b));
  await service.selectOrganization(session, a);
  const selected = await service.authenticate(issued.access);
  assert.equal(await service.authorize(selected, "properties.read"), true);
  await withOrganization(
    tenant.prisma,
    { organizationId: a, userId: user.id },
    async (tx) => {
      assert.equal(await tx.organization.count(), 1);
      assert.equal(await tx.organization.count({ where: { id: b } }), 0);
    },
  );
  const [context] = await tenant.prisma
    .$queryRaw`SELECT nullif(current_setting('ethos.organization_id',true),'') AS organization, nullif(current_setting('ethos.actor_membership_id',true),'') AS actor`;
  assert.equal(context.organization, null);
  assert.equal(context.actor, null);
  assert.equal(await tenant.prisma.organization.count(), 0);
  await admin.prisma.membershipRole.updateMany({
    where: { membershipId: member.id },
    data: { revokedAt: new Date() },
  });
  await assert.rejects(service.authorize(selected, "properties.read"));
  await assert.rejects(service.authenticate(issued.access));
  assert.ok(
    (await identity.prisma.authEvent.count({
      where: {
        sessionId: issued.session.id,
        category: "SECURITY_PRIVILEGE_CHANGED",
      },
    })) > 0,
  );
  const financeRole = await admin.prisma.role.findUnique({
    where: { organizationId_code: { organizationId: a, code: "FINANCEIRO" } },
  });
  await admin.prisma.membershipRole.create({
    data: {
      organizationId: a,
      membershipId: member.id,
      roleId: financeRole.id,
    },
  });
  assert.equal(await service.authorize(selected, "finance.create"), true);
  await assert.rejects(service.authorize(selected, "properties.create"));
  await admin.prisma.organizationMembership.update({
    where: { id: member.id },
    data: { status: "REVOKED" },
  });
  await assert.rejects(service.permissions(selected));
  await assert.rejects(
    tenant.prisma.$queryRaw`SELECT * FROM ethos_identity."AuthCredential"`,
  );
});
test("HTTP CSRF, cookies, generic responses, strict schemas and session endpoints", async () => {
  const app = await buildApp({
    auth: { ...dependencies, rateLimitMax: 100 },
    logger: false,
  });
  const jar = {};
  let csrf;
  async function request(method, path, body, headers = {}) {
    const response = await app.inject({
      method,
      url: "/api/v1/auth" + path,
      headers: {
        cookie: Object.entries(jar)
          .map(([k, v]) => `${k}=${v}`)
          .join(";"),
        origin: dependencies.origin,
        ...(csrf ? { "x-csrf-token": csrf } : {}),
        ...headers,
      },
      ...(body ? { payload: body } : {}),
    });
    for (const cookie of response.cookies) {
      if (cookie.value) jar[cookie.name] = cookie.value;
      else delete jar[cookie.name];
    }
    return response;
  }
  try {
    assert.equal(
      (
        await request("POST", "/login", {
          email: "nobody@example.invalid",
          password,
        })
      ).statusCode,
      403,
    );
    const challenge = await request("GET", "/csrf");
    csrf = challenge.json().csrfToken;
    assert.equal(
      (
        await request(
          "POST",
          "/login",
          { email: "nobody@example.invalid", password },
          { origin: "http://evil.invalid" },
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await request("POST", "/register", {
          email: "nobody@example.invalid",
          password,
          displayName: "Test",
          roles: ["SUPER_ADMIN"],
        })
      ).statusCode,
      400,
    );
    const { email } = await account();
    const missing = await request("POST", "/forgot-password", {
      email: `${randomUUID()}@example.invalid`,
    });
    const existing = await request("POST", "/forgot-password", { email });
    assert.deepEqual(missing.json(), existing.json());
    const login = await request("POST", "/login", { email, password });
    assert.equal(login.statusCode, 200);
    const raw = String(login.headers["set-cookie"]);
    assert.match(raw, /HttpOnly/);
    assert.match(raw, /SameSite=Lax/);
    assert.doesNotMatch(
      JSON.stringify(login.json()),
      /refreshToken|accessToken/,
    );
    assert.equal((await request("GET", "/me")).json().user.email, email);
    assert.equal((await request("GET", "/sessions")).statusCode, 200);
    assert.equal(
      (await request("POST", "/organization", { organizationId: randomUUID() }))
        .statusCode,
      403,
    );
    assert.equal((await request("POST", "/logout")).statusCode, 200);
    assert.equal((await request("GET", "/me")).statusCode, 401);
  } finally {
    await app.close();
  }
});
test("mandatory platform MFA, TOTP replay prevention and recovery code single use", async () => {
  const { user } = await account();
  await admin.prisma.platformAccessGrant.create({
    data: {
      userId: user.id,
      role: "SUPER_ADMIN",
      grantedByUserId: user.id,
      reason: "Isolated auth integration test",
    },
  });
  const issued = await service.createSession(user.id, "csrf-fixture", "test");
  assert.equal(issued.session.assurance, "MFA_SETUP");
  await assert.rejects(service.authenticate(issued.access));
  const limited = await service.authenticate(issued.access, true),
    setup = await service.setupMfa(limited);
  const enrollment = await service.verifyMfa(
    limited,
    totp(setup.secret).generate({ timestamp }),
    true,
  );
  assert.equal(enrollment.recoveryCodes.length, 10);
  await service.authenticate(issued.access);
  const platformApp = await buildApp({ auth: dependencies, logger: false });
  try {
    await platformApp.ready();
    const reason = "Isolated platform authorization audit";
    const response = await platformApp.inject({
      method: "POST",
      url: "/api/v1/auth/platform/access",
      headers: {
        origin: dependencies.origin,
        "x-csrf-token": "csrf-fixture",
        cookie: `ethos_access=${issued.access}; ethos_csrf=${encodeURIComponent(platformApp.signCookie("csrf-fixture"))}`,
      },
      payload: { reason },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(
      await identity.prisma.authEvent.count({
        where: {
          sessionId: issued.session.id,
          category: "PLATFORM_ACCESS",
          reason,
        },
      }),
      1,
    );
  } finally {
    await platformApp.close();
  }
  await assert.rejects(
    service.verifyMfa(limited, totp(setup.secret).generate({ timestamp })),
  );
  const fresh = await service.createSession(user.id, "csrf-fixture", "test");
  await assert.rejects(service.authenticate(fresh.access));
  const pending = await service.authenticate(fresh.access, true);
  await service.verifyMfa(pending, enrollment.recoveryCodes[0]);
  await service.authenticate(fresh.access);
  await assert.rejects(service.verifyMfa(pending, enrollment.recoveryCodes[0]));
  await assert.rejects(service.setupMfa(pending));
});
test("rate limiting, production cookie flags, reauthentication and all-device revocation", async () => {
  const origin = "https://ethos.example.invalid";
  const app = await buildApp({
    auth: { ...dependencies, origin, production: true, rateLimitMax: 2 },
    logger: false,
  });
  try {
    const challenge = await app.inject({
      method: "GET",
      url: "/api/v1/auth/csrf",
    });
    const csrf = challenge.json().csrfToken,
      cookie = challenge.cookies.map((c) => `${c.name}=${c.value}`).join(";");
    assert.match(String(challenge.headers["set-cookie"]), /__Host-ethos_csrf=/);
    assert.match(String(challenge.headers["set-cookie"]), /Secure/);
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: { origin, cookie, "x-csrf-token": csrf },
        payload: { email: `${randomUUID()}@example.invalid`, password },
      });
      assert.equal(response.statusCode, attempt < 2 ? 401 : 429);
    }
  } finally {
    await app.close();
  }
  const { user } = await account(),
    a = await service.createSession(user.id, "csrf-fixture", "one"),
    b = await service.createSession(user.id, "csrf-fixture", "two");
  const current = await service.authenticate(a.access);
  await service.revoke(current, true);
  await assert.rejects(service.authenticate(b.access));
  const fresh = await service.createSession(user.id, "csrf-fixture", "three"),
    session = await service.authenticate(fresh.access);
  timestamp += 6 * 60_000;
  assert.throws(() => service.recent(session));
  await assert.rejects(service.reauthenticate(session, "Wrong!Password2026"));
  await service.reauthenticate(session, password);
});
test("one-time action expiry and disabled users reject authentication", async () => {
  const email = `${randomUUID()}@example.invalid`;
  await service.register(email, password, "Expired");
  await service.drainMail();
  const mail = messages.find((m) => m.to === email);
  timestamp += 25 * 3600_000;
  await assert.rejects(service.consume(mail.token, "VERIFY_EMAIL"));
  const { user, email: verified } = await account();
  const issued = await service.createSession(user.id, "csrf-fixture", "test");
  await admin.prisma.user.update({
    where: { id: user.id },
    data: { disabledAt: new Date(timestamp) },
  });
  await assert.rejects(service.authenticate(issued.access));
  await assert.rejects(service.checkPassword(verified, password));
});
test("startup rejects administrative credentials and logs never expose request secrets", async () => {
  const unsafe = await buildApp({
    auth: { ...dependencies, identity: admin.prisma },
    logger: false,
  });
  await assert.rejects(unsafe.ready(), /UNSAFE_AUTH_DATABASE_ROLE/);
  await unsafe.close();
  const disguisedUrl = new URL(base);
  disguisedUrl.searchParams.set("options", "-c role=ethos_auth_runtime");
  const disguised = createDatabaseClient({
    connectionString: disguisedUrl.toString(),
    allowLocalPlaintext: true,
    maxConnections: 1,
  });
  const disguisedApp = await buildApp({
    auth: { ...dependencies, identity: disguised.prisma },
    logger: false,
  });
  try {
    await assert.rejects(disguisedApp.ready(), /UNSAFE_AUTH_DATABASE_ROLE/);
  } finally {
    await disguisedApp.close();
    await disguised.disconnect();
  }
  const logs = [],
    secret = "DO_NOT_LOG_AUTH_SECRET_2026";
  const app = await buildApp({
    auth: dependencies,
    logStream: {
      write: (line) => {
        logs.push(line);
      },
    },
  });
  app.get("/__unit_error", async () => {
    throw Error(secret);
  });
  try {
    const response = await app.inject({
      method: "GET",
      url: `/__unit_error?token=${secret}`,
      headers: { cookie: `test=${secret}`, authorization: `Bearer ${secret}` },
    });
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.includes(secret), false);
    assert.equal(logs.join("").includes(secret), false);
  } finally {
    await app.close();
  }
});
test("session cleanup retains immutable authentication audit", async () => {
  const { user } = await account(),
    issued = await service.createSession(user.id, "csrf-fixture", "expired");
  const old = new Date(timestamp - 100 * 86400_000);
  await admin.prisma.authSession.update({
    where: { id: issued.session.id },
    data: { accessExpiresAt: old, expiresAt: old },
  });
  await service.cleanup();
  assert.equal(
    await identity.prisma.authSession.count({
      where: { id: issued.session.id },
    }),
    0,
  );
  assert.ok(
    (await identity.prisma.authEvent.count({
      where: { sessionId: issued.session.id },
    })) > 0,
  );
});
test.after(async () => {
  await Promise.all([
    identity.disconnect(),
    tenant.disconnect(),
    admin.disconnect(),
  ]);
});
