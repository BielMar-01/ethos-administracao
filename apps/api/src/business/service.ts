import {
  Prisma,
  withOrganization,
  type OrganizationTransaction,
} from "@ethos/database";
import {
  actionInput,
  definition,
  inputSchema,
  resourceNames,
  resourceStatuses,
  type Resource,
  type ListQuery,
} from "@ethos/contracts";
import { createHash } from "node:crypto";
import type { AuthDependencies } from "../auth/types.js";
import type { Session } from "../auth/sessions.js";
import { rolePermissions } from "../auth/rbac.js";
import { AuthError } from "../auth/security.js";
import { z } from "zod";
import { Repository } from "./repository.js";

export class BusinessError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export const wire = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
const day = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value ?? "");
const decimal = (value: unknown) => new Prisma.Decimal(String(value));
const missing = () => new BusinessError(404, "RESOURCE_NOT_FOUND");
const conflict = () => new BusinessError(409, "STATE_CONFLICT");
const documentParents: Record<string, Resource> = {
  ownerId: "owners",
  tenantId: "tenants",
  unitId: "units",
  contractVersionId: "versions",
  receiptId: "receipts",
  inspectionReportId: "inspection-reports",
  maintenanceRequestId: "maintenance",
};
type Context = {
  repo: Repository;
  tx: OrganizationTransaction;
  membershipId: string;
  permit: (permission: string) => void;
};
export class BusinessService {
  constructor(readonly deps: AuthDependencies) {}
  async run<T>(
    session: Session,
    callback: (context: Context) => Promise<T>,
    write = false,
    retryVersionConflict = false,
  ): Promise<T> {
    if (!session.organizationId)
      throw new AuthError(409, "ORGANIZATION_REQUIRED");
    const permissions = await this.deps.identity.permission.findMany({
      select: { id: true, code: true },
    });
    const codes = new Map(permissions.map((p) => [p.id, p.code]));
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await withOrganization(
          this.deps.tenant,
          { organizationId: session.organizationId, userId: session.userId },
          async (tx) => {
            const membership =
              await tx.organizationMembership.findUniqueOrThrow({
                where: {
                  organizationId_userId: {
                    organizationId: session.organizationId!,
                    userId: session.userId,
                  },
                },
              });
            const links = await tx.membershipRole.findMany({
              where: {
                organizationId: session.organizationId!,
                membershipId: membership.id,
                revokedAt: null,
                role: { archivedAt: null },
              },
              include: {
                role: {
                  include: {
                    rolePermission_role: { where: { revokedAt: null } },
                  },
                },
              },
            });
            const allowed = new Set<string>();
            for (const link of links)
              for (const grant of link.role.rolePermission_role) {
                const code = codes.get(grant.permissionId);
                if (code && rolePermissions[link.role.code]?.includes(code))
                  allowed.add(code);
              }
            const permit = (permission: string) => {
              if (!allowed.has(permission))
                throw new AuthError(403, "ACCESS_DENIED");
            };
            return callback({
              repo: new Repository(tx, session.organizationId!),
              tx,
              membershipId: membership.id,
              permit,
            });
          },
          { isolationLevel: write ? "Serializable" : "RepeatableRead" },
        );
      } catch (error) {
        const e = error as {
          code?: string;
          message?: string;
          meta?: { driverAdapterError?: { cause?: { originalCode?: string } } };
        };
        if (
          (e.code === "P2034" ||
            (error as { cause?: { originalCode?: string } }).cause
              ?.originalCode === "40001") &&
          write &&
          attempt < 2
        )
          continue;
        if (error instanceof AuthError || error instanceof BusinessError)
          throw error;
        if (e.message === "ORGANIZATION_ACCESS_DENIED")
          throw new AuthError(403, "ACCESS_DENIED");
        const sql =
          e.meta?.driverAdapterError?.cause?.originalCode ??
          (error as { cause?: { originalCode?: string } }).cause?.originalCode;
        if (write && ["40001", "40P01"].includes(sql ?? "") && attempt < 2)
          continue;
        // A competing append can consume the version observed in this snapshot.
        // Retry only this rolled-back version transaction, never arbitrary mutations.
        if (
          retryVersionConflict &&
          (e.code === "P2002" || sql === "23505") &&
          attempt < 2
        )
          continue;
        if (sql === "42501")
          throw new BusinessError(503, "PERSISTENCE_NOT_ENABLED");
        if (
          e.code === "P2002" ||
          sql === "23505" ||
          sql === "23514" ||
          sql === "40P01" ||
          sql === "40001" ||
          e.code === "P2034"
        )
          throw conflict();
        if (e.code === "P2003" || sql === "23503") throw missing();
        if (e.message === "INVALID_SORT")
          throw new BusinessError(400, "INVALID_SORT");
        throw error;
      }
    }
    throw conflict();
  }
  async lock(c: Context, resource: Resource, id: string) {
    if (definition(resource).appendOnly) return;
    const model = definition(resource).model,
      table = model[0]!.toUpperCase() + model.slice(1);
    await c.tx.$queryRawUnsafe(
      `SELECT id FROM ethos."${table}" WHERE id=$1::uuid AND "organizationId"=$2::uuid FOR UPDATE`,
      id,
      c.repo.organizationId,
    );
  }
  permission(resource: Resource, action: string) {
    return `${definition(resource).permission}.${action}`;
  }
  async require(c: Context, resource: Resource, id: string, active = false) {
    const row = await c.repo.require(resource, id, active);
    if (!row) throw missing();
    return row;
  }
  async documentPermission(
    c: Context,
    data: Record<string, unknown>,
    action: string,
  ) {
    const parents = Object.entries(documentParents).filter(
      ([key]) => data[key],
    );
    if (parents.length !== 1)
      throw new BusinessError(400, "ONE_DOCUMENT_PARENT_REQUIRED");
    const [field, resource] = parents[0]!;
    await this.require(c, resource, String(data[field]), true);
    c.permit(this.permission(resource, action));
  }
  async list(session: Session, resource: Resource, query: ListQuery) {
    return this.run(session, async (c) => {
      if (query.status && !resourceStatuses[resource]?.includes(query.status))
        throw new BusinessError(400, "INVALID_STATUS");
      if (query.from && query.to && query.from > query.to)
        throw new BusinessError(400, "INVALID_DATE_RANGE");
      const extra: Record<string, unknown> = {};
      if (resource === "documents") {
        const parent = Object.entries(documentParents).find(
          ([, r]) => r === query.parentResource,
        );
        if (!parent || !query.parentId)
          throw new BusinessError(400, "DOCUMENT_PARENT_REQUIRED");
        await this.require(c, parent[1], query.parentId);
        c.permit(this.permission(parent[1], "read"));
        extra[parent[0]] = query.parentId;
      } else c.permit(this.permission(resource, "read"));
      if (
        query.status &&
        ![
          "leases",
          "contracts",
          "renewals",
          "adjustments",
          "charges",
          "payments",
          "receipts",
          "inspection-reports",
          "maintenance",
        ].includes(resource)
      )
        throw new BusinessError(400, "INVALID_FILTER");
      if (
        query.parentId &&
        resource !== "documents" &&
        !definition(resource).parent
      )
        throw new BusinessError(400, "INVALID_PARENT_FILTER");
      return c.repo.list(resource, query, extra);
    });
  }
  async detail(session: Session, resource: Resource, id: string) {
    return this.run(session, async (c) => {
      if (resource !== "documents") c.permit(this.permission(resource, "read"));
      const row = await this.require(c, resource, id);
      if (resource === "documents")
        await this.documentPermission(c, row, "read");
      return row;
    });
  }
  async references(
    c: Context,
    resource: Resource,
    data: Record<string, unknown>,
  ) {
    const refs = definition(resource).fields.filter(
      (f) => f.type === "reference" && data[f.name],
    );
    for (const f of [...refs].sort(
      (a, b) =>
        String(a.reference).localeCompare(String(b.reference)) ||
        String(data[a.name]).localeCompare(String(data[b.name])),
    )) {
      const target = f.reference as Resource;
      if (!resourceNames.includes(target)) throw missing();
      await this.lock(c, target, String(data[f.name]));
      const row = await this.require(c, target, String(data[f.name]), true);
      if (target === "units")
        await this.require(c, "properties", String(row.propertyId), true);
    }
    if (data.leaseId && data.unitId) {
      const lease = await this.require(c, "leases", String(data.leaseId));
      if (lease.unitId !== data.unitId) throw missing();
    }
  }
  convert(resource: Resource, data: Record<string, unknown>) {
    const output = { ...data };
    for (const f of definition(resource).fields) {
      const value = output[f.name];
      if (value !== undefined && value !== null) {
        if (f.type === "date" || f.type === "datetime")
          output[f.name] = new Date(
            f.type === "date" ? `${value}T00:00:00.000Z` : String(value),
          );
        if (
          f.type === "money" &&
          ["baseRent", "newRent", "amount"].includes(f.name) &&
          decimal(value).lte(0)
        )
          throw new BusinessError(400, "POSITIVE_AMOUNT_REQUIRED");
      }
    }
    if (
      output.startsOn &&
      output.endsOn &&
      day(output.startsOn) > day(output.endsOn)
    )
      throw new BusinessError(400, "INVALID_DATE_RANGE");
    if (output.competence && !day(output.competence).endsWith("-01"))
      throw new BusinessError(400, "INVALID_COMPETENCE");
    return output;
  }
  async create(session: Session, resource: Resource, input: unknown) {
    const parsed = inputSchema(resource).parse(input);
    return this.run(
      session,
      async (c) => {
        if (resource === "documents")
          await this.documentPermission(c, parsed, "update");
        else c.permit(this.permission(resource, "create"));
        await this.references(c, resource, parsed);
        const data = this.convert(resource, parsed),
          org = c.repo.organizationId;
        const primary = data.primaryTenantId;
        delete data.primaryTenantId;
        if (resource === "leases") {
          const settings = await c.tx.organizationSettings.findFirst({
            where: { organizationId: org },
          });
          data.currency = settings?.currency ?? "BRL";
        }
        if (resource === "versions" || resource === "inspection-reports") {
          const parent =
            resource === "versions" ? "contractId" : "inspectionId";
          const aggregate = (await c.repo.delegate(resource).aggregate({
            where: { organizationId: org, [parent]: data[parent] },
            _max: { version: true },
          })) as { _max: { version: number | null } };
          data.version = (aggregate._max.version ?? 0) + 1;
          if (resource === "versions")
            data.contentHash = createHash("sha256")
              .update(JSON.stringify(data.content))
              .digest("hex");
        }
        if (resource === "renewals") {
          const lease = await this.require(c, "leases", String(data.leaseId));
          if (
            !lease.endsOn ||
            day(data.startsOn) <= day(lease.endsOn) ||
            !["DRAFT", "ACTIVE", "ENDED"].includes(String(lease.status))
          )
            throw conflict();
          const successor = await c.repo.insert("leases", {
            unitId: lease.unitId,
            code: `${String(lease.code).slice(0, 30)}-R-${crypto.randomUUID().slice(0, 18)}`,
            startsOn: data.startsOn,
            endsOn: data.endsOn,
            baseRent: data.newRent,
            currency: lease.currency,
            dueDay: lease.dueDay,
          });
          const parties = await c.tx.leaseTenant.findMany({
            where: {
              organizationId: org,
              leaseId: lease.id,
              OR: [{ endsOn: null }, { endsOn: { gte: lease.endsOn as Date } }],
            },
          });
          for (const party of parties)
            await c.repo.insert("participants", {
              leaseId: successor.id,
              tenantId: party.tenantId,
              role: party.role,
              startsOn: data.startsOn,
              endsOn: data.endsOn,
            });
          data.successorLeaseId = successor.id;
        }
        if (resource === "adjustments") {
          const lease = await this.require(c, "leases", String(data.leaseId));
          if (
            day(data.effectiveOn) < day(lease.startsOn) ||
            (lease.endsOn && day(data.effectiveOn) > day(lease.endsOn))
          )
            throw conflict();
          const applied = await c.tx.rentAdjustment.findFirst({
            where: {
              organizationId: org,
              leaseId: String(data.leaseId),
              status: "APPLIED",
              effectiveOn: { lte: data.effectiveOn as Date },
            },
            orderBy: [{ effectiveOn: "desc" }, { createdAt: "desc" }],
          });
          data.previousRent = (applied?.newRent ?? lease.baseRent)!.toString();
          data.percentage = decimal(data.newRent)
            .minus(String(data.previousRent))
            .div(String(data.previousRent))
            .times(100)
            .toFixed(4);
        }
        if (resource === "documents") {
          if (!/^[a-f0-9]{64}$/.test(String(data.sha256)))
            throw new BusinessError(400, "INVALID_SHA256");
          data.storageProvider = "metadata-only";
          data.bucket = "metadata";
          data.objectKey = `${org}/${crypto.randomUUID()}`;
        }
        if (resource === "receipts") {
          const payment = await this.require(
            c,
            "payments",
            String(data.paymentId),
          );
          if (payment.status !== "CONFIRMED") throw conflict();
          data.issuedAt = new Date();
          data.snapshot = wire({
            paymentId: payment.id,
            leaseId: payment.leaseId,
            amount: payment.amount,
            method: payment.method,
            paidAt: payment.paidAt,
          });
        }
        if (resource === "allocations") {
          const installment = await this.require(
            c,
            "installments",
            String(data.installmentId),
          );
          await this.lock(c, "charges", String(installment.chargeId));
        }
        const row = await c.repo.insert(resource, data);
        if (resource === "properties")
          await c.repo.insert("units", {
            propertyId: row.id,
            code: "MAIN",
            name: "Unidade principal",
            isMain: true,
          });
        if (resource === "leases")
          await c.repo.insert("participants", {
            leaseId: row.id,
            tenantId: primary,
            role: "PRIMARY",
            startsOn: data.startsOn,
            endsOn: data.endsOn,
          });
        await this.notify(c, `Cadastro: ${definition(resource).singular}`);
        return row;
      },
      true,
      resource === "versions" || resource === "inspection-reports",
    );
  }
  async update(
    session: Session,
    resource: Resource,
    id: string,
    input: unknown,
  ) {
    if (
      definition(resource).appendOnly ||
      ["leases", "renewals", "adjustments", "payments", "receipts"].includes(
        resource,
      )
    )
      return this.run(
        session,
        async (c) => {
          if (resource === "documents")
            await this.documentPermission(
              c,
              await this.require(c, resource, id),
              "update",
            );
          else c.permit(this.permission(resource, "update"));
          throw new BusinessError(409, "HISTORY_IMMUTABLE");
        },
        true,
      );
    const parsed = inputSchema(resource, true).parse(input);
    if (!Object.keys(parsed).length)
      throw new BusinessError(400, "EMPTY_UPDATE");
    return this.run(
      session,
      async (c) => {
        c.permit(this.permission(resource, "update"));
        await this.lock(c, resource, id);
        const row = await this.require(c, resource, id, true);
        if (
          (resource === "charges" || resource === "inspection-reports") &&
          row.status !== "DRAFT"
        )
          throw conflict();
        if (
          (resource === "inspections" && row.completedAt) ||
          (resource === "maintenance" &&
            ["COMPLETED", "CANCELLED"].includes(String(row.status)))
        )
          throw conflict();
        if (resource === "installments") {
          await this.lock(c, "charges", String(row.chargeId));
          if (
            (await this.require(c, "charges", String(row.chargeId))).status !==
            "DRAFT"
          )
            throw conflict();
        }
        await this.references(c, resource, parsed);
        const data = this.convert(resource, parsed);
        if (data.endsOn && row.startsOn && day(data.endsOn) < day(row.startsOn))
          throw conflict();
        const result = await c.repo.delegate(resource).update({
          where: {
            organizationId_id: { organizationId: c.repo.organizationId, id },
          },
          data,
        });
        await this.notify(c, `Atualização: ${definition(resource).singular}`);
        return result;
      },
      true,
    );
  }
  async notify(
    c: Context,
    title: string,
    payload: Record<string, unknown> = {},
  ) {
    await c.repo.insertModel("Notification", {
      recipientMembershipId: c.membershipId,
      kind: "SYSTEM",
      title,
      message: "Operação registrada na organização.",
      payload,
    });
  }
  async action(
    session: Session,
    resource: Resource,
    id: string,
    action: string,
    input: unknown,
  ) {
    const body = actionInput.parse(input);
    const d = definition(resource);
    if (
      !(d.actions ?? []).includes(action) &&
      !(d.archive && action === "archive")
    )
      throw new BusinessError(404, "ACTION_NOT_FOUND");
    return this.run(
      session,
      async (c) => {
        c.permit(
          this.permission(
            resource,
            [
              "archive",
              "cancel",
              "end",
              "terminate",
              "void",
              "reverse",
            ].includes(action)
              ? "archive"
              : "update",
          ),
        );
        await this.lock(c, resource, id);
        const row = await this.require(c, resource, id, true);
        const org = c.repo.organizationId;
        const data: Record<string, unknown> = {};
        if (action === "archive") {
          if (
            resource === "owners" &&
            (await c.tx.propertyOwnership.count({
              where: {
                organizationId: org,
                ownerId: id,
                OR: [{ endsOn: null }, { endsOn: { gte: new Date() } }],
              },
            }))
          )
            throw conflict();
          if (
            resource === "tenants" &&
            (await c.tx.leaseTenant.count({
              where: {
                organizationId: org,
                tenantId: id,
                lease: { status: "ACTIVE" },
              },
            }))
          )
            throw conflict();
          if (
            resource === "units" &&
            (await c.tx.lease.count({
              where: { organizationId: org, unitId: id, status: "ACTIVE" },
            }))
          )
            throw conflict();
          if (resource === "properties") {
            if (
              await c.tx.lease.count({
                where: {
                  organizationId: org,
                  unit: { propertyId: id },
                  status: "ACTIVE",
                },
              })
            )
              throw conflict();
            await c.tx.propertyUnit.updateMany({
              where: { organizationId: org, propertyId: id, archivedAt: null },
              data: { archivedAt: new Date() },
            });
          }
          data.archivedAt = new Date();
        } else if (resource === "leases") {
          if (action === "activate") {
            if (row.status !== "DRAFT") throw conflict();
            await this.lock(c, "units", String(row.unitId));
            if (
              await c.tx.leaseRenewal.count({
                where: {
                  organizationId: org,
                  successorLeaseId: id,
                  status: { not: "APPLIED" },
                },
              })
            )
              throw conflict();
            const unit = await this.require(
              c,
              "units",
              String(row.unitId),
              true,
            );
            await this.require(c, "properties", String(unit.propertyId), true);
            const parties = await c.tx.leaseTenant.findMany({
              where: {
                organizationId: org,
                leaseId: id,
                startsOn: { lte: row.startsOn as Date },
                OR: [
                  { endsOn: null },
                  { endsOn: { gte: row.startsOn as Date } },
                ],
              },
              include: { tenant: true },
            });
            if (
              parties.filter((p) => p.role === "PRIMARY").length !== 1 ||
              parties.some((p) => p.tenant.archivedAt)
            )
              throw conflict();
            const shares = await c.tx.propertyOwnership.findMany({
              where: {
                organizationId: org,
                propertyId: String(unit.propertyId),
                startsOn: { lte: row.startsOn as Date },
                OR: [
                  { endsOn: null },
                  { endsOn: { gte: row.startsOn as Date } },
                ],
              },
              include: { owner: true },
            });
            if (
              shares.some((s) => s.owner.archivedAt) ||
              shares
                .reduce(
                  (sum, s) => sum.plus(s.percentage),
                  new Prisma.Decimal(0),
                )
                .cmp(100) !== 0
            )
              throw conflict();
            const overlap = await c.tx.lease.findFirst({
              where: {
                organizationId: org,
                unitId: String(row.unitId),
                id: { not: id },
                status: "ACTIVE",
                ...(row.endsOn
                  ? { startsOn: { lte: row.endsOn as Date } }
                  : {}),
                OR: [
                  { endsOn: null },
                  { endsOn: { gte: row.startsOn as Date } },
                ],
              },
            });
            if (overlap) throw conflict();
            data.status = "ACTIVE";
          } else {
            if (!["DRAFT", "ACTIVE"].includes(String(row.status)))
              throw conflict();
            data.status = action === "end" ? "ENDED" : "CANCELLED";
            data.endedAt = new Date();
          }
        } else if (resource === "ownerships" || resource === "participants") {
          if (!body.endsOn || body.endsOn < day(row.startsOn) || row.endsOn)
            throw conflict();
          data.endsOn = new Date(`${body.endsOn}T00:00:00Z`);
        } else if (resource === "contracts") {
          if (action === "sign") {
            if (
              row.status !== "DRAFT" ||
              !(await c.tx.contractVersion.count({
                where: { organizationId: org, contractId: id },
              }))
            )
              throw conflict();
            data.status = "SIGNED";
          } else {
            if (row.status === "TERMINATED") throw conflict();
            data.status = "TERMINATED";
          }
        } else if (resource === "renewals" || resource === "adjustments") {
          if (action === "approve") {
            if (row.status !== "PROPOSED") throw conflict();
            data.status = "APPROVED";
          } else if (action === "cancel") {
            if (!["PROPOSED", "APPROVED"].includes(String(row.status)))
              throw conflict();
            data.status = "CANCELLED";
            if (resource === "renewals" && row.successorLeaseId)
              await c.tx.lease.update({
                where: {
                  organizationId_id: {
                    organizationId: org,
                    id: String(row.successorLeaseId),
                  },
                },
                data: { status: "CANCELLED", endedAt: new Date() },
              });
          } else {
            if (row.status !== "APPROVED") throw conflict();
            const lease = await this.require(c, "leases", String(row.leaseId));
            await this.lock(c, "leases", lease.id);
            if (resource === "renewals") {
              if (!lease.endsOn || day(row.startsOn) <= day(lease.endsOn))
                throw conflict();
              if (!row.successorLeaseId) throw conflict();
              const successor = await this.require(
                c,
                "leases",
                String(row.successorLeaseId),
              );
              if (successor.status !== "DRAFT") throw conflict();
            } else {
              const previous = await c.tx.rentAdjustment.findFirst({
                where: {
                  organizationId: org,
                  leaseId: lease.id,
                  status: "APPLIED",
                },
                orderBy: { effectiveOn: "desc" },
              });
              if (
                (previous &&
                  day(previous.effectiveOn) >= day(row.effectiveOn)) ||
                decimal(previous?.newRent ?? lease.baseRent).cmp(
                  String(row.previousRent),
                ) !== 0
              )
                throw conflict();
              data.appliedAt = new Date();
            }
            data.status = "APPLIED";
          }
        } else if (resource === "charges") {
          if (action === "issue") {
            if (row.status !== "DRAFT") throw conflict();
          } else if (row.status === "CANCELLED") throw conflict();
          data.status = action === "issue" ? "ISSUED" : "CANCELLED";
        } else if (resource === "payments") {
          if (action === "confirm") {
            if (row.status !== "PENDING") throw conflict();
            data.status = "CONFIRMED";
          } else {
            if (row.status === "REVERSED" || !body.reason) throw conflict();
            data.status = "REVERSED";
            data.reversedAt = new Date();
          }
        } else if (resource === "receipts") {
          if (row.status !== "ISSUED" || !body.reason) throw conflict();
          data.status = "VOIDED";
          data.voidedAt = new Date();
          data.voidReason = body.reason;
        } else if (resource === "inspection-reports") {
          if (row.status !== "DRAFT") throw conflict();
          data.status = "FINAL";
          data.finalizedAt = new Date();
        } else if (resource === "inspections") {
          if (row.completedAt) throw conflict();
          data.completedAt = new Date();
        } else if (resource === "maintenance") {
          if (["COMPLETED", "CANCELLED"].includes(String(row.status)))
            throw conflict();
          data.status =
            action === "start"
              ? "IN_PROGRESS"
              : action === "complete"
                ? "COMPLETED"
                : "CANCELLED";
          if (action === "complete") data.completedAt = new Date();
        }
        const result = await c.repo.delegate(resource).update({
          where: { organizationId_id: { organizationId: org, id } },
          data,
        });
        await this.notify(c, `${d.singular}: ${action}`, {
          resource,
          id,
          action,
          ...(body.reason ? { reason: body.reason } : {}),
        });
        return result;
      },
      true,
    );
  }
  async summary(
    session: Session,
    resource: "dashboard" | "finance" | "reports",
    query: { from?: string; to?: string },
    type = "portfolio",
  ) {
    return this.run(session, async (c) => {
      c.permit(`${resource}.read`);
      const org = c.repo.organizationId;
      const settings = await c.tx.organizationSettings.findFirst({
        where: { organizationId: org },
      });
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: settings?.timezone ?? "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const from = query.from ?? `${today.slice(0, 7)}-01`,
        to =
          query.to ??
          new Date(
            Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0),
          )
            .toISOString()
            .slice(0, 10);
      if (from > to) throw new BusinessError(400, "INVALID_DATE_RANGE");
      const counts = {
        properties: await c.tx.property.count({
          where: { organizationId: org, archivedAt: null },
        }),
        units: await c.tx.propertyUnit.count({
          where: {
            organizationId: org,
            archivedAt: null,
            property: { archivedAt: null },
          },
        }),
        activeLeases: await c.tx.lease.count({
          where: { organizationId: org, status: "ACTIVE" },
        }),
        owners: await c.tx.owner.count({
          where: { organizationId: org, archivedAt: null },
        }),
        tenants: await c.tx.tenant.count({
          where: { organizationId: org, archivedAt: null },
        }),
      };
      let financeAllowed = true;
      try {
        c.permit("finance.read");
      } catch {
        financeAllowed = false;
      }
      if (
        resource === "finance" ||
        (resource === "reports" && type === "finance")
      )
        c.permit("finance.read");
      let finance: Record<string, unknown> | null = null;
      if (financeAllowed) {
        if (
          await c.tx.lease.count({
            where: {
              organizationId: org,
              currency: { not: settings?.currency ?? "BRL" },
            },
          })
        )
          throw new BusinessError(409, "MIXED_CURRENCIES_UNSUPPORTED");
        const [expected] = await c.tx.$queryRaw<
          Record<string, unknown>[]
        >`SELECT coalesce(sum(amount),0)::numeric AS expected FROM ethos."Charge" WHERE "organizationId"=${org}::uuid AND status='ISSUED' AND competence BETWEEN ${from}::date AND ${to}::date`;
        const [received] = await c.tx.$queryRaw<
          Record<string, unknown>[]
        >`SELECT coalesce(sum(a.amount),0)::numeric AS allocated FROM ethos."PaymentAllocation" a JOIN ethos."Payment" p ON p.id=a."paymentId" AND p."organizationId"=a."organizationId" JOIN ethos."Installment" i ON i.id=a."installmentId" AND i."organizationId"=a."organizationId" JOIN ethos."Charge" ch ON ch.id=i."chargeId" AND ch."organizationId"=i."organizationId" WHERE a."organizationId"=${org}::uuid AND p.status='CONFIRMED' AND ch.status='ISSUED' AND ch.competence BETWEEN ${from}::date AND ${to}::date`;
        const [balances] = await c.tx.$queryRaw<
          Record<string, unknown>[]
        >`SELECT coalesce(sum(i.amount-coalesce(a.total,0)),0)::numeric AS outstanding,coalesce(sum(CASE WHEN i."dueOn"<${today}::date THEN i.amount-coalesce(a.total,0) ELSE 0 END),0)::numeric AS overdue FROM ethos."Installment" i JOIN ethos."Charge" ch ON ch.id=i."chargeId" AND ch."organizationId"=i."organizationId" LEFT JOIN LATERAL (SELECT sum(pa.amount) AS total FROM ethos."PaymentAllocation" pa JOIN ethos."Payment" p ON p.id=pa."paymentId" AND p."organizationId"=pa."organizationId" WHERE pa."installmentId"=i.id AND pa."organizationId"=i."organizationId" AND p.status='CONFIRMED') a ON true WHERE i."organizationId"=${org}::uuid AND ch.status='ISSUED' AND ch.competence BETWEEN ${from}::date AND ${to}::date`;
        const [cash] = await c.tx.$queryRaw<
          Record<string, unknown>[]
        >`SELECT coalesce(sum(amount),0)::numeric AS cash FROM ethos."Payment" WHERE "organizationId"=${org}::uuid AND status='CONFIRMED' AND "paidAt">=(${from}::date::timestamp AT TIME ZONE ${settings?.timezone ?? "America/Sao_Paulo"}) AND "paidAt"<((${to}::date+1)::timestamp AT TIME ZONE ${settings?.timezone ?? "America/Sao_Paulo"})`;
        finance = { ...expected, ...received, ...balances, ...cash };
      }
      return {
        from,
        to,
        today,
        currency: settings?.currency ?? "BRL",
        counts,
        finance,
      };
    });
  }
  async calendar(session: Session, query: { from: string; to: string }) {
    return this.run(session, async (c) => {
      c.permit("calendar.read");
      const start = new Date(`${query.from}T00:00:00Z`),
        end = new Date(`${query.to}T23:59:59.999Z`);
      if (start > end || end.getTime() - start.getTime() > 366 * 86400000)
        throw new BusinessError(400, "NARROW_DATE_RANGE");
      const org = c.repo.organizationId,
        events: {
          id: string;
          kind: string;
          title: string;
          date: string;
          resource: string;
          resourceId: string;
        }[] = [];
      const can = (permission: string) => {
        try {
          c.permit(permission);
          return true;
        } catch {
          return false;
        }
      };
      if (can("finance.read")) {
        const rows = await c.tx.installment.findMany({
          where: {
            organizationId: org,
            dueOn: { gte: start, lte: end },
            charge: { status: "ISSUED" },
          },
          include: { charge: true },
          take: 1001,
        });
        if (rows.length > 1000)
          throw new BusinessError(400, "NARROW_DATE_RANGE");
        for (const row of rows)
          events.push({
            id: row.id,
            kind: "Vencimento",
            title: `${row.charge.code} · parcela ${row.number}`,
            date: day(row.dueOn),
            resource: "installments",
            resourceId: row.id,
          });
      }
      if (can("inspections.read")) {
        const rows = await c.tx.inspection.findMany({
          where: { organizationId: org, scheduledAt: { gte: start, lte: end } },
          take: 1001,
        });
        if (rows.length > 1000)
          throw new BusinessError(400, "NARROW_DATE_RANGE");
        for (const row of rows)
          events.push({
            id: row.id,
            kind: "Vistoria",
            title: row.kind,
            date: row.scheduledAt.toISOString(),
            resource: "inspections",
            resourceId: row.id,
          });
      }
      if (can("leases.read")) {
        const rows = await c.tx.leaseRenewal.findMany({
          where: {
            organizationId: org,
            startsOn: { gte: start, lte: end },
            status: { in: ["APPROVED", "APPLIED"] },
          },
          take: 1001,
        });
        if (rows.length > 1000)
          throw new BusinessError(400, "NARROW_DATE_RANGE");
        for (const row of rows)
          events.push({
            id: row.id,
            kind: "Renovação",
            title: "Início do novo período",
            date: day(row.startsOn),
            resource: "renewals",
            resourceId: row.id,
          });
      }
      return events.sort(
        (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
      );
    });
  }
  async notifications(session: Session, query: ListQuery): Promise<unknown> {
    return this.run(session, async (c) => {
      c.permit("notifications.read");
      if (query.sort !== "createdAt")
        throw new BusinessError(400, "INVALID_SORT");
      const where = {
        organizationId: c.repo.organizationId,
        recipientMembershipId: c.membershipId,
        ...(query.q
          ? { title: { contains: query.q, mode: "insensitive" as const } }
          : {}),
      };
      const total = await c.tx.notification.count({ where });
      const data = await c.tx.notification.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ createdAt: query.direction }, { id: "asc" }],
      });
      return {
        data,
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      };
    });
  }
  async readNotification(session: Session, id: string): Promise<unknown> {
    return this.run(
      session,
      async (c) => {
        c.permit("notifications.read");
        const row = await c.tx.notification.findFirst({
          where: {
            id,
            organizationId: c.repo.organizationId,
            recipientMembershipId: c.membershipId,
          },
        });
        if (!row) throw missing();
        return c.tx.notification.update({
          where: {
            organizationId_id: { organizationId: c.repo.organizationId, id },
          },
          data: { readAt: row.readAt ?? new Date() },
        });
      },
      true,
    );
  }
  async settings(session: Session, input?: unknown) {
    return this.run(
      session,
      async (c) => {
        c.permit(input === undefined ? "settings.read" : "settings.update");
        const organization = await c.tx.organization.findUniqueOrThrow({
          where: { id: c.repo.organizationId },
        });
        let settings = await c.tx.organizationSettings.findFirst({
          where: { organizationId: c.repo.organizationId },
        });
        if (input !== undefined) {
          const value = z
            .strictObject({
              name: z.string().trim().min(2).max(200).optional(),
              timezone: z.string().max(80).optional(),
              preferences: z
                .strictObject({
                  theme: z.enum(["system", "light", "dark"]).optional(),
                  locale: z.literal("pt-BR").optional(),
                })
                .optional(),
            })
            .parse(input);
          if (!Object.keys(value).length)
            throw new BusinessError(400, "EMPTY_UPDATE");
          if (value.timezone) {
            try {
              new Intl.DateTimeFormat("pt-BR", { timeZone: value.timezone });
            } catch {
              throw new BusinessError(400, "INVALID_TIMEZONE");
            }
          }
          if (value.name)
            await c.tx.organization.update({
              where: { id: c.repo.organizationId },
              data: { name: value.name },
            });
          const data = {
            ...(value.timezone ? { timezone: value.timezone } : {}),
            ...(value.preferences ? { preferences: value.preferences } : {}),
          };
          if (settings)
            settings = await c.tx.organizationSettings.update({
              where: { id: settings.id },
              data,
            });
          else {
            await c.repo.insertModel("OrganizationSettings", data);
            settings = await c.tx.organizationSettings.findFirst({
              where: { organizationId: c.repo.organizationId },
            });
          }
          await this.notify(c, "Configurações atualizadas");
          return { name: value.name ?? organization.name, ...settings };
        }
        return {
          name: organization.name,
          timezone: settings?.timezone ?? "America/Sao_Paulo",
          currency: settings?.currency ?? "BRL",
          preferences: settings?.preferences ?? {},
          persisted: Boolean(settings),
        };
      },
      input !== undefined,
    );
  }
}
