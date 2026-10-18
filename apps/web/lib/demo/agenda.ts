import type { DemoState } from "./model";
import { snapshot } from "./selectors";

export type AgendaEvent = {
  id: string;
  date: string;
  category: string;
  title: string;
  detail: string;
  href: string;
};
export function agendaEvents(state: DemoState): AgendaEvent[] {
  const d = snapshot(state);
  return [
    ...d.inspections
      .filter((r) => r.date >= d.demoReference && r.status !== "Concluída")
      .map((r) => ({
        id: r.id,
        date: r.date,
        category: "Vistoria",
        title: `${r.type} · ${d.property(r.propertyId).name}`,
        detail: r.responsible,
        href: "/app/inspections",
      })),
    ...d.maintenance.flatMap((r) =>
      r.scheduled && r.scheduled >= d.demoReference && r.status !== "Concluída"
        ? [
            {
              id: r.id,
              date: r.scheduled,
              category: "Manutenção",
              title: `${r.category} · ${d.property(r.propertyId).name}`,
              detail: r.description,
              href: "/app/maintenance",
            },
          ]
        : [],
    ),
    ...d.charges
      .filter((r) => r.status === "Pendente" && r.due >= d.demoReference)
      .map((r) => ({
        id: r.id,
        date: r.due,
        category: "Vencimento de aluguel",
        title: `${d.brl(r.value)} · ${d.property(d.lease(r.leaseId).propertyId).name}`,
        detail: r.period,
        href: "/app/finance",
      })),
    ...d.activeLeases
      .filter((r) => d.nearExpiry(r.end))
      .map((r) => ({
        id: r.id,
        date: r.end,
        category: "Renovação próxima",
        title: `Encerramento previsto · ${d.property(r.propertyId).name}`,
        detail: "Avaliar renovação até esta data",
        href: "/app/leases",
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}
