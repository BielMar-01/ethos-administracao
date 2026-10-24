import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { securityFixture } from "./helpers/security-fixtures.mjs";
import { totp } from "../dist/auth/security.js";
const f = await securityFixture(),
  matrix = [];
test.after(async () => {
  await f.close();
  writeFileSync(
    new URL(
      "../../../docs/etapa-0.11-authorization-tests.json",
      import.meta.url,
    ),
    JSON.stringify(
      { isolated: true, assertions: matrix.length, matrix },
      null,
      2,
    ),
  );
});
const groups = {
  owners: "owners",
  properties: "properties",
  units: "properties",
  ownerships: "properties",
  photos: "properties",
  tenants: "tenants",
  leases: "leases",
  participants: "leases",
  renewals: "leases",
  adjustments: "leases",
  contracts: "contracts",
  versions: "contracts",
  charges: "finance",
  installments: "finance",
  payments: "finance",
  allocations: "finance",
  receipts: "finance",
  inspections: "inspections",
  "inspection-reports": "inspections",
  maintenance: "maintenance",
  documents: "properties",
  settings: "settings",
  dashboard: "dashboard",
  calendar: "calendar",
  reports: "reports",
  notifications: "notifications",
};
const financeRead = new Set([
  "owners",
  "tenants",
  "leases",
  "contracts",
  "finance",
  "dashboard",
  "reports",
  "notifications",
]);
const canRead = (role, group) =>
  role === "ADMIN_ORGANIZACAO" ||
  (role === "GESTOR" && group !== "settings") ||
  (role === "FINANCEIRO" && financeRead.has(group));
const canWrite = (role, group) =>
  role === "ADMIN_ORGANIZACAO" ||
  (role === "GESTOR" &&
    [
      "owners",
      "properties",
      "tenants",
      "leases",
      "contracts",
      "inspections",
      "maintenance",
      "calendar",
    ].includes(group)) ||
  (role === "FINANCEIRO" && group === "finance");
