import type { DemoRecord, DemoState, Domain, FormValues } from "./model";
import { brl, date } from "../mock-data/portfolio";

export type Option = { value: string; label: string };
export type Field = {
  name: string;
  label: string;
  kind?:
    | "text"
    | "email"
    | "tel"
    | "number"
    | "currency"
    | "date"
    | "select"
    | "textarea";
  options?: Option[];
  required?: boolean;
  filter?: boolean;
  defaultValue?: string | number;
  description?: string;
};
export type DomainConfig = {
  title: string;
  singular: string;
  area: string;
  description: string;
  fields: Field[];
};
const options = (values: string[]): Option[] =>
  values.map((value) => ({ value, label: value }));
const select = (
  name: string,
  label: string,
  values: string[],
  filter = false,
): Field => ({
  name,
  label,
  kind: "select",
  options: options(values),
  filter,
  required: true,
});
const status = (values: string[]) => select("status", "Status", values, true);
const name: Field = { name: "name", label: "Nome", required: true };
const email: Field = {
  name: "email",
  label: "E-mail demonstrativo",
  kind: "email",
  description: "Opcional. Use um exemplo fictício, como pessoa@example.com.",
};
const phone: Field = {
  name: "phone",
  label: "Telefone demonstrativo",
  kind: "tel",
  description: "Opcional. Não informe dados pessoais reais.",
};
const start: Field = {
  name: "start",
  label: "Início",
  kind: "date",
  required: true,
  defaultValue: "2026-10-17",
};
const end: Field = {
  name: "end",
  label: "Término",
  kind: "date",
  required: true,
  defaultValue: "2027-10-17",
};
const rent: Field = {
  name: "rent",
  label: "Valor mensal (R$)",
  kind: "currency",
  required: true,
  defaultValue: 0,
};

