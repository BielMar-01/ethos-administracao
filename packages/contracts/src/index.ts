import { z } from "zod";

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type RecordDto = { id: string; [key: string]: Json };
export type Page<T> = {
  success: true;
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};
export type Result<T> = { success: true; data: T };
export type ApiError = {
  success: false;
  error: { code: string; message: string; fields?: Record<string, string[]> };
  requestId?: string;
};
export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "date"
    | "datetime"
    | "money"
    | "percent"
    | "integer"
    | "boolean"
    | "json"
    | "reference";
  required?: boolean;
  values?: string[];
  reference?: string;
  update?: boolean;
  max?: number;
  min?: number;
  default?: string | number | boolean;
  nullable?: boolean;
};
export type Definition = {
  model: string;
  title: string;
  singular: string;
  permission: string;
  fields: Field[];
  search: string[];
  columns: string[];
  actions?: string[];
  parent?: { field: string; resource: string };
  appendOnly?: boolean;
  archive?: boolean;
};
const text = (
  name: string,
  label: string,
  required = true,
  max = 200,
): Field => ({ name, label, required, max });
const ref = (
  name: string,
  label: string,
  reference: string,
  required = true,
): Field => ({
  name,
  label,
  type: "reference",
  reference,
  required,
  update: false,
});
const date = (name: string, label: string, required = true): Field => ({
  name,
  label,
  type: "date",
  required,
});
const money = (name: string, label: string, required = true): Field => ({
  name,
  label,
  type: "money",
  required,
});
const json = (name: string, label: string, required = true): Field => ({
  name,
  label,
  type: "json",
  required,
});
const choice = (
  name: string,
  label: string,
  values: string[],
  required = true,
): Field => ({ name, label, values, required });
const immutable = (fields: Field[]): Field[] =>
  fields.map((f) => ({ ...f, update: false }));
