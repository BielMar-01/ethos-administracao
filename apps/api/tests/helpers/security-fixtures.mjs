import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@ethos/database";
import { buildApp } from "../../dist/app.js";
import { AuthService } from "../../dist/auth/mfa.js";
import { hashPassword } from "../../dist/auth/security.js";
import { provisionRoles } from "../../dist/auth/provisioning.js";
export async function securityFixture() {
  const base =
      process.env.ETHOS_AUTH_TEST_DATABASE_URL ??
      "postgresql://postgres:ethos-local-disposable@127.0.0.1:55439/ethos_auth_test",
    target = new URL(base);
  if (
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.pathname !== "/ethos_auth_test"
  )
    throw Error("ISOLATED_DATABASE_REQUIRED");
  const make = (name, password) => {
    const u = new URL(base);
    u.username = name;
    u.password = password;
    return createDatabaseClient({
      connectionString: u.toString(),
      allowLocalPlaintext: true,
      maxConnections: 4,
    });
  };
  const admin = createDatabaseClient({
      connectionString: base,
      allowLocalPlaintext: true,
    }),
    identity = make("ethos_auth_runtime", "ethos-runtime-test-only"),
    tenant = make("ethos_tenant_runtime", "ethos-tenant-test-only");
  let now = Date.now();
  const delivered = [],
    deps = {
      identity: identity.prisma,
      tenant: tenant.prisma,
      cookieSecret: "isolated-security-fixture-cookie-key-over-32",
      encryptionKey: Buffer.alloc(32, 11),
      origin: "http://localhost:3000",
      production: false,
      rateLimitMax: 10000,
      now: () => new Date(now),
      deliver: async (message) => delivered.push(message),
    };
  const auth = new AuthService(deps),
    app = await buildApp({ auth: deps, logger: false });
  await app.ready();
  const password = "Security!Fixture2026",
    passwordHash = await hashPassword(password);
  async function account(role, org) {
    const user = await admin.prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        displayName: "Security fixture",
        credential: { create: { passwordHash, emailVerifiedAt: new Date() } },
      },
    });
    let membership;
    if (role) {
      org ??= (
        await admin.prisma.organization.create({
          data: { name: "Security fixture", slug: randomUUID() },
        })
      ).id;
      await provisionRoles(admin.prisma, org);
      membership = await admin.prisma.organizationMembership.create({
        data: { organizationId: org, userId: user.id, status: "ACTIVE" },
      });
      const assigned = await admin.prisma.role.findUniqueOrThrow({
        where: { organizationId_code: { organizationId: org, code: role } },
      });
      await admin.prisma.membershipRole.create({
        data: {
          organizationId: org,
          membershipId: membership.id,
          roleId: assigned.id,
        },
      });
    }
    const csrf = "security-fixture-csrf",
      issued = await auth.createSession(user.id, csrf, "isolated fixture");
    if (org)
      await auth.selectOrganization(
        await auth.authenticate(issued.access),
        org,
      );
    return {
      user,
      org,
      membership,
      csrf,
      password,
      ...issued,
      cookie: `ethos_access=${issued.access}; ethos_csrf=${encodeURIComponent(app.signCookie(csrf))}`,
    };
  }
  async function request(
    account,
    path,
    method = "GET",
    body,
    expected = 200,
    headers = {},
  ) {
    const mutation = method !== "GET" && !path.startsWith("auth/");
    const consistency = mutation ? { "idempotency-key": randomUUID() } : {};
    if (
      method === "PATCH" ||
      (method === "POST" && path.split("/").length === 3)
    ) {
      const detail = await app.inject({
        url: `/api/v1/${path.split("/").slice(0, 2).join("/")}`,
        headers: { cookie: account.cookie },
      });
      if (detail.statusCode === 200 && detail.json().data?._etag)
        consistency["if-match"] = detail.json().data._etag;
    }
    const r = await app.inject({
      url: `/api/v1/${path}`,
      method,
      payload: body,
      headers: {
        cookie: account.cookie,
        origin: deps.origin,
        "x-csrf-token": account.csrf,
        ...(account.org ? { "x-ethos-context": account.org } : {}),
        ...consistency,
        ...headers,
      },
    });
    assert.equal(r.statusCode, expected, `${method} ${path}: ${r.statusCode}`);
    return r.json();
  }
  return {
    tenant: tenant.prisma,
    admin: admin.prisma,
    auth,
    app,
    account,
    request,
    delivered,
    advance: (ms) => (now += ms),
    close: async () => {
      await app.close();
      await Promise.all([
        admin.disconnect(),
        identity.disconnect(),
        tenant.disconnect(),
      ]);
    },
  };
}
