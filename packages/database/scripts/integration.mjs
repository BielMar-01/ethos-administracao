// Explicit opt-in integration checks. Every fixture, temporary role and rehearsal DDL is rolled back.
import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { poolConfiguration } from "../dist/settings.js";
import { redact } from "./redact.mjs";

config({ path: new URL("../.env", import.meta.url), quiet: true });
const rehearsal = process.argv.includes("--rehearsal");
const c = new pg.Client(
  poolConfiguration(
    process.env.DIRECT_DATABASE_URL,
    1,
    process.env.ETHOS_LOCAL_DATABASE === "1",
  ),
);
const role = `ethos_test_${randomUUID().replaceAll("-", "")}`;
const ids = Object.fromEntries(
  [
    "a",
    "b",
    "user",
    "member",
    "memberB",
    "property",
    "propertyB",
    "unit",
    "unitB",
    "owner1",
    "owner2",
    "owner3",
    "tenant1",
    "tenant2",
    "tenant3",
    "lease",
    "leaseB",
    "contract",
    "version",
    "charge",
    "installment",
    "installment2",
    "payment",
    "allocation",
    "receipt",
    "inspection",
    "report",
    "document",
    "maintenance",
    "orgRole",
    "permission",
  ].map((k) => [k, randomUUID()]),
);
const q = (sql, values = []) => c.query(sql, values);
let stage = "connect";
const passed = [];
const catalogSQL = `SELECT n.nspname,c.relname,c.relkind,c.oid FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
 WHERE n.nspname NOT IN ('pg_catalog','information_schema','ethos_technical','ethos') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY 1,2,3`;
const digest = (rows) =>
  createHash("sha256").update(JSON.stringify(rows)).digest("hex");