const person: Field[] = [
  text("name", "Nome"),
  choice("kind", "Pessoa", ["INDIVIDUAL", "COMPANY"]),
  { ...text("email", "E-mail", false, 320), type: "email", nullable: true },
  { ...text("phone", "Telefone", false, 40), nullable: true },
  { ...text("taxIdentifier", "CPF/CNPJ", false, 30), nullable: true },
];
export const definitions = {
  owners: {
    model: "owner",
    title: "Proprietários",
    singular: "Proprietário",
    permission: "owners",
    fields: person,
    search: ["name", "email", "taxIdentifier"],
    columns: ["name", "kind", "email", "phone"],
    archive: true,
  },
  properties: {
    model: "property",
    title: "Imóveis",
    singular: "Imóvel",
    permission: "properties",
    fields: [
      text("code", "Código", true, 80),
      text("name", "Nome"),
      choice("kind", "Categoria", [
        "RESIDENTIAL",
        "COMMERCIAL",
        "MIXED",
        "LAND",
      ]),
      json("address", "Endereço"),
    ],
    search: ["name", "code"],
    columns: ["code", "name", "kind"],
    archive: true,
  },
  units: {
    model: "propertyUnit",
    title: "Unidades",
    singular: "Unidade",
    permission: "properties",
    parent: { field: "propertyId", resource: "properties" },
    fields: [
      ref("propertyId", "Imóvel", "properties"),
      text("code", "Código", true, 80),
      text("name", "Nome"),
      {
        name: "isMain",
        label: "Unidade principal",
        type: "boolean",
        default: false,
      },
      { name: "area", label: "Área (m²)", type: "money", nullable: true },
    ],
    search: ["code", "name"],
    columns: ["code", "name", "isMain", "area"],
    archive: true,
  },
  ownerships: {
    model: "propertyOwnership",
    title: "Participações",
    singular: "Participação",
    permission: "properties",
    parent: { field: "propertyId", resource: "properties" },
    fields: [
      ref("propertyId", "Imóvel", "properties"),
      ref("ownerId", "Proprietário", "owners"),
      {
        name: "percentage",
        label: "Participação (%)",
        type: "percent",
        required: true,
        update: false,
      },
      { ...date("startsOn", "Início"), update: false },
      date("endsOn", "Fim", false),
    ],
    search: [],
    columns: ["ownerId", "percentage", "startsOn", "endsOn"],
    actions: ["end"],
  },
  tenants: {
    model: "tenant",
    title: "Inquilinos",
    singular: "Inquilino",
    permission: "tenants",
    fields: person,
    search: ["name", "email", "taxIdentifier"],
    columns: ["name", "kind", "email", "phone"],
    archive: true,
  },
  leases: {
    model: "lease",
    title: "Locações",
    singular: "Locação",
    permission: "leases",
    fields: immutable([
      text("code", "Código", true, 80),
      ref("unitId", "Unidade", "units"),
      ref("primaryTenantId", "Inquilino titular", "tenants"),
      date("startsOn", "Início"),
      date("endsOn", "Fim", false),
      money("baseRent", "Aluguel base"),
      {
        name: "dueDay",
        label: "Dia de vencimento",
        type: "integer",
        min: 1,
        max: 31,
        required: true,
      },
    ]),
    search: ["code"],
    columns: ["code", "unitId", "startsOn", "endsOn", "baseRent", "status"],
    actions: ["activate", "end", "cancel"],
  },
  participants: {
    model: "leaseTenant",
    title: "Participantes da locação",
    singular: "Participante",
    permission: "leases",
    parent: { field: "leaseId", resource: "leases" },
    fields: [
      ref("leaseId", "Locação", "leases"),
      ref("tenantId", "Inquilino", "tenants"),
      {
        ...choice("role", "Papel", ["PRIMARY", "CO_RESPONSIBLE", "OCCUPANT"]),
        update: false,
      },
      { ...date("startsOn", "Início"), update: false },
      date("endsOn", "Fim", false),
    ],
    search: [],
    columns: ["tenantId", "role", "startsOn", "endsOn"],
    actions: ["end"],
  },
  contracts: {
    model: "contract",
    title: "Contratos",
    singular: "Contrato",
    permission: "contracts",
    fields: [
      ref("leaseId", "Locação", "leases"),
      text("code", "Código", true, 80),
    ],
    search: ["code"],
    columns: ["code", "leaseId", "status"],
    actions: ["sign", "terminate"],
  },
  versions: {
    model: "contractVersion",
    title: "Versões contratuais",
    singular: "Versão",
    permission: "contracts",
    parent: { field: "contractId", resource: "contracts" },
    fields: [
      ref("contractId", "Contrato", "contracts"),
      json("content", "Conteúdo"),
      date("validFrom", "Vigência"),
    ],
    search: [],
    columns: ["contractId", "version", "validFrom", "contentHash"],
    appendOnly: true,
  },
  renewals: {
    model: "leaseRenewal",
    title: "Renovações",
    singular: "Renovação",
    permission: "leases",
    parent: { field: "leaseId", resource: "leases" },
    fields: immutable([
      ref("leaseId", "Locação", "leases"),
      date("startsOn", "Início"),
      date("endsOn", "Fim", false),
      money("newRent", "Novo aluguel"),
    ]),
    search: [],
    columns: ["leaseId", "startsOn", "endsOn", "newRent", "status"],
    actions: ["approve", "apply", "cancel"],
  },
  adjustments: {
    model: "rentAdjustment",
    title: "Reajustes",
    singular: "Reajuste",
    permission: "leases",
    parent: { field: "leaseId", resource: "leases" },
    fields: immutable([
      ref("leaseId", "Locação", "leases"),
      date("effectiveOn", "Vigência"),
      money("newRent", "Novo aluguel"),
      { ...text("indexName", "Índice", false, 80), nullable: true },
    ]),
    search: ["indexName"],
    columns: [
      "leaseId",
      "effectiveOn",
      "previousRent",
      "newRent",
      "percentage",
      "status",
    ],
    actions: ["approve", "apply", "cancel"],
  },
  charges: {
    model: "charge",
    title: "Cobranças",
    singular: "Cobrança",
    permission: "finance",
    fields: [
      ref("leaseId", "Locação", "leases"),
      text("code", "Código", true, 80),
      choice("kind", "Categoria", [
        "RENT",
        "CONDOMINIUM",
        "TAX",
        "UTILITY",
        "PENALTY",
        "OTHER",
      ]),
      date("competence", "Competência (primeiro dia)"),
      money("amount", "Valor"),
    ],
    search: ["code"],
    columns: ["code", "leaseId", "competence", "amount", "status"],
    actions: ["issue", "cancel"],
  },
  installments: {
    model: "installment",
    title: "Parcelas",
    singular: "Parcela",
    permission: "finance",
    parent: { field: "chargeId", resource: "charges" },
    fields: [
      ref("chargeId", "Cobrança", "charges"),
      {
        name: "number",
        label: "Número",
        type: "integer",
        min: 1,
        max: 10000,
        required: true,
      },
      date("dueOn", "Vencimento"),
      money("amount", "Valor"),
    ],
    search: [],
    columns: ["chargeId", "number", "dueOn", "amount"],
  },
  payments: {
    model: "payment",
    title: "Pagamentos",
    singular: "Pagamento",
    permission: "finance",
    fields: immutable([
      ref("leaseId", "Locação", "leases"),
      text("code", "Código", true, 80),
      money("amount", "Valor"),
      choice("method", "Método", [
        "PIX",
        "BANK_TRANSFER",
        "BANK_SLIP",
        "CASH",
        "CARD",
        "OTHER",
      ]),
      {
        name: "paidAt",
        label: "Recebido em",
        type: "datetime",
        required: true,
      },
    ]),
    search: ["code"],
    columns: ["code", "leaseId", "amount", "paidAt", "method", "status"],
    actions: ["confirm", "reverse"],
  },
  allocations: {
    model: "paymentAllocation",
    title: "Alocações",
    singular: "Alocação",
    permission: "finance",
    parent: { field: "paymentId", resource: "payments" },
    fields: [
      ref("paymentId", "Pagamento", "payments"),
      ref("installmentId", "Parcela", "installments"),
      money("amount", "Valor"),
    ],
    search: [],
    columns: ["paymentId", "installmentId", "amount"],
    appendOnly: true,
  },
  receipts: {
    parent: { field: "paymentId", resource: "payments" },
    model: "receipt",
    title: "Recibos",
    singular: "Recibo",
    permission: "finance",
    fields: [
      ref("paymentId", "Pagamento", "payments"),
      text("number", "Número", true, 80),
    ],
    search: ["number"],
    columns: ["number", "paymentId", "issuedAt", "status"],
    actions: ["void"],
  },
  inspections: {
    model: "inspection",
    title: "Vistorias",
    singular: "Vistoria",
    permission: "inspections",
    fields: [
      ref("unitId", "Unidade", "units"),
      ref("leaseId", "Locação (opcional)", "leases", false),
      choice("kind", "Tipo", ["ENTRY", "EXIT", "PERIODIC"]),
      {
        name: "scheduledAt",
        label: "Agendamento",
        type: "datetime",
        required: true,
      },
    ],
    search: [],
    columns: ["unitId", "kind", "scheduledAt", "completedAt"],
    actions: ["complete"],
  },
  "inspection-reports": {
    model: "inspectionReport",
    title: "Laudos",
    singular: "Laudo",
    permission: "inspections",
    parent: { field: "inspectionId", resource: "inspections" },
    fields: [
      ref("inspectionId", "Vistoria", "inspections"),
      json("content", "Conteúdo"),
    ],
    search: [],
    columns: ["inspectionId", "version", "status", "finalizedAt"],
    actions: ["finalize"],
  },
  maintenance: {
    model: "maintenanceRequest",
    title: "Manutenções",
    singular: "Manutenção",
    permission: "maintenance",
    fields: [
      ref("unitId", "Unidade", "units"),
      ref("leaseId", "Locação (opcional)", "leases", false),
      text("title", "Título"),
      text("description", "Descrição", true, 4000),
      text("category", "Categoria", true, 80),
      choice("priority", "Prioridade", ["LOW", "NORMAL", "HIGH", "URGENT"]),
      money("estimatedCost", "Custo previsto", false),
      money("actualCost", "Custo realizado", false),
    ],
    search: ["title", "category", "description"],
    columns: [
      "title",
      "unitId",
      "category",
      "priority",
      "status",
      "actualCost",
    ],
    actions: ["start", "complete", "cancel"],
  },
  documents: {
    model: "document",
    title: "Documentos",
    singular: "Metadado de documento",
    permission: "",
    fields: [
      choice("kind", "Tipo", [
        "PHOTO",
        "CONTRACT",
        "RECEIPT",
        "REPORT",
        "IDENTITY",
        "OTHER",
      ]),
      text("originalName", "Nome do arquivo", true, 255),
      text("mimeType", "MIME type", true, 120),
      text("sha256", "SHA-256", true, 64),
      {
        name: "sizeBytes",
        label: "Tamanho em bytes",
        type: "integer",
        min: 1,
        max: 100000000,
        required: true,
      },
      ref("ownerId", "Proprietário", "owners", false),
      ref("tenantId", "Inquilino", "tenants", false),
      ref("unitId", "Unidade", "units", false),
      ref("contractVersionId", "Versão contratual", "versions", false),
      ref("receiptId", "Recibo", "receipts", false),
      ref("inspectionReportId", "Laudo", "inspection-reports", false),
      ref("maintenanceRequestId", "Manutenção", "maintenance", false),
    ],
    search: ["originalName"],
    columns: ["originalName", "kind", "mimeType", "sizeBytes"],
    appendOnly: true,
  },
  photos: {
    parent: { field: "unitId", resource: "units" },
    model: "photo",
    title: "Fotos (metadados)",
    singular: "Foto",
    permission: "properties",
    fields: [
      ref("documentId", "Documento PHOTO", "documents"),
      ref("unitId", "Unidade", "units"),
      { ...text("caption", "Legenda", false, 2000), nullable: true },
      {
        name: "sortOrder",
        label: "Ordem",
        type: "integer",
        min: 0,
        max: 10000,
        default: 0,
      },
    ],
    search: ["caption"],
    columns: ["unitId", "caption", "sortOrder"],
  },
} satisfies Record<string, Definition>;
export type Resource = keyof typeof definitions;
export const resourceNames = Object.keys(definitions) as Resource[];
export function definition(resource: Resource): Definition {
  return definitions[resource];
}
export const uuid = z.uuid();
export const resourceStatuses: Partial<Record<Resource, string[]>> = {
  leases: ["DRAFT", "ACTIVE", "ENDED", "CANCELLED"],
  contracts: ["DRAFT", "SIGNED", "TERMINATED"],
  renewals: ["PROPOSED", "APPROVED", "APPLIED", "CANCELLED"],
  adjustments: ["PROPOSED", "APPROVED", "APPLIED", "CANCELLED"],
  charges: ["DRAFT", "ISSUED", "CANCELLED"],
  payments: ["PENDING", "CONFIRMED", "REVERSED"],
  receipts: ["ISSUED", "VOIDED"],
  "inspection-reports": ["DRAFT", "FINAL"],
  maintenance: ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
};
export const decimal = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,15})(\.\d{1,2})?$/,
    "Informe decimal com até duas casas, usando ponto.",
  );
