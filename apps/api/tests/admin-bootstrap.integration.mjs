import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  bootstrapAdministrativeUser,
  bootstrapRequest,
} from "../dist/auth/admin-bootstrap.js";
import { securityFixture } from "./helpers/security-fixtures.mjs";
import { totp } from "../dist/auth/security.js";
test("operator bootstrap is private, atomic, audited and serialized", async () => {
  const url = new URL(process.env.ETHOS_AUTH_TEST_DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55440");
  assert.equal(url.pathname, "/ethos_auth_test");
  const f = await securityFixture(),
    checks = [];
  const input = () => ({
    kind: "FIRST_SUPER_ADMIN",
    email: `${randomUUID()}@example.invalid`,
    displayName: "Isolated initial admin",
    password: `Initial!${randomUUID()}`,
    reason: "Isolated authorized bootstrap test",
  });
  try {
    assert.equal(
      await f.admin.platformAccessGrant.count(),
      0,
      "FRESH_BOOTSTRAP_TEST_DATABASE_REQUIRED",
    );
    assert.equal(
      bootstrapRequest.safeParse({ ...input(), password: "weak" }).success,
      false,
    );
    assert.equal(
      bootstrapRequest.safeParse({ ...input(), role: "ADMIN_ORGANIZACAO" })
        .success,
      false,
    );
    await assert.rejects(
      bootstrapAdministrativeUser(f.tenant, input()),
      /ADMINISTRATIVE_CONNECTION_REQUIRED/,
    );
    checks.push(
      "strong password required",
      "platform and tenant roles separated",
      "runtime cannot bootstrap",
    );
    const requests = [input(), input()];
    const race = await Promise.allSettled(
      requests.map((v) => bootstrapAdministrativeUser(f.admin, v)),
    );
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    const index = race.findIndex((r) => r.status === "fulfilled"),
      created = race[index].value,
      value = requests[index];
    assert.equal(
      await f.admin.platformAccessGrant.count({
        where: { role: "SUPER_ADMIN" },
      }),
      1,
    );
    assert.equal(
      await f.admin.platformAuditLog.count({
        where: { targetUserId: created.userId, action: "GRANT" },
      }),
      1,
    );
    assert.equal(
      await f.admin.authEvent.count({
        where: {
          userId: created.userId,
          category: "OPERATOR_USER_PROVISIONED",
        },
      }),
      1,
    );
    const stored = await f.admin.authCredential.findUniqueOrThrow({
      where: { userId: created.userId },
    });
    assert.equal(stored.passwordHash.startsWith("$argon2id$"), true);
    assert.equal(stored.emailVerifiedAt, null);
    assert.equal(stored.mfaEnabled, false);
    await assert.rejects(
      f.auth.checkPassword(value.email, value.password),
      (e) => e.code === "INVALID_CREDENTIALS",
    );
    await assert.rejects(
      bootstrapAdministrativeUser(f.admin, input()),
      /INITIAL_SUPER_ADMIN_ALREADY_PROVISIONED/,
    );
    checks.push(
      "concurrent first admin requests create exactly one identity/grant",
      "platform and authentication audit recorded",
      "Argon2id and pending email by default",
      "duplicate first admin blocked",
    );
    await f.auth.consume(created.verificationToken, "VERIFY_EMAIL");
    await assert.rejects(
      f.auth.consume(created.verificationToken, "VERIFY_EMAIL"),
      (e) => e.code === "INVALID_OR_EXPIRED_TOKEN",
    );
    await f.auth.checkPassword(value.email, value.password);
    const issued = await f.auth.createSession(
      created.userId,
      "bootstrap-csrf",
      "isolated bootstrap",
    );
    assert.equal(issued.session.assurance, "MFA_SETUP");
    await assert.rejects(
      f.auth.authenticate(issued.access),
      (e) => e.code === "MFA_REQUIRED",
    );
    const setup = await f.auth.setupMfa(
      await f.auth.authenticate(issued.access, true),
    );
    await f.auth.verifyMfa(
      await f.auth.authenticate(issued.access, true),
      totp(setup.secret).generate({ timestamp: Date.now() }),
      true,
    );
    assert.equal((await f.auth.authenticate(issued.access)).assurance, "MFA");
    checks.push(
      "single use confirmation required",
      "SUPER_ADMIN cannot bypass MFA setup",
      "MFA enrollment unlocks existing platform authentication",
    );
    const org = await f.admin.organization.create({
      data: { name: "Isolated organization", slug: randomUUID() },
    });
    for (const role of [
      "ADMIN_ORGANIZACAO",
      "GESTOR",
      "FINANCEIRO",
      "PROPRIETARIO",
      "INQUILINO",
    ]) {
      const request = {
        ...input(),
        kind: "ORGANIZATION_USER",
        organizationId: org.id,
        role,
      };
      const result = await bootstrapAdministrativeUser(f.admin, request);
      await f.auth.consume(result.verificationToken, "VERIFY_EMAIL");
      await f.auth.checkPassword(request.email, request.password);
      const session = await f.auth.createSession(
        result.userId,
        "org-csrf",
        "isolated role",
      );
      await f.auth.selectOrganization(
        await f.auth.authenticate(session.access),
        org.id,
      );
      const permission = await f.auth.permissions(
        await f.auth.authenticate(session.access),
      );
      if (["PROPRIETARIO", "INQUILINO"].includes(role))
        assert.ok(permission.every((p) => p.endsWith(".read_own")));
      const member = await f.admin.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: {
            organizationId: org.id,
            userId: result.userId,
          },
        },
      });
      assert.equal(
        await f.admin.membershipRole.count({
          where: {
            organizationId: org.id,
            membershipId: member.id,
            role: { code: role },
          },
        }),
        1,
      );
      await assert.rejects(
        bootstrapAdministrativeUser(f.admin, request),
        /EXISTING_IDENTITY_REQUIRES_SEPARATE_AUTHORIZATION/,
      );
      checks.push(
        `${role}: new identity, correct membership, login and permissions`,
      );
    }
    const count = await f.admin.user.count();
    await assert.rejects(
      bootstrapAdministrativeUser(f.admin, {
        ...input(),
        kind: "ORGANIZATION_USER",
        organizationId: randomUUID(),
        role: "GESTOR",
      }),
      /ACTIVE_ORGANIZATION_REQUIRED/,
    );
    await assert.rejects(
      bootstrapAdministrativeUser(
        f.admin,
        {
          ...input(),
          kind: "ORGANIZATION_USER",
          organizationId: org.id,
          role: "GESTOR",
        },
        async () => {
          throw Error("HANDOFF_WRITE_FAILED");
        },
      ),
      /HANDOFF_WRITE_FAILED/,
    );
    assert.equal(await f.admin.user.count(), count);
    assert.equal(await f.admin.platformAccessGrant.count(), 1);
    checks.push(
      "invalid organization and handoff failure roll back",
      "no duplicate platform administrator or identity escalation",
    );
    writeFileSync(
      new URL(
        "../../../docs/etapa-0.11.1-bootstrap-tests.json",
        import.meta.url,
      ),
      JSON.stringify(
        { isolated: true, realUsersModified: false, passed: true, checks },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await f.close();
  }
});