const insert = async (table, data) => {
  stage = `insert ${table}`;
  const entries = Object.entries({ id: randomUUID(), ...data });
  await q(
    `INSERT INTO ethos."${table}" (${entries.map(([k]) => `"${k}"`).join(",")}) VALUES (${entries.map((_, i) => `$${i + 1}`).join(",")})`,
    entries.map(([, v]) => v),
  );
};
async function check(name, fn) {
  stage = name;
  await q("SAVEPOINT test_case");
  try {
    await fn();
    await q("SET CONSTRAINTS ALL IMMEDIATE");
    passed.push(name);
  } finally {
    await q("ROLLBACK TO SAVEPOINT test_case");
    await q("RELEASE SAVEPOINT test_case");
  }
}
async function rejects(sql, values, code) {
  await q("SAVEPOINT expected_failure");
  let actual;
  try {
    await q(sql, values);
    await q("SET CONSTRAINTS ALL IMMEDIATE");
  } catch (error) {
    actual = error.code;
  } finally {
    await q("ROLLBACK TO SAVEPOINT expected_failure");
    await q("RELEASE SAVEPOINT expected_failure");
  }
  assert.equal(actual, code, "Expected PostgreSQL constraint/policy violation");
}
try {
  await c.connect();
  const before = (await q(catalogSQL)).rows;
  await q("BEGIN");
  if (rehearsal) {
    stage = "migration rehearsal";
    assert.equal(
      (await q("SELECT to_regnamespace('ethos') IS NULL AS absent")).rows[0]
        .absent,
      true,
      "Rehearsal requires absent application schema",
    );
    const sql = readFileSync(
      new URL(
        "../prisma/migrations/20261022010000_multi_tenant_model/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(sql, /^BEGIN;/);
    assert.match(sql, /COMMIT;\s*$/);
    await q(sql.replace(/^BEGIN;/, "").replace(/COMMIT;\s*$/, ""));
  }
  stage = "temporary unprivileged role";
  // Generated identifier contains only [a-z0-9_]. No existing roles are changed.
  await q(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`);
  await q(`GRANT ${role} TO CURRENT_USER`);
  await q(`GRANT USAGE ON SCHEMA ethos TO ${role}`);
  await q(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ethos TO ${role}`,
  );
  await q(
    `GRANT EXECUTE ON FUNCTION ethos.current_organization_id() TO ${role}`,
  );
  stage = "isolated fixtures";
  for (const [id, slug] of [
    [ids.a, "test-a"],
    [ids.b, "test-b"],
  ])
    await insert("Organization", {
      id,
      name: slug,
      slug: `${slug}-${randomUUID()}`,
    });
  await insert("User", {
    id: ids.user,
    email: `${randomUUID()}@example.invalid`,
    displayName: "Isolated test",
  });
  for (const [org, id] of [
    [ids.a, ids.member],
    [ids.b, ids.memberB],
  ])
    await insert("OrganizationMembership", {
      id,
      organizationId: org,
      userId: ids.user,
      status: "ACTIVE",
    });
  await insert("OrganizationSettings", { organizationId: ids.a });
  await insert("Permission", {
    id: ids.permission,
    code: `test.${randomUUID()}`,
    description: "Test only",
  });
  await insert("Role", {
    id: ids.orgRole,
    organizationId: ids.a,
    code: "MANAGER",
    name: "Manager",
  });
  await insert("MembershipRole", {
    organizationId: ids.a,
    membershipId: ids.member,
    roleId: ids.orgRole,
  });
  await insert("RolePermission", {
    organizationId: ids.a,
    roleId: ids.orgRole,
    permissionId: ids.permission,
  });
  for (const [org, property, unit, lease] of [
    [ids.a, ids.property, ids.unit, ids.lease],
    [ids.b, ids.propertyB, ids.unitB, ids.leaseB],
  ]) {
    await insert("Property", {
      id: property,
      organizationId: org,
      code: "P1",
      name: "Test property",
      kind: "RESIDENTIAL",
      address: { city: "Test" },
    });
    await insert("PropertyUnit", {
      id: unit,
      organizationId: org,
      propertyId: property,
      code: "MAIN",
      name: "Main",
      isMain: true,
    });
    await insert("Lease", {
      id: lease,
      organizationId: org,
      unitId: unit,
      code: "L1",
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      baseRent: "100.00",
      dueDay: 10,
      status: "ACTIVE",
    });
  }
  for (const [id, name] of [
    [ids.owner1, "Owner 1"],
    [ids.owner2, "Owner 2"],
    [ids.owner3, "Owner 3"],
  ])
    await insert("Owner", { id, organizationId: ids.a, name });
  for (const [ownerId, percentage] of [
    [ids.owner1, "60.0000"],
    [ids.owner2, "40.0000"],
  ])
    await insert("PropertyOwnership", {
      organizationId: ids.a,
      propertyId: ids.property,
      ownerId,
      percentage,
      startsOn: "2026-01-01",
    });
  for (const [id, partyRole] of [
    [ids.tenant1, "PRIMARY"],
    [ids.tenant2, "CO_RESPONSIBLE"],
    [ids.tenant3, "OCCUPANT"],
  ]) {
    await insert("Tenant", { id, organizationId: ids.a, name: partyRole });
    await insert("LeaseTenant", {
      organizationId: ids.a,
      leaseId: ids.lease,
      tenantId: id,
      role: partyRole,
      startsOn: "2026-01-01",
    });
  }
  await insert("Contract", {
    id: ids.contract,
    organizationId: ids.a,
    leaseId: ids.lease,
    code: "C1",
  });
  await insert("ContractVersion", {
    id: ids.version,
    organizationId: ids.a,
    contractId: ids.contract,
    version: 1,
    content: { test: true },
    contentHash: "a".repeat(64),
    validFrom: "2026-01-01",
  });
  await insert("Charge", {
    id: ids.charge,
    organizationId: ids.a,
    leaseId: ids.lease,
    code: "CH1",
    kind: "RENT",
    competence: "2026-01-01",
    amount: "100.00",
  });
  for (const [id, number, amount] of [
    [ids.installment, 1, "60.00"],
    [ids.installment2, 2, "40.00"],
  ])
    await insert("Installment", {
      id,
      organizationId: ids.a,
      chargeId: ids.charge,
      number,
      dueOn: "2026-01-10",
      amount,
    });
  await q("UPDATE ethos.\"Charge\" SET status='ISSUED' WHERE id=$1", [
    ids.charge,
  ]);
  await insert("Payment", {
    id: ids.payment,
    organizationId: ids.a,
    leaseId: ids.lease,
    code: "PAY1",
    amount: "60.00",
    method: "PIX",
    status: "CONFIRMED",
    paidAt: "2026-01-10T12:00:00Z",
  });
  await insert("PaymentAllocation", {
    id: ids.allocation,
    organizationId: ids.a,
    paymentId: ids.payment,
    installmentId: ids.installment,
    amount: "60.00",
  });
  await insert("Receipt", {
    id: ids.receipt,
    organizationId: ids.a,
    paymentId: ids.payment,
    number: "R1",
    issuedAt: "2026-01-10T12:00:00Z",
    snapshot: { amount: "60.00" },
  });
  await insert("Inspection", {
    id: ids.inspection,
    organizationId: ids.a,
    unitId: ids.unit,
    leaseId: ids.lease,
    kind: "ENTRY",
    scheduledAt: "2026-01-01T12:00:00Z",
  });
  await insert("InspectionReport", {
    id: ids.report,
    organizationId: ids.a,
    inspectionId: ids.inspection,
    version: 1,
    status: "FINAL",
    finalizedAt: "2026-01-01T13:00:00Z",
    content: { test: true },
  });
  await insert("MaintenanceRequest", {
    id: ids.maintenance,
    organizationId: ids.a,
    unitId: ids.unit,
    leaseId: ids.lease,
    title: "Test",
    description: "Test",
    category: "OTHER",
  });
  await insert("Document", {
    id: ids.document,
    organizationId: ids.a,
    kind: "PHOTO",
    unitId: ids.unit,
    originalName: "test.jpg",
    mimeType: "image/jpeg",
    storageProvider: "test",
    bucket: "test",
    objectKey: randomUUID(),
    sizeBytes: 100,
    sha256: "b".repeat(64),
  });
  await insert("Photo", {
    organizationId: ids.a,
    documentId: ids.document,
    unitId: ids.unit,
    inspectionId: ids.inspection,
  });
  await insert("Notification", {
    organizationId: ids.a,
    recipientMembershipId: ids.member,
    kind: "SYSTEM",
    title: "Test",
    message: "Test",
  });
  await q("SET CONSTRAINTS ALL IMMEDIATE");
  await q("SET CONSTRAINTS ALL DEFERRED");
  passed.push(
    "valid full graph, co-ownership 100%, three party roles and exact financial allocations",
  );

  await check(
    "all application tables force RLS, deny globals, all tenant FKs composite",
    async () => {
      const tables = (
        await q(
          `SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ethos' AND c.relkind='r'`,
        )
      ).rows;
      assert.equal(tables.length, 34);
      assert.ok(tables.every((t) => t.relrowsecurity && t.relforcerowsecurity));
      const invalid = (
        await q(`SELECT c.conname FROM pg_constraint c JOIN pg_class src ON src.oid=c.conrelid JOIN pg_class dst ON dst.oid=c.confrelid JOIN pg_namespace ns ON ns.oid=src.relnamespace
      WHERE ns.nspname='ethos' AND c.contype='f' AND src.relname NOT IN ('ExternalIdentity','PlatformAccessGrant','PlatformAuditLog') AND dst.relname NOT IN ('Organization','User','Permission') AND array_length(c.conkey,1)<>2`)
      ).rows;
      assert.equal(invalid.length, 0);
    },
  );
  await check(
    "cross-organization FK and RBAC links rejected even as admin",
    async () => {
      await rejects(
        'INSERT INTO ethos."Lease" (id,"organizationId","unitId",code,"startsOn","baseRent","dueDay") VALUES ($1,$2,$3,\'cross\',\'2026-01-01\',100,10)',
        [randomUUID(), ids.a, ids.unitB],
        "23503",
      );
      await rejects(
        'INSERT INTO ethos."MembershipRole" (id,"organizationId","membershipId","roleId") VALUES ($1,$2,$3,$4)',
        [randomUUID(), ids.b, ids.memberB, ids.orgRole],
        "23503",
      );
    },
  );
  await check(
    "organization codes isolated and active lease/main unit unique",
    async () => {
      assert.equal(
        (
          await q(
            "SELECT count(*)::int AS n FROM ethos.\"Property\" WHERE code='P1' AND id=ANY($1::uuid[])",
            [[ids.property, ids.propertyB]],
          )
        ).rows[0].n,
        2,
      );
      await rejects(
        'INSERT INTO ethos."PropertyUnit" (id,"organizationId","propertyId",code,name,"isMain") VALUES ($1,$2,$3,\'OTHER\',\'Main\',true)',
        [randomUUID(), ids.a, ids.property],
        "23505",
      );
      await rejects(
        'INSERT INTO ethos."Lease" (id,"organizationId","unitId",code,status,"startsOn","baseRent","dueDay") VALUES ($1,$2,$3,\'duplicate\',\'ACTIVE\',\'2026-01-01\',100,10)',
        [randomUUID(), ids.a, ids.unit],
        "23505",
      );
    },
  );
  await check(
    "owner totals, overlapping owner periods and exact percentages",
    async () => {
      await rejects(
        'INSERT INTO ethos."PropertyOwnership" (id,"organizationId","propertyId","ownerId",percentage,"startsOn") VALUES ($1,$2,$3,$4,1,\'2026-01-01\')',
        [randomUUID(), ids.a, ids.property, ids.owner3],
        "23514",
      );
      await rejects(
        'INSERT INTO ethos."PropertyOwnership" (id,"organizationId","propertyId","ownerId",percentage,"startsOn") VALUES ($1,$2,$3,$4,1,\'2026-02-01\')',
        [randomUUID(), ids.a, ids.property, ids.owner1],
        "23514",
      );
      assert.equal(
        (
          await q(
            'SELECT sum(percentage)::text AS total FROM ethos."PropertyOwnership" WHERE "propertyId"=$1',
            [ids.property],
          )
        ).rows[0].total,
        "100.0000",
      );
    },
  );
  await check(
    "invalid money, competence, dates, versions and platform role rejected",
    async () => {
      await rejects(
        'UPDATE ethos."PropertyOwnership" SET percentage=-1 WHERE "ownerId"=$1',
        [ids.owner1],
        "23514",
      );
      await rejects(
        "INSERT INTO ethos.\"Charge\" (id,\"organizationId\",\"leaseId\",code,kind,competence,amount) VALUES ($1,$2,$3,'bad','RENT','2026-01-02',100)",
        [randomUUID(), ids.a, ids.lease],
        "23514",
      );
      await rejects(
        'INSERT INTO ethos."ContractVersion" (id,"organizationId","contractId",version,content,"contentHash","validFrom") VALUES ($1,$2,$3,0,\'{}\', $4,\'2026-01-01\')',
        [randomUUID(), ids.a, ids.contract, "a".repeat(64)],
        "23514",
      );
      await rejects(
        "INSERT INTO ethos.\"Role\" (id,\"organizationId\",code,name) VALUES ($1,$2,'SUPER_ADMIN','Forbidden')",
        [randomUUID(), ids.a],
        "23514",
      );
    },
  );
  await check("installment totals and over-allocation rejected", async () => {
    await rejects(
      'INSERT INTO ethos."Installment" (id,"organizationId","chargeId",number,"dueOn",amount) VALUES ($1,$2,$3,3,\'2026-01-10\',1)',
      [randomUUID(), ids.a, ids.charge],
      "23514",
    );
    const payment = randomUUID();
    await insert("Payment", {
      id: payment,
      organizationId: ids.a,
      leaseId: ids.lease,
      code: "PAY2",
      amount: "1.00",
      method: "PIX",
      status: "CONFIRMED",
      paidAt: "2026-01-10T12:00:00Z",
    });
    await rejects(
      'INSERT INTO ethos."PaymentAllocation" (id,"organizationId","paymentId","installmentId",amount) VALUES ($1,$2,$3,$4,1)',
      [randomUUID(), ids.a, payment, ids.installment],
      "23514",
    );
    await rejects(
      'INSERT INTO ethos."PaymentAllocation" (id,"organizationId","paymentId","installmentId",amount) VALUES ($1,$2,$3,$4,40)',
      [randomUUID(), ids.a, ids.payment, ids.installment2],
      "23514",
    );
  });
  await check(
    "receipts, payment reversal and immutable historical records",
    async () => {
      await rejects(
        'UPDATE ethos."Receipt" SET status=\'VOIDED\',"voidedAt"=now(),"voidReason"=NULL WHERE id=$1',
        [ids.receipt],
        "23514",
      );
      await rejects(
        'UPDATE ethos."Payment" SET status=\'REVERSED\',"reversedAt"=now() WHERE id=$1',
        [ids.payment],
        "23514",
      );
      await q(
        'UPDATE ethos."Receipt" SET status=\'VOIDED\',"voidedAt"=now(),"voidReason"=\'Test reversal\' WHERE id=$1',
        [ids.receipt],
      );
      await q(
        'UPDATE ethos."Payment" SET status=\'REVERSED\',"reversedAt"=now() WHERE id=$1',
        [ids.payment],
      );
      assert.equal(
        (
          await q(
            'SELECT count(*)::int AS n FROM ethos."PaymentAllocation" WHERE id=$1',
            [ids.allocation],
          )
        ).rows[0].n,
        1,
      );
      await rejects(
        'UPDATE ethos."ContractVersion" SET content=\'{"changed":true}\' WHERE id=$1',
        [ids.version],
        "23514",
      );
      await rejects(
        'UPDATE ethos."InspectionReport" SET content=\'{"changed":true}\' WHERE id=$1',
        [ids.report],
        "23514",
      );
      await rejects(
        'UPDATE ethos."Payment" SET amount=61 WHERE id=$1',
        [ids.payment],
        "23514",
      );
      for (const [table, id] of [
        ["Lease", ids.lease],
        ["Payment", ids.payment],
        ["ContractVersion", ids.version],
        ["Organization", ids.a],
      ])
        await rejects(
          `DELETE FROM ethos."${table}" WHERE id=$1`,
          [id],
          "23514",
        );
    },
  );
  await check(
    "files, inspections and maintenance linked to same unit",
    async () => {
      await rejects(
        'INSERT INTO ethos."Inspection" (id,"organizationId","unitId","leaseId",kind,"scheduledAt") VALUES ($1,$2,$3,$4,\'ENTRY\',now())',
        [randomUUID(), ids.a, ids.unit, ids.leaseB],
        "23514",
      );
      await rejects(
        'INSERT INTO ethos."Document" (id,"organizationId",kind,"originalName","mimeType","storageProvider",bucket,"objectKey","sizeBytes",sha256) VALUES ($1,$2,\'OTHER\',\'test\',\'text/plain\',\'test\',\'test\',\'test\',1,$3)',
        [randomUUID(), ids.a, "a".repeat(64)],
        "23514",
      );
    },
  );
  await check(
    "platform privilege grants and revocations audited separately",
    async () => {
      const id = randomUUID();
      await insert("PlatformAccessGrant", {
        id,
        userId: ids.user,
        grantedByUserId: ids.user,
        role: "SUPER_ADMIN",
        reason: "Isolated integration test",
      });
      await rejects(
        'UPDATE ethos."PlatformAccessGrant" SET "revokedAt"=now() WHERE id=$1',
        [id],
        "23514",
      );
      await q(
        "SELECT set_config('ethos.platform_actor_user_id',$1,true),set_config('ethos.platform_operation_reason','Test revocation',true)",
        [ids.user],
      );
      await q(
        'UPDATE ethos."PlatformAccessGrant" SET "revokedAt"=now() WHERE id=$1',
        [id],
      );
      assert.equal(
        (
          await q(
            'SELECT count(*)::int AS n FROM ethos."PlatformAuditLog" WHERE "targetUserId"=$1',
            [ids.user],
          )
        ).rows[0].n,
        2,
      );
      await rejects(
        'DELETE FROM ethos."PlatformAuditLog" WHERE "targetUserId"=$1',
        [ids.user],
        "23514",
      );
    },
  );

  await q(`SET LOCAL ROLE ${role}`);
  assert.equal(
    (
      await q(
        "SELECT rolbypassrls OR rolsuper AS privileged FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0].privileged,
    false,
  );
  await check(
    "RLS denies missing, empty and malformed organization context",
    async () => {
      for (const context of ["", "invalid-uuid"]) {
        await q("SELECT set_config('ethos.organization_id',$1,true)", [
          context,
        ]);
        assert.equal(
          (await q('SELECT count(*)::int AS n FROM ethos."Property"')).rows[0]
            .n,
          0,
        );
        await rejects(
          'INSERT INTO ethos."Owner" (id,"organizationId",name) VALUES ($1,$2,\'Forbidden\')',
          [randomUUID(), ids.a],
          "42501",
        );
      }
    },
  );
  await q(
    "SELECT set_config('ethos.organization_id',$1,true),set_config('ethos.actor_membership_id',$2,true)",
    [ids.a, ids.member],
  );
  await check(
    "RLS allows own organization and blocks foreign reads/writes and global identity",
    async () => {
      const rows = (await q('SELECT id FROM ethos."Property"')).rows;
      assert.deepEqual(
        rows.map((r) => r.id),
        [ids.property],
      );
      assert.equal(
        (await q('SELECT count(*)::int AS n FROM ethos."User"')).rows[0].n,
        0,
      );
      assert.equal(
        (await q('SELECT count(*)::int AS n FROM ethos."PlatformAccessGrant"'))
          .rows[0].n,
        0,
      );
      await rejects(
        'INSERT INTO ethos."Owner" (id,"organizationId",name) VALUES ($1,$2,\'Foreign\')',
        [randomUUID(), ids.b],
        "42501",
      );
      const changed = await q(
        "UPDATE ethos.\"Property\" SET name='Foreign' WHERE id=$1",
        [ids.propertyB],
      );
      assert.equal(changed.rowCount, 0);
      await insert("Owner", {
        organizationId: ids.a,
        name: "Permitted tenant mutation",
      });
    },
  );
  await check(
    "RLS enforces FK links and protects audit insert/update/delete",
    async () => {
      await rejects(
        'INSERT INTO ethos."Lease" (id,"organizationId","unitId",code,"startsOn","baseRent","dueDay") VALUES ($1,$2,$3,\'cross\',\'2026-01-01\',100,10)',
        [randomUUID(), ids.a, ids.unitB],
        "23503",
      );
      await rejects(
        'INSERT INTO ethos."AuditLog" (id,"organizationId",action,"entityType","entityId","databaseRole") VALUES ($1,$2,\'FAKE\',\'Owner\',$3,\'fake\')',
        [randomUUID(), ids.a, randomUUID()],
        "42501",
      );
      assert.equal(
        (await q("UPDATE ethos.\"AuditLog\" SET action='FAKE'")).rowCount,
        0,
      );
      assert.equal((await q('DELETE FROM ethos."AuditLog"')).rowCount, 0);
    },
  );
  await check(
    "tenant mutations create immutable audit history with validated actor",
    async () => {
      const id = randomUUID();
      await insert("Owner", {
        id,
        organizationId: ids.a,
        name: "Audit original",
      });
      await q("UPDATE ethos.\"Owner\" SET name='Audit changed' WHERE id=$1", [
        id,
      ]);
      const audit = (
        await q(
          'SELECT "actorMembershipId","previousValues","currentValues" FROM ethos."AuditLog" WHERE "entityId"=$1 AND action=\'UPDATE\'',
          [id],
        )
      ).rows[0];
      assert.equal(audit.actorMembershipId, ids.member);
      assert.equal(audit.previousValues.name, "Audit original");
      assert.equal(audit.currentValues.name, "Audit changed");
      await q("SELECT set_config('ethos.actor_membership_id',$1,true)", [
        ids.memberB,
      ]);
      await rejects(
        "UPDATE ethos.\"Owner\" SET name='Bad actor' WHERE id=$1",
        [id],
        "23514",
      );
    },
  );
  await q("RESET ROLE");
  await q("ROLLBACK");
  stage = "rollback and preservation";
  const after = (await q(catalogSQL)).rows;
  assert.equal(digest(before), digest(after));
  assert.equal(
    (
      await q("SELECT count(*)::int AS n FROM pg_roles WHERE rolname=$1", [
        role,
      ])
    ).rows[0].n,
    0,
  );
  if (!rehearsal) {
    assert.equal(
      (
        await q(
          'SELECT count(*)::int AS n FROM ethos."Organization" WHERE id=ANY($1::uuid[])',
          [[ids.a, ids.b]],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await q('SELECT count(*)::int AS n FROM ethos."User" WHERE id=$1', [
          ids.user,
        ])
      ).rows[0].n,
      0,
    );
  } else
    assert.equal(
      (await q("SELECT to_regnamespace('ethos') IS NULL AS absent")).rows[0]
        .absent,
      true,
    );
  const report = {
    mode: rehearsal ? "rehearsal" : "applied database",
    passed: passed.length,
    checks: passed,
    unmanagedCatalog: {
      objects: before.length,
      before: digest(before),
      after: digest(after),
    },
    fixturesRolledBack: true,
    temporaryRoleRemoved: true,
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--report"))
    writeFileSync(
      new URL("../../../docs/etapa-0.8-tests.json", import.meta.url),
      JSON.stringify(report, null, 2) + "\n",
    );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      stage,
      code:
        typeof error?.code === "string"
          ? error.code
          : "INTEGRATION_CHECK_FAILED",
      message: redact(String(error?.message ?? "check failed"), process.env),
      passed: passed.length,
    }),
  );
  process.exitCode = 1;
} finally {
  try {
    await q("ROLLBACK");
  } catch {}
  await c.end();
}
