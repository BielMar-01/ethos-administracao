import type { DemoState } from "./model";
import * as initial from "../mock-data/portfolio";

export function snapshot(state: DemoState) {
  const activeLeases = state.leases.filter((r) => r.status === "Ativa");
  function find<T extends { id: string }>(records: T[], id: string): T {
    const record = records.find((r) => r.id === id);
    if (!record) throw new Error(`Referência inválida: ${id}`);
    return record;
  }
  return {
    ...initial,
    ...state,
    activeLeases,
    contractedRevenue: activeLeases.reduce((sum, r) => sum + r.rent, 0),
    octoberCharges: state.charges.filter(
      (r) => r.period === "Outubro/2026" && r.status !== "Cancelado",
    ),
    property: (id: string) => find(state.properties, id),
    owner: (id: string) => find(state.owners, id),
    tenant: (id: string) => find(state.tenants, id),
    lease: (id: string) => find(state.leases, id),
  };
}
