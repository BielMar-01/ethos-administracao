import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createDatabaseClient } from "@ethos/database";
import { buildApp } from "../dist/app.js";
import { AuthService } from "../dist/auth/mfa.js";
import { hashPassword } from "../dist/auth/security.js";
import { provisionRoles } from "../dist/auth/provisioning.js";

const base =
  process.env.ETHOS_AUTH_TEST_DATABASE_URL ??
  "postgresql://postgres:ethos-local-disposable@127.0.0.1:55439/ethos_auth_test";
const parsed = new URL(base);
if (
  !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
  parsed.pathname !== "/ethos_auth_test"
)
  throw Error("ISOLATED_DATABASE_REQUIRED");
const connection = (name, password) => {
  const u = new URL(base);
  u.username = name;
  u.password = password;
  return u.toString();
};
const admin = createDatabaseClient({
    connectionString: base,
    allowLocalPlaintext: true,
  }),
  identity = createDatabaseClient({
    connectionString: connection(
      "ethos_auth_runtime",
      "ethos-runtime-test-only",
    ),
    allowLocalPlaintext: true,
  }),
  tenant = createDatabaseClient({
    connectionString: connection(
      "ethos_tenant_runtime",
      "ethos-tenant-test-only",
    ),
    allowLocalPlaintext: true,
    maxConnections: 4,
  });
