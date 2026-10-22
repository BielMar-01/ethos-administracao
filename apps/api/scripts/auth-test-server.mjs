// Disposable loopback-only browser fixture server. Never use for deployment.
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@ethos/database";
import { buildApp } from "../dist/app.js";
import { provisionRoles } from "../dist/auth/provisioning.js";
import { hashPassword } from "../dist/auth/security.js";
if (process.env.NODE_ENV === "production")
  throw Error("TEST_SERVER_FORBIDDEN_IN_PRODUCTION");
const base =
  "postgresql://postgres:ethos-local-disposable@127.0.0.1:55439/ethos_auth_test";
const make = (name, password) => {
  const url = new URL(base);
  url.username = name;
  url.password = password;
  return createDatabaseClient({
    connectionString: url.toString(),
    allowLocalPlaintext: true,
  });
};
const admin = createDatabaseClient({
  connectionString: base,
  allowLocalPlaintext: true,
});
const identity = make("ethos_auth_runtime", "ethos-runtime-test-only"),
  tenant = make("ethos_tenant_runtime", "ethos-tenant-test-only");
const mail = [];
const dependencies = {
  identity: identity.prisma,
  tenant: tenant.prisma,
  cookieSecret: "isolated-browser-cookie-key-32-characters-or-more",
  encryptionKey: Buffer.alloc(32, 8),
  origin: "http://localhost:3099",
  production: false,
  rateLimitMax: 100,
  deliver: async (message) => {
    mail.push(message);
  },
};
for (const [email, role] of [
  ["browser-admin@example.invalid", "ADMIN_ORGANIZACAO"],
  ["browser-tenant@example.invalid", "INQUILINO"],
]) {
  let user = await admin.prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await admin.prisma.user.create({
      data: { email, displayName: "Browser test" },
    });
    await admin.prisma.authCredential.create({
      data: {
        userId: user.id,
        passwordHash: await hashPassword("Ethos!Browser2026"),
        emailVerifiedAt: new Date(),
      },
    });
  }
  await admin.prisma.authCredential.update({
    where: { userId: user.id },
    data: {
      mfaEnabled: false,
      mfaSecretCipher: null,
      pendingMfaCipher: null,
      lastTotpCounter: null,
    },
  });
  await admin.prisma.authSession.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  for (const slug of ["browser-org-a", "browser-org-b"]) {
    const org = await admin.prisma.organization.upsert({
      where: { slug },
      create: {
        id: randomUUID(),
        slug,
        name: slug === "browser-org-a" ? "Ethos Teste A" : "Ethos Teste B",
      },
      update: {},
    });
    const member = await admin.prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: user.id },
      },
      create: { organizationId: org.id, userId: user.id, status: "ACTIVE" },
      update: {},
    });
    await provisionRoles(admin.prisma, org.id);
    const assigned = await admin.prisma.role.findUnique({
      where: { organizationId_code: { organizationId: org.id, code: role } },
    });
    await admin.prisma.membershipRole.upsert({
      where: {
        organizationId_membershipId_roleId: {
          organizationId: org.id,
          membershipId: member.id,
          roleId: assigned.id,
        },
      },
      create: {
        organizationId: org.id,
        membershipId: member.id,
        roleId: assigned.id,
      },
      update: { revokedAt: null },
    });
  }
}
const app = await buildApp({ auth: dependencies, logger: false });
app.get("/__test/mail", async (request) =>
  mail.filter((item) => item.to === request.query.email),
);
app.addHook("onClose", async () => {
  await Promise.all([
    identity.disconnect(),
    tenant.disconnect(),
    admin.disconnect(),
  ]);
});
await app.listen({ host: "127.0.0.1", port: 3339 });
console.log("ISOLATED_AUTH_BROWSER_SERVER_READY");
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void app.close();
  });
