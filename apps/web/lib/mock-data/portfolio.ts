export const demoReference = "2026-10-17";
export const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
export const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
export const nearExpiry = (end: string) => end >= demoReference && end <= "2026-11-16";

type Owner = { id: string; name: string; type: "Pessoa física" | "Pessoa jurídica"; status: "Ativo" | "Inativo" };
export const owners: Owner[] = [
  { id: "PRO-001", name: "Helena Exemplo", type: "Pessoa física", status: "Ativo" },
  { id: "PRO-002", name: "Grupo Horizonte Fictício", type: "Pessoa jurídica", status: "Ativo" },
  { id: "PRO-003", name: "Marcos Ilustrativo", type: "Pessoa física", status: "Inativo" },
];
type Property = { id: string; name: string; type: string; region: string; ownerId: string; rent: number; status: "Alugado" | "Disponível" | "Em manutenção" | "Inativo" };
export const properties: Property[] = [
  { id: "IMO-001", name: "Apartamento Aurora", type: "Apartamento", region: "Jardim Exemplo", ownerId: "PRO-001", rent: 2400, status: "Alugado" },
  { id: "IMO-002", name: "Sala Horizonte", type: "Comercial", region: "Centro Ilustrativo", ownerId: "PRO-002", rent: 3200, status: "Alugado" },
  { id: "IMO-003", name: "Casa das Oliveiras", type: "Casa", region: "Vila Modelo", ownerId: "PRO-001", rent: 2800, status: "Disponível" },
  { id: "IMO-004", name: "Studio Jardim", type: "Studio", region: "Jardim Exemplo", ownerId: "PRO-002", rent: 1600, status: "Em manutenção" },
  { id: "IMO-005", name: "Casa do Lago", type: "Casa", region: "Parque Fictício", ownerId: "PRO-003", rent: 2100, status: "Inativo" },
];
type Tenant = { id: string; name: string; status: "Ativo" | "Inativo" };
export const tenants: Tenant[] = [
  { id: "INQ-001", name: "Clara Exemplo", status: "Ativo" },
  { id: "INQ-002", name: "Ateliê Modelo", status: "Ativo" },
  { id: "INQ-003", name: "Rafael Ilustrativo", status: "Inativo" },
];
type Lease = { id: string; propertyId: string; tenantId: string; start: string; end: string; rent: number; dueDay: number; status: "Rascunho" | "Ativa" | "Pendente" | "Encerrada" | "Cancelada" };
export const leases: Lease[] = [
  { id: "LOC-001", propertyId: "IMO-001", tenantId: "INQ-001", start: "2025-11-01", end: "2026-10-31", rent: 2400, dueDay: 10, status: "Ativa" },
  { id: "LOC-002", propertyId: "IMO-002", tenantId: "INQ-002", start: "2026-02-01", end: "2027-01-31", rent: 3200, dueDay: 20, status: "Ativa" },
  { id: "LOC-003", propertyId: "IMO-005", tenantId: "INQ-003", start: "2025-01-01", end: "2026-09-30", rent: 2100, dueDay: 5, status: "Encerrada" },
];
type Contract = { id: string; leaseId: string; signature: "Assinado" | "Aguardando assinatura"; status: "Vigente" | "Encerrado" };
export const contracts: Contract[] = [
  { id: "CTR-001", leaseId: "LOC-001", signature: "Assinado", status: "Vigente" },
  { id: "CTR-002", leaseId: "LOC-002", signature: "Assinado", status: "Vigente" },
  { id: "CTR-003", leaseId: "LOC-003", signature: "Assinado", status: "Encerrado" },
];
type Charge = { id: string; leaseId: string; period: string; due: string; value: number; paidOn?: string; status: "Pago" | "Pendente" | "Atrasado" | "Cancelado" };
export const charges: Charge[] = [
  { id: "COB-001", leaseId: "LOC-001", period: "Outubro/2026", due: "2026-10-10", value: 2400, status: "Atrasado" },
  { id: "COB-002", leaseId: "LOC-002", period: "Outubro/2026", due: "2026-10-20", value: 3200, status: "Pendente" },
  { id: "COB-003", leaseId: "LOC-001", period: "Setembro/2026", due: "2026-09-10", value: 2400, paidOn: "2026-09-09", status: "Pago" },
  { id: "COB-004", leaseId: "LOC-002", period: "Setembro/2026", due: "2026-09-20", value: 3200, paidOn: "2026-09-18", status: "Pago" },
  { id: "COB-005", leaseId: "LOC-003", period: "Outubro/2026", due: "2026-10-05", value: 2100, status: "Cancelado" },
];
type Inspection = { id: string; propertyId: string; type: "Entrada" | "Saída" | "Periódica" | "Extraordinária"; date: string; responsible: string; report: "Pendente" | "Em elaboração" | "Concluído"; status: "Agendada" | "Em andamento" | "Concluída" };
export const inspections: Inspection[] = [
  { id: "VIS-001", propertyId: "IMO-003", type: "Entrada", date: "2026-10-19", responsible: "Equipe Exemplo A", report: "Pendente", status: "Agendada" },
  { id: "VIS-002", propertyId: "IMO-004", type: "Extraordinária", date: "2026-10-17", responsible: "Equipe Exemplo B", report: "Em elaboração", status: "Em andamento" },
  { id: "VIS-003", propertyId: "IMO-005", type: "Saída", date: "2026-09-30", responsible: "Equipe Exemplo A", report: "Concluído", status: "Concluída" },
  { id: "VIS-004", propertyId: "IMO-002", type: "Periódica", date: "2026-10-15", responsible: "Equipe Exemplo B", report: "Pendente", status: "Concluída" },
];
type Maintenance = { id: string; propertyId: string; category: string; description: string; priority: "Baixa" | "Média" | "Alta" | "Urgente"; opened: string; scheduled?: string; status: "Aberta" | "Em andamento" | "Aguardando orçamento" | "Concluída" };
export const maintenance: Maintenance[] = [
  { id: "MAN-001", propertyId: "IMO-004", category: "Hidráulica", description: "Reparo de vazamento na cozinha.", priority: "Urgente", opened: "2026-10-16", scheduled: "2026-10-18", status: "Em andamento" },
  { id: "MAN-002", propertyId: "IMO-001", category: "Elétrica", description: "Revisão de iluminação da sala.", priority: "Alta", opened: "2026-10-17", status: "Aberta" },
  { id: "MAN-003", propertyId: "IMO-003", category: "Pintura", description: "Orçamento de pintura para nova locação.", priority: "Média", opened: "2026-10-14", status: "Aguardando orçamento" },
  { id: "MAN-004", propertyId: "IMO-002", category: "Acabamento", description: "Ajuste de puxador do armário.", priority: "Baixa", opened: "2026-10-01", status: "Concluída" },
];

function requireRecord<T extends { id: string }>(records: T[], id: string): T {
  const record = records.find(item => item.id === id);
  if (!record) throw new Error(`Referência demonstrativa inválida: ${id}`);
  return record;
}
export const property = (id: string) => requireRecord(properties, id);
export const owner = (id: string) => requireRecord(owners, id);
export const tenant = (id: string) => requireRecord(tenants, id);
export const lease = (id: string) => requireRecord(leases, id);
export const activeLeases = leases.filter(item => item.status === "Ativa");
export const contractedRevenue = activeLeases.reduce((sum, item) => sum + item.rent, 0);
export const octoberCharges = charges.filter(item => item.period === "Outubro/2026" && item.status !== "Cancelado");
export const sumCharges = (records: Charge[]) => records.reduce((sum, item) => sum + item.value, 0);