const deps = {
  identity: identity.prisma,
  tenant: tenant.prisma,
  cookieSecret: "isolated-business-cookie-secret-at-least-32",
  encryptionKey: Buffer.alloc(32, 7),
  origin: "http://localhost:3000",
  production: false,
  deliver: async () => {},
  rateLimitMax: 10000,
};
const auth = new AuthService(deps);
let app;
const checks = [];
const ids = {};
async function fixture(role = "ADMIN_ORGANIZACAO", organizationId) {
  const org =
    organizationId ??
    (
      await admin.prisma.organization.create({
        data: { name: "Integration fixture", slug: randomUUID() },
      })
    ).id;
  const user = await admin.prisma.user.create({
    data: {
      email: `${randomUUID()}@example.invalid`,
      displayName: "Fixture",
      credential: {
        create: {
          passwordHash: await hashPassword("Fixture!Pass2026"),
          emailVerifiedAt: new Date(),
        },
      },
    },
  });
  const member = await admin.prisma.organizationMembership.create({
    data: { organizationId: org, userId: user.id, status: "ACTIVE" },
  });
  await provisionRoles(
    admin.prisma,
    org,
    role === "ADMIN_ORGANIZACAO" ? member.id : undefined,
  );
  if (role !== "ADMIN_ORGANIZACAO") {
    const assigned = await admin.prisma.role.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: org, code: role } },
    });
    await admin.prisma.membershipRole.create({
      data: {
        organizationId: org,
        membershipId: member.id,
        roleId: assigned.id,
      },
    });
  }
  const csrf = "business-csrf-fixture",
    issued = await auth.createSession(user.id, csrf, "integration");
  await auth.selectOrganization(await auth.authenticate(issued.access), org);
  return {
    org,
    user,
    member,
    cookie: `ethos_access=${issued.access}; ethos_csrf=${encodeURIComponent(app.signCookie(csrf))}`,
    csrf,
  };
}
async function request(
  account,
  path,
  method = "GET",
  payload,
  expected = 200,
  headers = {},
) {
  const consistency =
    method !== "GET" ? { "idempotency-key": randomUUID() } : {};
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
  const result = await app.inject({
    url: `/api/v1/${path}`,
    method,
    payload,
    headers: {
      cookie: account.cookie,
      origin: deps.origin,
      "x-csrf-token": account.csrf,
      "x-ethos-context": account.org,
      ...consistency,
      ...headers,
    },
  });
  const body = result.json();
  assert.equal(
    result.statusCode,
    expected,
    `${method} ${path}: ${JSON.stringify(body)}`,
  );
  return body;
}
async function check(name, fn) {
  await fn();
  checks.push(name);
}
test("business integration with restricted runtime, HTTP, persistence and tenant isolation", async () => {
  const require = createRequire(
    new URL("../../../packages/database/package.json", import.meta.url),
  );
  const pg = require("pg");
  const sql = new pg.Client({ connectionString: base, ssl: false });
  await sql.connect();
  try {
    await sql.query(
      readFileSync(
        new URL(
          "../../../packages/database/scripts/propose-business-runtime.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  } finally {
    await sql.end();
  }
  app = await buildApp({ auth: deps, logger: false });
  await app.ready();
  const a = await fixture(),
    b = await fixture();
  await check("empty real lists and strict pagination", async () => {
    const result = await request(a, "owners");
    assert.equal(result.meta.total, 0);
    assert.deepEqual(result.data, []);
    await request(a, "owners?pageSize=101", "GET", undefined, 400);
    await request(a, "owners?sort=arbitrary", "GET", undefined, 400);
  });
  await check(
    "owners create, edit, detail, search and persistence",
    async () => {
      ids.owner = (
        await request(
          a,
          "owners",
          "POST",
          {
            name: "Ana fixture",
            kind: "INDIVIDUAL",
            email: "ana@example.invalid",
          },
          201,
        )
      ).data.id;
      await request(a, `owners/${ids.owner}`, "PATCH", {
        phone: "11999990000",
      });
      assert.equal(
        (await request(a, `owners/${ids.owner}`)).data.phone,
        "11999990000",
      );
      assert.equal(
        (await request(a, "owners?q=Ana&pageSize=1&sort=name&direction=asc"))
          .meta.total,
        1,
      );
      assert.equal(
        await admin.prisma.owner.count({
          where: { id: ids.owner, organizationId: a.org },
        }),
        1,
      );
    },
  );
  await check("unknown/protected fields and CSRF fail closed", async () => {
    await request(
      a,
      "owners",
      "POST",
      { name: "Injected", kind: "INDIVIDUAL", organizationId: b.org },
      400,
    );
    await request(
      a,
      `owners/${ids.owner}`,
      "PATCH",
      { createdAt: new Date().toISOString() },
      400,
    );
    await request(
      a,
      "owners",
      "POST",
      { name: "No CSRF", kind: "INDIVIDUAL" },
      403,
      { "x-csrf-token": "wrong" },
    );
    await request(
      a,
      "owners",
      "POST",
      { name: "Wrong origin", kind: "INDIVIDUAL" },
      403,
      { origin: "https://evil.invalid" },
    );
  });
  await check(
    "cross-tenant read/update and stale-context requests denied",
    async () => {
      await request(b, `owners/${ids.owner}`, "GET", undefined, 404);
      await request(
        b,
        `owners/${ids.owner}`,
        "PATCH",
        { name: "Foreign" },
        404,
      );
      await request(a, "owners", "GET", undefined, 409, {
        "x-ethos-context": b.org,
      });
      assert.equal((await request(b, "owners")).meta.total, 0);
    },
  );
  await check(
    "properties create their main unit and coproprietor relation",
    async () => {
      ids.property = (
        await request(
          a,
          "properties",
          "POST",
          {
            code: "P-1",
            name: "Property fixture",
            kind: "RESIDENTIAL",
            address: { street: "Fixture", city: "Fixture", state: "SP" },
          },
          201,
        )
      ).data.id;
      const units = await request(a, `units?parentId=${ids.property}`);
      assert.equal(units.data.length, 1);
      ids.unit = units.data[0].id;
      assert.equal(units.data[0].isMain, true);
      await request(
        a,
        "ownerships",
        "POST",
        {
          propertyId: ids.property,
          ownerId: ids.owner,
          percentage: "100.0000",
          startsOn: "2030-01-01",
        },
        201,
      );
      await request(
        b,
        "ownerships",
        "POST",
        {
          propertyId: ids.property,
          ownerId: ids.owner,
          percentage: "50",
          startsOn: "2030-01-01",
        },
        404,
      );
    },
  );
  await check(
    "tenant, lease, participants and activation preserve original terms",
    async () => {
      ids.tenant = (
        await request(
          a,
          "tenants",
          "POST",
          { name: "Tenant fixture", kind: "INDIVIDUAL" },
          201,
        )
      ).data.id;
      ids.lease = (
        await request(
          a,
          "leases",
          "POST",
          {
            code: "L-1",
            unitId: ids.unit,
            primaryTenantId: ids.tenant,
            startsOn: "2030-01-01",
            endsOn: "2030-12-31",
            baseRent: "1234.56",
            dueDay: 10,
          },
          201,
        )
      ).data.id;
      assert.equal(
        (await request(a, `participants?parentId=${ids.lease}`)).data[0].role,
        "PRIMARY",
      );
      await request(a, `leases/${ids.lease}/activate`, "POST", {});
      await request(
        a,
        `leases/${ids.lease}`,
        "PATCH",
        { baseRent: "999.00" },
        409,
      );
      await request(a, `units/${ids.unit}/archive`, "POST", {}, 409);
      assert.equal(
        (await request(a, `leases/${ids.lease}`)).data.baseRent,
        "1234.56",
      );
    },
  );
  await check(
    "read_own and financial roles cannot enter broad administrative writes",
    async () => {
      for (const role of ["PROPRIETARIO", "INQUILINO"]) {
        const external = await fixture(role, a.org);
        await request(external, "owners", "GET", undefined, 403);
        await request(external, "leases", "GET", undefined, 403);
        await request(
          external,
          "owners",
          "POST",
          { name: "Forbidden", kind: "INDIVIDUAL" },
          403,
        );
      }
      const financial = await fixture("FINANCEIRO", a.org);
      await request(
        financial,
        "owners",
        "POST",
        { name: "Forbidden", kind: "INDIVIDUAL" },
        403,
      );
    },
  );
  await check(
    "archive preserves database row and restricts new relationships",
    async () => {
      const row = (
        await request(
          a,
          "owners",
          "POST",
          { name: "Archive fixture", kind: "COMPANY" },
          201,
        )
      ).data;
      await request(a, `owners/${row.id}/archive`, "POST", {});
      assert((await request(a, `owners/${row.id}`)).data.archivedAt);
      assert.equal(
        (await request(a, "owners?archived=true")).data[0].id,
        row.id,
      );
      assert.equal(
        await admin.prisma.owner.count({ where: { id: row.id } }),
        1,
      );
    },
  );

  await check(
    "contract versions are append-only and concurrent versions remain unique",
    async () => {
      ids.contract = (
        await request(
          a,
          "contracts",
          "POST",
          { leaseId: ids.lease, code: "C-1" },
          201,
        )
      ).data.id;
      ids.version = (
        await request(
          a,
          "versions",
          "POST",
          {
            contractId: ids.contract,
            content: { text: "Contract fixture" },
            validFrom: "2030-01-01",
          },
          201,
        )
      ).data.id;
      await request(
        a,
        `versions/${ids.version}`,
        "PATCH",
        { content: { text: "Rewrite" } },
        409,
      );
      const concurrent = await Promise.all(
        [1, 2].map((n) =>
          request(
            a,
            "versions",
            "POST",
            {
              contractId: ids.contract,
              content: { text: `Revision ${n}` },
              validFrom: "2030-01-02",
            },
            201,
          ),
        ),
      );
      assert.notEqual(concurrent[0].data.version, concurrent[1].data.version);
      await request(a, `contracts/${ids.contract}/sign`, "POST", {});
    },
  );
  await check(
    "renewals trace successor leases and adjustments preserve base rent",
    async () => {
      const adjustment = (
        await request(
          a,
          "adjustments",
          "POST",
          {
            leaseId: ids.lease,
            effectiveOn: "2030-06-01",
            newRent: "1300.00",
            indexName: "Fixture",
          },
          201,
        )
      ).data;
      assert.equal(adjustment.previousRent, "1234.56");
      await request(a, `adjustments/${adjustment.id}/approve`, "POST", {});
      await request(a, `adjustments/${adjustment.id}/apply`, "POST", {});
      assert.equal(
        (await request(a, `leases/${ids.lease}`)).data.baseRent,
        "1234.56",
      );
      const renewal = (
        await request(
          a,
          "renewals",
          "POST",
          {
            leaseId: ids.lease,
            startsOn: "2031-01-01",
            endsOn: "2031-12-31",
            newRent: "1400.00",
          },
          201,
        )
      ).data;
      assert(renewal.successorLeaseId);
      await request(
        a,
        `leases/${renewal.successorLeaseId}/activate`,
        "POST",
        {},
        409,
      );
      await request(a, `renewals/${renewal.id}/approve`, "POST", {});
      await request(a, `renewals/${renewal.id}/apply`, "POST", {});
      assert.equal(
        (await request(a, `leases/${renewal.successorLeaseId}`)).data.status,
        "DRAFT",
      );
    },
  );
  await check(
    "inspections, final reports, maintenance and metadata preserve history",
    async () => {
      ids.inspection = (
        await request(
          a,
          "inspections",
          "POST",
          {
            unitId: ids.unit,
            leaseId: ids.lease,
            kind: "ENTRY",
            scheduledAt: "2030-01-02T12:00:00Z",
          },
          201,
        )
      ).data.id;
      ids.report = (
        await request(
          a,
          "inspection-reports",
          "POST",
          { inspectionId: ids.inspection, content: { text: "Report fixture" } },
          201,
        )
      ).data.id;
      await request(a, `inspection-reports/${ids.report}`, "PATCH", {
        content: { text: "Updated draft" },
      });
      await request(a, `inspection-reports/${ids.report}/finalize`, "POST", {});
      await request(
        a,
        `inspection-reports/${ids.report}`,
        "PATCH",
        { content: { text: "Forbidden" } },
        409,
      );
      ids.maintenance = (
        await request(
          a,
          "maintenance",
          "POST",
          {
            unitId: ids.unit,
            leaseId: ids.lease,
            title: "Fixture repair",
            description: "Repair details",
            category: "Electrical",
            priority: "NORMAL",
            estimatedCost: "50.00",
          },
          201,
        )
      ).data.id;
      await request(a, `maintenance/${ids.maintenance}/start`, "POST", {});
      await request(a, `maintenance/${ids.maintenance}`, "PATCH", {
        actualCost: "49.99",
      });
      await request(a, `maintenance/${ids.maintenance}/complete`, "POST", {});
      await request(
        a,
        `maintenance/${ids.maintenance}`,
        "PATCH",
        { actualCost: "5.00" },
        409,
      );
      ids.document = (
        await request(
          a,
          "documents",
          "POST",
          {
            kind: "PHOTO",
            originalName: "fixture.png",
            mimeType: "image/png",
            sha256: "a".repeat(64),
            sizeBytes: 100,
            unitId: ids.unit,
          },
          201,
        )
      ).data.id;
      assert.equal(
        (
          await request(
            a,
            `documents?parentResource=units&parentId=${ids.unit}`,
          )
        ).data.length,
        1,
      );
      await request(a, "documents", "GET", undefined, 400);
      await request(b, `documents/${ids.document}`, "GET", undefined, 404);
      await request(
        a,
        "photos",
        "POST",
        {
          documentId: ids.document,
          unitId: ids.unit,
          caption: "Fixture",
          sortOrder: 0,
        },
        201,
      );
    },
  );
  await check(
    "financial issue, exact allocation, receipt and reversal preserve history",
    async () => {
      ids.charge = (
        await request(
          a,
          "charges",
          "POST",
          {
            leaseId: ids.lease,
            code: "CH-1",
            kind: "RENT",
            competence: "2030-01-01",
            amount: "1234.56",
          },
          201,
        )
      ).data.id;
      await request(a, `charges/${ids.charge}/issue`, "POST", {}, 409);
      ids.installment = (
        await request(
          a,
          "installments",
          "POST",
          {
            chargeId: ids.charge,
            number: 1,
            dueOn: "2030-01-10",
            amount: "1234.56",
          },
          201,
        )
      ).data.id;
      await request(a, `charges/${ids.charge}/issue`, "POST", {});
      await request(
        a,
        `installments/${ids.installment}`,
        "PATCH",
        { amount: "100.00" },
        409,
      );
      ids.payment = (
        await request(
          a,
          "payments",
          "POST",
          {
            leaseId: ids.lease,
            code: "PAY-1",
            amount: "1234.56",
            method: "PIX",
            paidAt: "2020-01-10T12:00:00Z",
          },
          201,
        )
      ).data.id;
      await request(
        a,
        "allocations",
        "POST",
        {
          paymentId: ids.payment,
          installmentId: ids.installment,
          amount: "1234.56",
        },
        409,
      );
      await request(a, `payments/${ids.payment}/confirm`, "POST", {});
      await request(
        a,
        "allocations",
        "POST",
        {
          paymentId: ids.payment,
          installmentId: ids.installment,
          amount: "1234.56",
        },
        201,
      );
      await request(
        a,
        "allocations",
        "POST",
        {
          paymentId: ids.payment,
          installmentId: ids.installment,
          amount: "0.01",
        },
        409,
      );
      await request(
        b,
        "allocations",
        "POST",
        {
          paymentId: ids.payment,
          installmentId: ids.installment,
          amount: "1.00",
        },
        404,
      );
      const receipt = (
        await request(
          a,
          "receipts",
          "POST",
          { paymentId: ids.payment, number: "R-1" },
          201,
        )
      ).data;
      assert.equal(receipt.snapshot.amount, "1234.56");
      const summary = (
        await request(a, "finance/summary?from=2030-01-01&to=2030-01-31")
      ).data;
      assert.equal(summary.finance.allocated, "1234.56");
      assert.equal(summary.finance.outstanding, "0");
      await request(
        a,
        `payments/${ids.payment}/reverse`,
        "POST",
        { reason: "Correction fixture" },
        409,
      );
      await request(a, `receipts/${receipt.id}/void`, "POST", {
        reason: "Correction fixture",
      });
      await request(a, `payments/${ids.payment}/reverse`, "POST", {
        reason: "Correction fixture",
      });
      assert.equal(
        (await request(a, "finance/summary?from=2030-01-01&to=2030-01-31")).data
          .finance.outstanding,
        "1234.56",
      );
      assert.equal(
        await admin.prisma.paymentAllocation.count({
          where: { paymentId: ids.payment },
        }),
        1,
      );
    },
  );
  await check(
    "concurrent allocations cannot overpay an installment",
    async () => {
      const pays = await Promise.all(
        [1, 2].map(async (n) => {
          const p = (
            await request(
              a,
              "payments",
              "POST",
              {
                leaseId: ids.lease,
                code: `CONCURRENT-${n}`,
                amount: "1000.00",
                method: "PIX",
                paidAt: "2030-01-11T12:00:00Z",
              },
              201,
            )
          ).data;
          await request(a, `payments/${p.id}/confirm`, "POST", {});
          return p;
        }),
      );
      const results = await Promise.all(
        pays.map((p) =>
          app.inject({
            url: "/api/v1/allocations",
            method: "POST",
            payload: {
              paymentId: p.id,
              installmentId: ids.installment,
              amount: "1000.00",
            },
            headers: {
              cookie: a.cookie,
              origin: deps.origin,
              "x-csrf-token": a.csrf,
              "x-ethos-context": a.org,
              "idempotency-key": randomUUID(),
            },
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.statusCode).sort(), [201, 409]);
    },
  );
  await check(
    "dashboard and reports use persisted scoped data, empty means zero",
    async () => {
      const empty = (await request(b, "dashboard")).data;
      assert.equal(empty.counts.properties, 0);
      assert.equal(empty.finance.expected, "0");
      assert.equal(
        (await request(a, "reports/occupancy")).data.counts.activeLeases,
        1,
      );
      await request(
        a,
        "finance/summary?from=2030-12-31&to=2030-01-01",
        "GET",
        undefined,
        400,
      );
      await request(a, "reports/not-a-report", "GET", undefined, 400);
    },
  );
  await check(
    "calendar is bounded, permission filtered and scoped",
    async () => {
      const path = "calendar?from=2030-01-01&to=2030-12-31";
      assert(
        (await request(a, path)).data.some((e) => e.id === ids.installment),
      );
      assert.equal((await request(b, path)).data.length, 0);
      await request(
        a,
        "calendar?from=2020-01-01&to=2040-01-01",
        "GET",
        undefined,
        400,
      );
    },
  );
  await check(
    "notifications are restricted to recipient, including same organization",
    async () => {
      const list = await request(a, "notifications");
      assert(list.meta.total > 0);
      const id = list.data[0].id;
      await request(a, `notifications/${id}/read`, "POST", {});
      assert(
        (await request(a, "notifications")).data.find((n) => n.id === id)
          .readAt,
      );
      const peer = await fixture("ADMIN_ORGANIZACAO", a.org);
      assert.equal((await request(peer, "notifications")).meta.total, 0);
      await request(peer, `notifications/${id}/read`, "POST", {}, 404);
      await request(b, `notifications/${id}/read`, "POST", {}, 404);
    },
  );
  await check(
    "settings persist safely without exposing security controls",
    async () => {
      await request(a, "settings", "PATCH", {
        name: "Updated fixture",
        timezone: "America/Sao_Paulo",
      });
      assert.equal((await request(a, "settings")).data.name, "Updated fixture");
      assert.notEqual(
        (await request(b, "settings")).data.name,
        "Updated fixture",
      );
      await request(a, "settings", "PATCH", { currency: "USD" }, 400);
      await request(a, "settings", "PATCH", { timezone: "Invalid/Zone" }, 400);
      const restricted = await fixture("FINANCEIRO", a.org);
      await request(
        restricted,
        "settings",
        "PATCH",
        { name: "Forbidden" },
        403,
      );
    },
  );
  await check(
    "missing runtime write grant fails closed without administrative fallback",
    async () => {
      const sql = new pg.Client({ connectionString: base, ssl: false });
      await sql.connect();
      try {
        await sql.query(
          'REVOKE INSERT (name) ON ethos."Owner" FROM ethos_tenant_runtime',
        );
        await request(
          a,
          "owners",
          "POST",
          { name: "Must not persist", kind: "INDIVIDUAL" },
          503,
        );
        assert.equal(
          await admin.prisma.owner.count({
            where: { organizationId: a.org, name: "Must not persist" },
          }),
          0,
        );
      } finally {
        await sql.query(
          readFileSync(
            new URL(
              "../../../packages/database/scripts/propose-business-runtime.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        await sql.end();
      }
    },
  );
  writeFileSync(
    new URL("../../../docs/etapa-0.10-api-tests.json", import.meta.url),
    JSON.stringify(
      {
        isolated: true,
        realSupabaseUnchanged: true,
        passed: checks.length,
        checks,
      },
      null,
      2,
    ),
  );
});
test.after(async () => {
  await app?.close();
  await Promise.all([
    admin.disconnect(),
    identity.disconnect(),
    tenant.disconnect(),
  ]);
});
