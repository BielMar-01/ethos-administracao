import type { DemoState, Domain, DomainRecords, FormValues } from "./model";
import { prefixes } from "./model";
import { schemas } from "../schemas";
import { demoReference } from "../mock-data/portfolio";

export type MutationResult =
  | { ok: true; state: DemoState }
  | { ok: false; message: string };

export function deletionBlock(
  state: DemoState,
  domain: Domain,
  id: string,
): string | null {
  if (!state[domain].some((r) => r.id === id))
    return "O registro não existe mais nesta carteira.";
  const dependencies: Partial<Record<Domain, boolean>> = {
    owners: state.properties.some((r) => r.ownerId === id),
    tenants: state.leases.some((r) => r.tenantId === id),
    properties:
      state.leases.some((r) => r.propertyId === id) ||
      state.inspections.some((r) => r.propertyId === id) ||
      state.maintenance.some((r) => r.propertyId === id),
    leases:
      state.contracts.some((r) => r.leaseId === id) ||
      state.charges.some((r) => r.leaseId === id),
  };
  return dependencies[domain]
    ? "Exclusão bloqueada: existem registros vinculados. Remova ou altere os vínculos primeiro; nenhuma exclusão em cascata será feita."
    : null;
}

function occupancy(state: DemoState): DemoState {
  const occupied = new Set(
    state.leases.filter((r) => r.status === "Ativa").map((r) => r.propertyId),
  );
  return {
    ...state,
    properties: state.properties.map((r) =>
      occupied.has(r.id)
        ? { ...r, status: "Alugado" }
        : r.status === "Alugado"
          ? { ...r, status: "Disponível" }
          : r,
    ),
  };
}

function replace<K extends Domain>(
  state: DemoState,
  domain: K,
  record: DomainRecords[K],
): DemoState {
  const records: DomainRecords[K][] = state[domain];
  return {
    ...state,
    [domain]: records.some((r) => r.id === record.id)
      ? records.map((r) => (r.id === record.id ? record : r))
      : [...records, record],
  };
}

export function saveRecord(
  state: DemoState,
  domain: Domain,
  values: FormValues,
  editingId?: string,
): MutationResult {
  if (editingId && !state[domain].some((r) => r.id === editingId))
    return { ok: false, message: "O registro a editar não existe mais." };
  const schema = schemas(state);
  const validation = schema[domain].safeParse(values);
  if (!validation.success)
    return {
      ok: false,
      message: validation.error.issues.map((r) => r.message).join(" "),
    };
  const id = editingId ?? `${prefixes[domain]}-${crypto.randomUUID()}`;
  let next: DemoState;
  switch (domain) {
    case "owners":
      next = replace(state, domain, { ...schema.owners.parse(values), id });
      break;
    case "tenants":
      next = replace(state, domain, { ...schema.tenants.parse(values), id });
      break;
    case "properties": {
      const input = schema.properties.parse(values);
      const occupied = state.leases.some(
        (r) => r.propertyId === id && r.status === "Ativa",
      );
      if ((input.status === "Alugado") !== occupied)
        return {
          ok: false,
          message: occupied
            ? "Este imóvel possui locação ativa e deve permanecer alugado. Altere primeiro a locação."
            : "Para marcar o imóvel como alugado, crie ou ative uma locação vinculada.",
        };
      next = replace(state, domain, { ...input, id });
      break;
    }
    case "leases": {
      const input = schema.leases.parse(values);
      if (
        input.status === "Ativa" &&
        state.leases.some(
          (r) =>
            r.id !== id &&
            r.propertyId === input.propertyId &&
            r.status === "Ativa",
        )
      )
        return {
          ok: false,
          message: "Este imóvel já possui uma locação ativa.",
        };
      next = occupancy(replace(state, domain, { ...input, id }));
      break;
    }
    case "contracts": {
      const input = schema.contracts.parse(values);
      if (
        state.contracts.some(
          (r) =>
            r.id !== id &&
            r.number.toLocaleLowerCase("pt-BR") ===
              input.number.toLocaleLowerCase("pt-BR"),
        )
      )
        return { ok: false, message: "Já existe um contrato com este número." };
      if (input.status === "Vigente" && input.signature !== "Assinado")
        return {
          ok: false,
          message: "Um contrato vigente deve estar assinado no exemplo.",
        };
      next = replace(state, domain, { ...input, id });
      break;
    }
    case "charges": {
      const input = schema.charges.parse(values);
      const previous = state.charges.find((r) => r.id === id);
      next = replace(state, domain, {
        ...input,
        id,
        paidOn:
          input.status === "Pago"
            ? (previous?.paidOn ?? demoReference)
            : undefined,
      });
      break;
    }
    case "inspections":
      next = replace(state, domain, {
        ...schema.inspections.parse(values),
        id,
      });
      break;
    case "maintenance": {
      const input = schema.maintenance.parse(values);
      next = replace(state, domain, {
        ...input,
        id,
        scheduled: input.scheduled || undefined,
      });
      break;
    }
  }
  return { ok: true, state: next };
}

export function removeRecord(
  state: DemoState,
  domain: Domain,
  id: string,
): MutationResult {
  const message = deletionBlock(state, domain, id);
  if (message) return { ok: false, message };
  const next = { ...state, [domain]: state[domain].filter((r) => r.id !== id) };
  return { ok: true, state: domain === "leases" ? occupancy(next) : next };
}

export function integrityIssues(state: DemoState): string[] {
  const issues: string[] = [];
  const allIds = new Set<string>();
  const validators = schemas(state);
  for (const domain of Object.keys(prefixes) as Domain[]) {
    for (const record of state[domain]) {
      if (allIds.has(record.id))
        issues.push(`Identificador duplicado: ${record.id}`);
      allIds.add(record.id);
      const input =
        domain === "maintenance"
          ? {
              ...record,
              scheduled: "scheduled" in record ? (record.scheduled ?? "") : "",
            }
          : record;
      if (!validators[domain].safeParse(input).success)
        issues.push(`Registro inválido: ${record.id}`);
    }
  }
  return issues;
}