export const calendarDate = z.iso.date();
export function inputSchema(resource: Resource, update = false) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of definition(resource).fields) {
    if (update && f.update === false) continue;
    let value: z.ZodType = f.values
      ? z.enum(f.values as [string, ...string[]])
      : f.type === "reference"
        ? uuid
        : f.type === "date"
          ? calendarDate
          : f.type === "datetime"
            ? z.iso.datetime({ offset: true })
            : f.type === "money"
              ? decimal
              : f.type === "percent"
                ? z
                    .string()
                    .regex(/^(100(\.0{1,4})?|[1-9]\d?(\.\d{1,4})?|0\.\d{1,4})$/)
                : f.type === "integer"
                  ? z
                      .number()
                      .int()
                      .min(f.min ?? 0)
                      .max(f.max ?? 1000000)
                  : f.type === "boolean"
                    ? z.boolean()
                    : f.type === "json"
                      ? z.record(z.string(), z.json())
                      : f.type === "email"
                        ? z.email().max(320)
                        : z
                            .string()
                            .trim()
                            .min(1)
                            .max(f.max ?? 200);
    if (f.nullable || (!f.required && f.type !== "boolean"))
      value = value.nullable();
    if (update || !f.required) value = value.optional();
    shape[f.name] = value;
  }
  return z.strictObject(shape);
}
export const listQuery = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).default(""),
  sort: z.string().max(60).default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  archived: z.enum(["true", "false", "all"]).default("false"),
  status: z.string().max(30).optional(),
  parentId: uuid.optional(),
  parentResource: z.enum(resourceNames as [Resource, ...Resource[]]).optional(),
  from: calendarDate.optional(),
  to: calendarDate.optional(),
});
export type ListQuery = z.infer<typeof listQuery>;
export const actionInput = z.strictObject({
  reason: z.string().trim().min(10).max(500).optional(),
  endsOn: calendarDate.optional(),
});
export const children: Partial<Record<Resource, Resource[]>> = {
  owners: ["documents"],
  properties: ["units", "ownerships"],
  tenants: ["documents"],
  leases: ["participants", "renewals", "adjustments"],
  contracts: ["versions"],
  charges: ["installments"],
  payments: ["allocations", "receipts"],
  inspections: ["inspection-reports"],
  maintenance: ["documents"],
  units: ["documents", "photos"],
  versions: ["documents"],
  "inspection-reports": ["documents"],
  receipts: ["documents"],
};
