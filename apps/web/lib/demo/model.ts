import * as initial from "../mock-data/portfolio";

export type DomainRecords = {
  owners: (typeof initial.owners)[number] & { email: string; phone: string };
  tenants: (typeof initial.tenants)[number] & { email: string; phone: string };
  properties: (typeof initial.properties)[number] & {
    address: string;
    city: string;
    state: string;
  };
  leases: (typeof initial.leases)[number];
  contracts: Omit<
    (typeof initial.contracts)[number],
    "signature" | "status"
  > & {
    number: string;
    start: string;
    end: string;
    signature: "Rascunho" | "Aguardando assinatura" | "Assinado";
    status: "Rascunho" | "Vigente" | "Encerrado" | "Cancelado";
  };
  charges: (typeof initial.charges)[number];
  inspections: (typeof initial.inspections)[number];
  maintenance: (typeof initial.maintenance)[number];
};
export type Domain = keyof DomainRecords;
export type DemoState = { [K in Domain]: DomainRecords[K][] };
export type DemoRecord = DomainRecords[Domain];
export type FormValues = Record<string, string | number>;

export function initialState(): DemoState {
  return structuredClone({
    owners: initial.owners.map((r) => ({ ...r, email: "", phone: "" })),
    tenants: initial.tenants.map((r) => ({ ...r, email: "", phone: "" })),
    properties: initial.properties.map((r) => ({
      ...r,
      address: "Rua Demonstrativa, s/n",
      city: "Cidade Exemplo",
      state: "SP",
    })),
    leases: initial.leases,
    contracts: initial.contracts.map((r) => {
      const lease = initial.lease(r.leaseId);
      return { ...r, number: r.id, start: lease.start, end: lease.end };
    }),
    charges: initial.charges,
    inspections: initial.inspections,
    maintenance: initial.maintenance,
  });
}

export const prefixes: Record<Domain, string> = {
  owners: "PRO",
  tenants: "INQ",
  properties: "IMO",
  leases: "LOC",
  contracts: "CTR",
  charges: "COB",
  inspections: "VIS",
  maintenance: "MAN",
};
