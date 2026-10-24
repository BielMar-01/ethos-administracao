import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { securityFixture } from "./helpers/security-fixtures.mjs";
import { withOrganization } from "@ethos/database";
import { BusinessService } from "../dist/business/service.js";

test("transactional revisions and durable idempotency in isolated PostgreSQL", async () => {
  const f = await securityFixture();
  const checks = [];
  try {
    const a = await f.account("ADMIN_ORGANIZACAO"),
      b = await f.account("ADMIN_ORGANIZACAO");
    const send = async (actor, path, method, body, key, match, expected) => {
      const r = await f.app.inject({
        url: `/api/v1/${path}`,
        method,
        payload: body,
        headers: {
          cookie: actor.cookie,
          origin: "http://localhost:3000",
          "x-csrf-token": actor.csrf,
          "x-ethos-context": actor.org,
          ...(key ? { "idempotency-key": key } : {}),
          ...(match ? { "if-match": match } : {}),
        },
      });
      assert.equal(
        r.statusCode,
        expected,
        `${method} ${path}: ${r.statusCode} ${r.json().error?.code ?? ""}`,
      );
      return r.json();
    };
    const key = randomUUID(),
      payload = { name: "Consistency fixture", kind: "INDIVIDUAL" };
    await send(a, "owners", "POST", payload, undefined, undefined, 428);
    const created = (
      await send(a, "owners", "POST", payload, key, undefined, 201)
    ).data;
    assert.ok(created._etag);
    const replay = (
      await send(a, "owners", "POST", payload, key, undefined, 201)
    ).data;
    assert.equal(replay.id, created.id);
    await send(
      a,
      "owners",
      "POST",
      { ...payload, name: "Different" },
      key,
      undefined,
      409,
    );
    checks.push(
      "missing key blocked",
      "identical replay returns same record",
      "different input blocked",
    );
    await send(
      a,
      `owners/${created.id}`,
      "PATCH",
      { name: "Changed" },
      randomUUID(),
      undefined,
      428,
    );
    const updated = (
      await send(
        a,
        `owners/${created.id}`,
        "PATCH",
        { name: "Changed" },
        randomUUID(),
        created._etag,
        200,
      )
    ).data;
    assert.notEqual(updated._etag, created._etag);
    await send(
      a,
      `owners/${created.id}`,
      "PATCH",
      { name: "Stale" },
      randomUUID(),
      created._etag,
      412,
    );
    await send(
      b,
      `owners/${created.id}`,
      "PATCH",
      { name: "Foreign" },
      randomUUID(),
      updated._etag,
      404,
    );
    checks.push(
      "If-Match required",
      "stale edit blocked",
      "foreign organization blocked",
    );
    const parallelKey = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        send(a, "owners", "POST", payload, parallelKey, undefined, 201),
      ),
    );
    assert.equal(results[0].data.id, results[1].data.id);
    assert.equal(
      await f.admin.mutationReceipt.count({ where: { organizationId: a.org } }),
      3,
    );
    assert.equal(
      await f.admin.owner.count({ where: { organizationId: a.org } }),
      2,
    );
    checks.push(
      "concurrent retries create one effect and one receipt",
      "failed requests leave no receipt",
    );
    const foreignSameKey = (
      await send(b, "owners", "POST", payload, key, undefined, 201)
    ).data;
    assert.notEqual(foreignSameKey.id, created.id);
    checks.push("idempotency keys scoped to organization and membership");
    const race = await Promise.all(
      ["Winner A", "Winner B"].map((name) =>
        f.app.inject({
          url: `/api/v1/owners/${created.id}`,
          method: "PATCH",
          payload: { name },
          headers: {
            cookie: a.cookie,
            origin: "http://localhost:3000",
            "x-csrf-token": a.csrf,
            "x-ethos-context": a.org,
            "idempotency-key": randomUUID(),
            "if-match": updated._etag,
          },
        }),
      ),
    );
    assert.deepEqual(race.map((r) => r.statusCode).sort(), [200, 412]);
    checks.push("competing editors cannot overwrite the winning revision");
    const property = (
      await f.request(
        a,
        "properties",
        "POST",
        {
          code: randomUUID(),
          name: "Isolated",
          kind: "RESIDENTIAL",
          address: {},
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
        { name: "Isolated", kind: "INDIVIDUAL" },
        201,
      )
    ).data;
    const lease = (
      await f.request(
        a,
        "leases",
        "POST",
        {
          code: randomUUID(),
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
        { code: randomUUID(), leaseId: lease.id },
        201,
      )
    ).data;
    const versionKey = randomUUID(),
      versionBody = {
        contractId: contract.id,
        content: { text: "Isolated retry" },
        validFrom: "2030-01-01",
      };
    const versions = await Promise.all(
      [1, 2].map(() =>
        send(a, "versions", "POST", versionBody, versionKey, undefined, 201),
      ),
    );
    assert.equal(versions[0].data.id, versions[1].data.id);
    assert.equal(
      await f.admin.contractVersion.count({
        where: { organizationId: a.org, contractId: contract.id },
      }),
      1,
    );
    checks.push(
      "concurrent contract version replay creates exactly one historical version",
    );
    const current = (await f.request(a, `owners/${created.id}`)).data;
    const settings = (await f.request(a, "settings")).data;
    await send(
      a,
      "settings",
      "PATCH",
      { name: "Safe settings" },
      randomUUID(),
      settings._etag,
      200,
    );
    await send(
      a,
      "settings",
      "PATCH",
      { name: "Stale settings" },
      randomUUID(),
      settings._etag,
      412,
    );
    assert.notEqual(current._etag, updated._etag);
    await f.admin.organizationMembership.update({
      where: { id: a.membership.id },
      data: { status: "SUSPENDED" },
    });
    await send(a, "owners", "POST", payload, key, undefined, 401);
    checks.push(
      "settings reject stale edits",
      "revoked session cannot replay a receipt",
    );
    const context = { organizationId: b.org, userId: b.user.id };
    const forbidden = [
      `DELETE FROM ethos_technical."MutationReceipt"`,
      `UPDATE ethos_technical."MutationReceipt" SET "inputHash" = repeat('0',64)`,
      `UPDATE ethos_technical."ResourceRevision" SET "organizationId" = '${a.org}'::uuid`,
    ];
    for (const sql of forbidden)
      await assert.rejects(
        withOrganization(f.tenant, context, (tx) => tx.$executeRawUnsafe(sql)),
      );
    const visible = await withOrganization(f.tenant, context, (tx) =>
      tx.mutationReceipt.findMany(),
    );
    assert.ok(
      visible.every(
        (r) => r.organizationId === b.org && r.membershipId === b.membership.id,
      ),
    );
    assert.equal(await f.tenant.mutationReceipt.count(), 0);
    const flags = await f.admin
      .$queryRaw`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ethos_technical' AND relname IN ('ResourceRevision','MutationReceipt')`;
    assert.equal(flags.length, 2);
    assert.ok(flags.every((r) => r.relrowsecurity && r.relforcerowsecurity));
    checks.push(
      "technical receipts deny UPDATE and DELETE",
      "revision identity columns protected",
      "technical RLS denies missing context and foreign organizations",
    );
    const colleague = await f.account("GESTOR", b.org);
    assert.equal(
      await withOrganization(
        f.tenant,
        { organizationId: b.org, userId: colleague.user.id },
        (tx) => tx.mutationReceipt.count(),
      ),
      0,
    );
    const ownReplayScope = (
      await send(colleague, "owners", "POST", payload, key, undefined, 201)
    ).data;
    assert.notEqual(ownReplayScope.id, foreignSameKey.id);
    checks.push("same organization receipts are private to their membership");
    const beforeFailure = {
      owners: await f.admin.owner.count({ where: { organizationId: b.org } }),
      receipts: await f.admin.mutationReceipt.count({
        where: { organizationId: b.org },
      }),
      revisions: await f.admin.resourceRevision.count({
        where: { organizationId: b.org },
      }),
    };
    const originalNotify = BusinessService.prototype.notify;
    try {
      // Explicit fault injection after the real INSERT, before receipt commit.
      BusinessService.prototype.notify = async () => {
        throw Error("INJECTED_POST_INSERT_FAILURE");
      };
      await send(
        b,
        "owners",
        "POST",
        { ...payload, name: "Rolled back fault" },
        randomUUID(),
        undefined,
        500,
      );
    } finally {
      BusinessService.prototype.notify = originalNotify;
    }
    assert.deepEqual(
      {
        owners: await f.admin.owner.count({ where: { organizationId: b.org } }),
        receipts: await f.admin.mutationReceipt.count({
          where: { organizationId: b.org },
        }),
        revisions: await f.admin.resourceRevision.count({
          where: { organizationId: b.org },
        }),
      },
      beforeFailure,
    );
    checks.push(
      "injected post-insert application failure rolls back effect, revision and receipt",
    );
    writeFileSync(
      new URL(
        "../../../docs/etapa-0.11-consistency-tests.json",
        import.meta.url,
      ),
      JSON.stringify({ isolated: true, passed: true, checks }, null, 2) + "\n",
    );
  } finally {
    await f.close();
  }
});