test("authorization matrix, IDOR, protected inputs and platform role boundaries", async () => {
  const a = await f.account("ADMIN_ORGANIZACAO"),
    b = await f.account("ADMIN_ORGANIZACAO");
  const owner = (
    await f.request(
      a,
      "owners",
      "POST",
      { name: "Matrix owner", kind: "INDIVIDUAL" },
      201,
    )
  ).data;
  const property = (
    await f.request(
      a,
      "properties",
      "POST",
      {
        code: "MATRIX-P",
        name: "Matrix property",
        kind: "RESIDENTIAL",
        address: { city: "Fixture" },
      },
      201,
    )
  ).data;
  const unit = (await f.request(a, `units?parentId=${property.id}`)).data[0];
  const tenant = (
    await f.request(
      a,
      "tenants",
      "POST",
      { name: "Matrix tenant", kind: "INDIVIDUAL" },
      201,
    )
  ).data;
  const lease = (
    await f.request(
      a,
      "leases",
      "POST",
      {
        code: "MATRIX-L",
        unitId: unit.id,
        primaryTenantId: tenant.id,
        startsOn: "2030-01-01",
        baseRent: "100.00",
        dueDay: 10,
      },
      201,
    )
  ).data;
  const contract = (
    await f.request(
      a,
      "contracts",
      "POST",
      { leaseId: lease.id, code: "MATRIX-C" },
      201,
    )
  ).data;
  const charge = (
    await f.request(
      a,
      "charges",
      "POST",
      {
        leaseId: lease.id,
        code: "MATRIX-CH",
        kind: "RENT",
        competence: "2030-01-01",
        amount: "100.00",
      },
      201,
    )
  ).data;
  const inspection = (
    await f.request(
      a,
      "inspections",
      "POST",
      { unitId: unit.id, kind: "ENTRY", scheduledAt: "2030-01-01T12:00:00Z" },
      201,
    )
  ).data;
  const maintenance = (
    await f.request(
      a,
      "maintenance",
      "POST",
      {
        unitId: unit.id,
        title: "Matrix repair",
        description: "Fixture",
        category: "General",
        priority: "NORMAL",
      },
      201,
    )
  ).data;
  const mutations = {
    owners: {
      id: owner.id,
      create: { name: "Denied", kind: "INDIVIDUAL" },
      patch: { name: "Denied" },
    },
    properties: {
      id: property.id,
      create: {
        code: "DENIED",
        name: "Denied",
        kind: "RESIDENTIAL",
        address: {},
      },
      patch: { name: "Denied" },
    },
    tenants: {
      id: tenant.id,
      create: { name: "Denied", kind: "INDIVIDUAL" },
      patch: { name: "Denied" },
    },
    leases: {
      id: lease.id,
      create: {
        code: "DENIED",
        unitId: unit.id,
        primaryTenantId: tenant.id,
        startsOn: "2030-01-01",
        baseRent: "100.00",
        dueDay: 10,
      },
      patch: {},
    },
    contracts: {
      id: contract.id,
      create: { leaseId: lease.id, code: "DENIED" },
      patch: { code: "DENIED" },
    },
    charges: {
      id: charge.id,
      create: {
        leaseId: lease.id,
        code: "DENIED",
        kind: "RENT",
        competence: "2030-01-01",
        amount: "100.00",
      },
      patch: { code: "DENIED" },
    },
    inspections: {
      id: inspection.id,
      create: {
        unitId: unit.id,
        kind: "ENTRY",
        scheduledAt: "2030-01-01T12:00:00Z",
      },
      patch: { kind: "EXIT" },
    },
    maintenance: {
      id: maintenance.id,
      create: {
        unitId: unit.id,
        title: "Denied",
        description: "Denied",
        category: "General",
        priority: "NORMAL",
      },
      patch: { title: "Denied" },
    },
  };
  for (const role of [
    "ADMIN_ORGANIZACAO",
    "GESTOR",
    "FINANCEIRO",
    "PROPRIETARIO",
    "INQUILINO",
  ]) {
    const account =
      role === "ADMIN_ORGANIZACAO" ? a : await f.account(role, a.org);
    for (const [resource, group] of Object.entries(groups)) {
      const path =
        resource === "documents"
          ? `documents?parentResource=units&parentId=${unit.id}`
          : resource === "calendar"
            ? "calendar?from=2030-01-01&to=2030-01-31"
            : resource === "reports"
              ? "reports/portfolio"
              : resource;
      const expected = canRead(role, group) ? 200 : 403;
      await f.request(account, path, "GET", undefined, expected);
      matrix.push({ role, resource, operation: "list", expected });
    }
    for (const [resource, sample] of Object.entries(mutations)) {
      if (!canWrite(role, groups[resource])) {
        await f.request(account, resource, "POST", sample.create, 403);
        await f.request(
          account,
          `${resource}/${sample.id}`,
          "PATCH",
          sample.patch,
          403,
        );
        matrix.push({
          role,
          resource,
          operation: "create/update denied",
          expected: 403,
        });
      }
    }
    if (role !== "ADMIN_ORGANIZACAO") {
      await f.request(account, "settings", "PATCH", { name: "Denied" }, 403);
      matrix.push({
        role,
        resource: "settings",
        operation: "update denied",
        expected: 403,
      });
    }
    if (role === "GESTOR") {
      const r = await f.request(
        account,
        "owners",
        "POST",
        { name: "Manager positive", kind: "INDIVIDUAL" },
        201,
      );
      await f.request(account, `owners/${r.data.id}`, "PATCH", {
        phone: "11999990000",
      });
      matrix.push({
        role,
        resource: "owners",
        operation: "create/update allowed",
        expected: 201,
      });
    }
    if (role === "FINANCEIRO") {
      const r = await f.request(
        account,
        "charges",
        "POST",
        {
          leaseId: lease.id,
          code: "FINANCE-POSITIVE",
          kind: "RENT",
          competence: "2030-02-01",
          amount: "1.00",
        },
        201,
      );
      await f.request(account, `charges/${r.data.id}`, "PATCH", {
        amount: "2.00",
      });
      matrix.push({
        role,
        resource: "charges",
        operation: "create/update allowed",
        expected: 201,
      });
    }
  }
  for (const [resource, sample] of Object.entries(mutations)) {
    await f.request(b, `${resource}/${sample.id}`, "GET", undefined, 404);
    await f.request(
      b,
      `${resource}/${sample.id}`,
      "PATCH",
      sample.patch,
      resource === "leases" ? 409 : 404,
    );
    matrix.push({
      role: "FOREIGN_ADMIN",
      resource,
      operation: "IDOR read/update blocked",
    });
  }
  await f.request(
    a,
    "owners",
    "POST",
    { name: "Injected", kind: "INDIVIDUAL", organizationId: b.org },
    400,
  );
  await f.request(
    a,
    `owners/${owner.id}`,
    "PATCH",
    { organizationId: b.org },
    400,
  );
  assert.equal(
    (
      await f.request(
        b,
        "owners?page=1&pageSize=1&q=Matrix&sort=name&direction=desc",
      )
    ).meta.total,
    0,
  );
  await f.request(a, "owners", "GET", undefined, 409, {
    "x-ethos-context": b.org,
  });
  await f.request(a, "owners?sort=internal_secret", "GET", undefined, 400);
  matrix.push({
    role: "ADMIN",
    resource: "owners",
    operation: "mass assignment, stale context and unsafe sort blocked",
  });
  const superUser = await f.account();
  await f.admin.platformAccessGrant.create({
    data: {
      userId: superUser.user.id,
      grantedByUserId: superUser.user.id,
      role: "SUPER_ADMIN",
      reason: "Isolated matrix privilege test",
    },
  });
  const session = await f.auth.createSession(
    superUser.user.id,
    superUser.csrf,
    "platform fixture",
  );
  const setup = await f.auth.setupMfa(
    await f.auth.authenticate(session.access, true),
  );
  await f.auth.verifyMfa(
    await f.auth.authenticate(session.access, true),
    totp(setup.secret).generate({ timestamp: Date.now() }),
    true,
  );
  await assert.rejects(
    f.auth.selectOrganization(await f.auth.authenticate(session.access), a.org),
    (e) => e.code === "ACCESS_DENIED",
  );
  const platform = {
    ...superUser,
    ...session,
    cookie: `ethos_access=${session.access}; ethos_csrf=${encodeURIComponent(f.app.signCookie(superUser.csrf))}`,
  };
  await f.request(platform, "owners", "GET", undefined, 409);
  matrix.push({
    role: "SUPER_ADMIN",
    resource: "organization administration",
    operation: "MFA verified, no implicit membership or tenant bypass",
  });
});
