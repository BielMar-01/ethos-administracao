import type { DemoState } from "./model";
import { snapshot } from "./selectors";

export type DemoNotice = {
  id: string;
  title: string;
  description: string;
  category: string;
  href?: string;
};
export function portfolioNotices(state: DemoState): DemoNotice[] {
  const d = snapshot(state);
  return [
    ...d.charges
      .filter((r) => r.status === "Atrasado")
      .map((r) => ({
        id: `payment-${r.id}`,
        title: "Aluguel em atraso",
        description: `${d.property(d.lease(r.leaseId).propertyId).name} · ${d.brl(r.value)} · Vencimento em ${d.date(r.due)}`,
        category: "Pagamentos",
        href: "/app/finance",
      })),
    ...d.contracts
      .filter((r) => r.status === "Vigente" && d.nearExpiry(r.end))
      .map((r) => ({
        id: `contract-${r.id}`,
        title: "Renovação para acompanhamento",
        description: `${r.number} · Término previsto em ${d.date(r.end)}`,
        category: "Contratos",
        href: "/app/contracts",
      })),
    ...d.maintenance
      .filter((r) => r.status !== "Concluída")
      .map((r) => ({
        id: `maintenance-${r.id}`,
        title: "Manutenção em acompanhamento",
        description: `${d.property(r.propertyId).name} · ${r.description}`,
        category: "Manutenções",
        href: "/app/maintenance",
      })),
    ...d.inspections
      .filter((r) => r.status === "Agendada")
      .map((r) => ({
        id: `inspection-${r.id}`,
        title: "Vistoria agendada",
        description: `${d.property(r.propertyId).name} · ${d.date(r.date)}`,
        category: "Vistorias",
        href: "/app/inspections",
      })),
    {
      id: "system",
      title: "Ambiente demonstrativo",
      description:
        "Os registros são fictícios. Alterações e indicação de leitura existem somente em memória.",
      category: "Sistema",
    },
  ];
}
