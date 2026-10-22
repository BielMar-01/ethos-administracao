import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createDatabaseClient, withOrganization } from "../dist/index.js";
import { establishOrganizationContext } from "../dist/organization-context.js";
import { redact } from "./redact.mjs";

config({ path: new URL("../.env", import.meta.url), quiet: true });
const database = createDatabaseClient({
  allowLocalPlaintext: process.env.ETHOS_LOCAL_DATABASE === "1",
  connectionString: process.env.DIRECT_DATABASE_URL,
  maxConnections: 1,
});
const role = `ethos_ctx_${randomUUID().replaceAll("-", "")}`;
const a = randomUUID(),
  b = randomUUID(),
  user = randomUUID(),
  member = randomUUID();
const rolledBack = new Error("EXPECTED_TEST_ROLLBACK");
const passed = [];
let stage = "privileged connection guard";
try {
  await assert.rejects(
    withOrganization(
      database.prisma,
      { organizationId: a, userId: user },
      async () => assert.fail("Privileged callback must not run"),
    ),
    /PRIVILEGED_DATABASE_ROLE_FORBIDDEN/,
  );
  passed.push("withOrganization refuses BYPASSRLS credentials");
  await assert.rejects(
    withOrganization(
      database.prisma,
      { organizationId: "invalid", userId: user },
      async () => assert.fail(),
    ),
    /INVALID_ORGANIZATION_CONTEXT/,
  );
  passed.push("invalid context rejected before callback");
  try {
    await database.prisma.$transaction(
      async (tx) => {
        stage = "transaction fixtures";
        const [connection] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
        await tx.organization.create({
          data: { id: a, name: "Context test", slug: `ctx-${a}` },
        });
        await tx.organization.create({
          data: { id: b, name: "Context test B", slug: `ctx-${b}` },
        });
        await tx.user.create({
          data: {
            id: user,
            email: `${user}@example.invalid`,
            displayName: "Test",
          },
        });
        await tx.organizationMembership.create({
          data: {
            id: member,
            organizationId: a,
            userId: user,
            status: "ACTIVE",
          },
        });
        await tx.property.create({
          data: {
            organizationId: a,
            code: "TEST",
            name: "Test",
            kind: "RESIDENTIAL",
            address: {},
          },
        });
        // Identifiers generated locally from UUID; never supplied by a request.
        await tx.$executeRawUnsafe(
          `CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`,
        );
        await tx.$executeRawUnsafe(`GRANT ${role} TO CURRENT_USER`);
        await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA ethos TO ${role}`);
        await tx.$executeRawUnsafe(
          `GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA ethos TO ${role}`,
        );
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        stage = "valid membership with real Prisma transaction";
        await establishOrganizationContext(tx, {
          organizationId: a,
          userId: user,
        });
        assert.equal(await tx.property.count(), 1);
        const [context] =
          await tx.$queryRaw`SELECT pg_backend_pid() AS pid, current_setting('ethos.actor_membership_id',true) AS actor`;
        assert.equal(context.pid, connection.pid);
        assert.equal(context.actor, member);
        passed.push(
          "Prisma uses same interactive transaction connection and verifies active membership",
        );
        stage = "unauthorized membership";
        await tx.$executeRawUnsafe("SAVEPOINT denied_context");
        await assert.rejects(
          establishOrganizationContext(tx, { organizationId: b, userId: user }),
          /ORGANIZATION_ACCESS_DENIED/,
        );
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT denied_context");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT denied_context");
        passed.push("valid UUID does not grant access without membership");
        stage = "suspended organization";
        await tx.$executeRawUnsafe("SAVEPOINT suspended_organization");
        await tx.organization.update({
          where: { id: a },
          data: { status: "SUSPENDED" },
        });
        await assert.rejects(
          establishOrganizationContext(tx, { organizationId: a, userId: user }),
          /ORGANIZATION_ACCESS_DENIED/,
        );
        await tx.$executeRawUnsafe(
          "ROLLBACK TO SAVEPOINT suspended_organization",
        );
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT suspended_organization");
        passed.push("suspended organizations denied");
        await tx.owner.create({
          data: { organizationId: a, name: "Context audit test" },
        });
        assert.equal(
          await tx.auditLog.count({
            where: {
              organizationId: a,
              actorMembershipId: member,
              entityType: "Owner",
            },
          }),
          1,
        );
        passed.push("Prisma mutation audit records transaction membership");
        await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
        throw rolledBack;
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  } catch (error) {
    if (error !== rolledBack) throw error;
  }
  stage = "pool reuse";
  const [context] = await database.prisma
    .$queryRaw`SELECT nullif(current_setting('ethos.organization_id',true),'') AS organization, nullif(current_setting('ethos.actor_membership_id',true),'') AS actor, current_setting('role',true) AS role`;
  assert.equal(context.organization, null);
  assert.equal(context.actor, null);
  assert.equal(context.role, "none");
  assert.equal(
    await database.prisma.organization.count({ where: { id: { in: [a, b] } } }),
    0,
  );
  const [roles] = await database.prisma
    .$queryRaw`SELECT count(*)::int AS count FROM pg_roles WHERE rolname=${role}`;
  assert.equal(roles.count, 0);
  passed.push(
    "single-connection pool retains no organization, actor or role after rollback",
  );
  passed.push("Prisma fixtures and temporary role rolled back");
  // No fixtures or grants are committed: only transaction-local settings.
  stage = "context after commit";
  await database.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('ethos.organization_id',${a},true), set_config('ethos.actor_membership_id',${member},true)`;
  });
  const [committedContext] = await database.prisma.$queryRaw`
    SELECT nullif(current_setting('ethos.organization_id',true),'') AS organization,
           nullif(current_setting('ethos.actor_membership_id',true),'') AS actor
  `;
  assert.equal(committedContext.organization, null);
  assert.equal(committedContext.actor, null);
  passed.push(
    "transaction-local context clears on commit without committing fixtures",
  );
  if (process.argv.includes("--report")) {
    const path = new URL("../../../docs/etapa-0.8-tests.json", import.meta.url);
    const report = JSON.parse(readFileSync(path, "utf8"));
    report.contextIntegration = { passed: passed.length, checks: passed };
    writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  }
  console.log(
    JSON.stringify(
      { ok: true, passed: passed.length, checks: passed },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      stage,
      code:
        typeof error?.code === "string" ? error.code : "CONTEXT_CHECK_FAILED",
      message: redact(String(error?.message ?? "check failed"), process.env),
    }),
  );
  process.exitCode = 1;
} finally {
  await database.disconnect();
}