export function configs(state: DemoState): Record<Domain, DomainConfig> {
  const reference = (
    key: "properties" | "owners" | "tenants" | "leases",
    field: string,
    label: string,
    filter = false,
  ): Field => ({
    name: field,
    label,
    kind: "select",
    required: true,
    filter,
    options: state[key].map((record) => ({
      value: record.id,
      label:
        "name" in record
          ? `${record.id} · ${record.name}`
          : `${record.id} · ${state.properties.find((p) => p.id === record.propertyId)?.name ?? "Imóvel"}`,
    })),
  });
  return {
    properties: {
      title: "Imóveis",
      singular: "imóvel",
      area: "Gestão patrimonial",
      description:
        "Acompanhe a ocupação, a disponibilidade e o valor mensal da carteira.",
      fields: [
        name,
        select(
          "type",
          "Tipo",
          ["Apartamento", "Comercial", "Casa", "Studio", "Terreno"],
          true,
        ),
        {
          name: "address",
          label: "Endereço demonstrativo",
          required: true,
          description: "Utilize somente um endereço fictício.",
        },
        { name: "region", label: "Bairro", required: true },
        { name: "city", label: "Cidade", required: true },
        select("state", "Estado (UF)", [
          "AC",
          "AL",
          "AP",
          "AM",
          "BA",
          "CE",
          "DF",
          "ES",
          "GO",
          "MA",
          "MT",
          "MS",
          "MG",
          "PA",
          "PB",
          "PR",
          "PE",
          "PI",
          "RJ",
          "RN",
          "RS",
          "RO",
          "RR",
          "SC",
          "SP",
          "SE",
          "TO",
        ]),
        rent,
        reference("owners", "ownerId", "Proprietário", true),
        status(["Disponível", "Alugado", "Em manutenção", "Inativo"]),
      ],
    },
    owners: {
      title: "Proprietários",
      singular: "proprietário",
      area: "Relacionamento",
      description: "Cadastros fictícios e vínculos patrimoniais da carteira.",
      fields: [
        name,
        select(
          "type",
          "Tipo de pessoa",
          ["Pessoa física", "Pessoa jurídica"],
          true,
        ),
        email,
        phone,
        status(["Ativo", "Inativo"]),
      ],
    },
    tenants: {
      title: "Inquilinos",
      singular: "inquilino",
      area: "Relacionamento",
      description: "Locatários fictícios e seus vínculos com a operação.",
      fields: [name, email, phone, status(["Ativo", "Inativo"])],
    },
    leases: {
      title: "Locações",
      singular: "locação",
      area: "Núcleo da operação",
      description:
        "O vínculo entre imóvel, proprietário e inquilino com suas condições comerciais.",
      fields: [
        reference("properties", "propertyId", "Imóvel", true),
        reference("tenants", "tenantId", "Inquilino"),
        start,
        end,
        rent,
        {
          name: "dueDay",
          label: "Dia do vencimento",
          kind: "number",
          required: true,
          defaultValue: 10,
        },
        status(["Rascunho", "Ativa", "Pendente", "Encerrada", "Cancelada"]),
      ],
    },
    contracts: {
      title: "Contratos",
      singular: "contrato",
      area: "Gestão documental",
      description:
        "Formalização e vigência dos documentos vinculados às locações.",
      fields: [
        reference("leases", "leaseId", "Locação"),
        { name: "number", label: "Número do contrato", required: true },
        start,
        end,
        select(
          "signature",
          "Assinatura",
          ["Rascunho", "Aguardando assinatura", "Assinado"],
          true,
        ),
        status(["Rascunho", "Vigente", "Encerrado", "Cancelado"]),
      ],
    },
    charges: {
      title: "Financeiro",
      singular: "cobrança",
      area: "Controle de recebimentos",
      description:
        "Receitas, cobranças e pendências da carteira demonstrativa.",
      fields: [
        reference("leases", "leaseId", "Locação"),
        {
          name: "period",
          label: "Competência",
          required: true,
          filter: true,
          defaultValue: "Outubro/2026",
          description: "Mês por extenso e ano: Outubro/2026.",
        },
        {
          name: "due",
          label: "Vencimento",
          kind: "date",
          required: true,
          defaultValue: "2026-10-20",
        },
        {
          name: "value",
          label: "Valor (R$)",
          kind: "currency",
          required: true,
          defaultValue: 0,
        },
        status(["Pendente", "Pago", "Atrasado", "Cancelado"]),
      ],
    },
    inspections: {
      title: "Vistorias",
      singular: "vistoria",
      area: "Acompanhamento técnico",
      description: "Inspeções de entrada, saída, periódicas e extraordinárias.",
      fields: [
        reference("properties", "propertyId", "Imóvel"),
        select(
          "type",
          "Tipo",
          ["Entrada", "Saída", "Periódica", "Extraordinária"],
          true,
        ),
        {
          name: "date",
          label: "Data",
          kind: "date",
          required: true,
          defaultValue: "2026-10-19",
        },
        { name: "responsible", label: "Responsável fictício", required: true },
        select("report", "Situação do laudo", [
          "Pendente",
          "Em elaboração",
          "Concluído",
        ]),
        status(["Agendada", "Em andamento", "Concluída"]),
      ],
    },
    maintenance: {
      title: "Manutenções",
      singular: "manutenção",
      area: "Operação imobiliária",
      description: "Prioridades e solicitações de reparo da carteira.",
      fields: [
        reference("properties", "propertyId", "Imóvel"),
        { name: "category", label: "Categoria", required: true, filter: true },
        {
          name: "description",
          label: "Descrição",
          kind: "textarea",
          required: true,
        },
        select(
          "priority",
          "Prioridade",
          ["Baixa", "Média", "Alta", "Urgente"],
          true,
        ),
        status(["Aberta", "Em andamento", "Aguardando orçamento", "Concluída"]),
        {
          name: "opened",
          label: "Data de abertura",
          kind: "date",
          required: true,
          defaultValue: "2026-10-17",
        },
        {
          name: "scheduled",
          label: "Atendimento programado",
          kind: "date",
          description: "Opcional. Aparece na agenda quando informado.",
        },
      ],
    },
  };
}

export function recordValues(record: DemoRecord): FormValues {
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string | number] =>
        typeof entry[1] === "string" || typeof entry[1] === "number",
    ),
  );
}
export function defaults(
  config: DomainConfig,
  record?: DemoRecord,
): FormValues {
  const values = record ? recordValues(record) : {};
  return Object.fromEntries(
    config.fields.map((field) => [
      field.name,
      values[field.name] ?? field.defaultValue ?? "",
    ]),
  );
}
export function displayValue(field: Field, value: string | number): string {
  if (field.kind === "currency" && typeof value === "number") return brl(value);
  if (field.kind === "date" && value) return date(String(value));
  return (
    field.options?.find((option) => option.value === value)?.label ??
    String(value || "—")
  );
}
