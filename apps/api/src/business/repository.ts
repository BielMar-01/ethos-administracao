import type { OrganizationTransaction } from "@ethos/database";
import {
  definition,
  resourceNames,
  type Resource,
  type ListQuery,
} from "@ethos/contracts";
import { randomUUID } from "node:crypto";
export type Row = Record<string, unknown> & { id: string };
type Args = Record<string, unknown>;
export type Delegate = {
  findMany(args?: Args): Promise<Row[]>;
  findFirst(args: Args): Promise<Row | null>;
  findUnique(args: Args): Promise<Row | null>;
  count(args?: Args): Promise<number>;
  create(args: Args): Promise<Row>;
  update(args: Args): Promise<Row>;
  aggregate(args: Args): Promise<Record<string, unknown>>;
};
export class Repository {
  constructor(
    readonly tx: OrganizationTransaction,
    readonly organizationId: string,
  ) {}
  delegate(resource: Resource): Delegate {
    return (this.tx as unknown as Record<string, Delegate>)[
      definition(resource).model
    ]!;
  }
  async insert(resource: Resource, data: Args) {
    const name = definition(resource).model;
    return this.insertModel(name[0]!.toUpperCase() + name.slice(1), data);
  }
  async insertModel(table: string, data: Args): Promise<Row> {
    const allowed = new Set([
      ...Object.values(definitionsForInsert()),
      "OrganizationSettings",
      "Notification",
    ]);
    if (!allowed.has(table)) throw Error("INVALID_INSERT_MODEL");
    const enums: Record<string, Record<string, string>> = {
      Owner: { kind: "PersonKind" },
      Tenant: { kind: "PersonKind" },
      Property: { kind: "PropertyKind" },
      Lease: { status: "LeaseStatus" },
      LeaseTenant: { role: "LeasePartyRole" },
      Contract: { status: "ContractStatus" },
      LeaseRenewal: { status: "ChangeStatus" },
      RentAdjustment: { status: "ChangeStatus" },
      Charge: { kind: "ChargeKind", status: "ChargeStatus" },
      Payment: { method: "PaymentMethod", status: "PaymentStatus" },
      Receipt: { status: "ReceiptStatus" },
      Inspection: { kind: "InspectionKind" },
      InspectionReport: { status: "ReportStatus" },
      MaintenanceRequest: { status: "MaintenanceStatus", priority: "Priority" },
      Document: { kind: "DocumentKind" },
      Notification: { kind: "NotificationKind" },
    };
    const entries: [string, unknown][] = Object.entries({
      ...data,
      id: randomUUID(),
      organizationId: this.organizationId,
    }).filter(([, v]) => v !== undefined);
    if (entries.some(([key]) => !/^\w+$/.test(key) || key === "createdAt"))
      throw Error("INVALID_INSERT_FIELD");
    const values: unknown[] = [];
    const parameters = entries.map(([key, value], index) => {
      const enumName = enums[table]?.[key];
      let cast = enumName
        ? `ethos."${enumName}"`
        : key === "id" || key.endsWith("Id")
          ? "uuid"
          : key === "sizeBytes"
            ? "bigint"
            : [
                  "amount",
                  "baseRent",
                  "previousRent",
                  "newRent",
                  "percentage",
                  "area",
                  "estimatedCost",
                  "actualCost",
                ].includes(key)
              ? "numeric"
              : key.endsWith("At")
                ? "timestamptz"
                : key.endsWith("On") ||
                    ["competence", "validFrom"].includes(key)
                  ? "date"
                  : typeof value === "boolean"
                    ? "boolean"
                    : typeof value === "number"
                      ? "integer"
                      : typeof value === "object" &&
                          value !== null &&
                          !(value instanceof Date)
                        ? "jsonb"
                        : "text";
      if (value instanceof Date) values.push(value.toISOString());
      else if (cast === "jsonb") values.push(JSON.stringify(value));
      else
        values.push(
          value === null
            ? null
            : typeof value === "bigint"
              ? value.toString()
              : value,
        );
      // Casts and identifiers come only from this registry; values remain bound parameters.
      if (cast === "text" && key === "preferences") cast = "jsonb";
      return `$${index + 1}::${cast}`;
    });
    const result = await this.tx.$queryRawUnsafe<Row[]>(
      `INSERT INTO ethos."${table}" (${entries.map(([key]) => `"${key}"`).join(",")}) VALUES (${parameters.join(",")}) RETURNING *`,
      ...values,
    );
    return result[0]!;
  }
  async require(resource: Resource, id: string, active = false) {
    const row = await this.delegate(resource).findFirst({
      where: {
        id,
        organizationId: this.organizationId,
        ...(active && definition(resource).archive ? { archivedAt: null } : {}),
      },
    });
    return row;
  }
  where(resource: Resource, query: ListQuery): Args {
    const d = definition(resource),
      where: Args = { organizationId: this.organizationId };
    if (d.archive && query.archived !== "all")
      where.archivedAt = query.archived === "true" ? { not: null } : null;
    if (query.q && d.search.length)
      where.OR = d.search.map((key) => ({
        [key]: { contains: query.q, mode: "insensitive" },
      }));
    if (query.status) where.status = query.status;
    if (query.parentId && d.parent) where[d.parent.field] = query.parentId;
    if (query.from || query.to)
      where.createdAt = {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
        ...(query.to
          ? {
              lt: new Date(
                new Date(`${query.to}T00:00:00Z`).getTime() + 86400000,
              ),
            }
          : {}),
      };
    return where;
  }
  async list(resource: Resource, query: ListQuery, extra: Args = {}) {
    const d = definition(resource),
      sortable = new Set([
        "createdAt",
        "id",
        ...d.fields
          .filter((f) => !["json", "reference"].includes(f.type ?? ""))
          .map((f) => f.name),
      ]);
    if (!sortable.has(query.sort)) throw Error("INVALID_SORT");
    const where = { ...this.where(resource, query), ...extra };
    const total = await this.delegate(resource).count({ where });
    const data = await this.delegate(resource).findMany({
      where,
      orderBy: [{ [query.sort]: query.direction }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
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
  }
}
function definitionsForInsert() {
  return Object.fromEntries(
    resourceNames.map((resource) => {
      const model = definition(resource).model;
      return [resource, model[0]!.toUpperCase() + model.slice(1)];
    }),
  );
}
