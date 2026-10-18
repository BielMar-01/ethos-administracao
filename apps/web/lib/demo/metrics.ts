import type { DemoState, Domain } from "./model";
import { snapshot } from "./selectors";

export function metrics(
  domain: Domain,
  state: DemoState,
): { label: string; value: string | number; detail?: string }[] {
  const d = snapshot(state);
  const count = (rows: { status: string }[], status: string) =>
    rows.filter((r) => r.status === status).length;
  switch (domain) {
    case "properties":
      return [
        { label: "Total de imóveis", value: d.properties.length },
        { label: "Imóveis alugados", value: count(d.properties, "Alugado") },
        { label: "Disponíveis", value: count(d.properties, "Disponível") },
        { label: "Em manutenção", value: count(d.properties, "Em manutenção") },
      ];
    case "owners":
      return [
        { label: "Total de proprietários", value: d.owners.length },
        { label: "Proprietários ativos", value: count(d.owners, "Ativo") },
        { label: "Imóveis vinculados", value: d.properties.length },
      ];
    case "tenants":
      return [
        { label: "Total de inquilinos", value: d.tenants.length },
        { label: "Inquilinos ativos", value: count(d.tenants, "Ativo") },
        { label: "Contratos vigentes", value: count(d.contracts, "Vigente") },
        {
          label: "Pendências demonstrativas",
          value: count(d.charges, "Atrasado"),
        },
      ];
    case "leases":
      return [
        { label: "Locações ativas", value: d.activeLeases.length },
        {
          label: "Próximas do encerramento",
          value: d.activeLeases.filter((r) => d.nearExpiry(r.end)).length,
          detail: "Até 16/11/2026",
        },
        { label: "Locações encerradas", value: count(d.leases, "Encerrada") },
        {
          label: "Receita contratada mensal",
          value: d.brl(d.contractedRevenue),
        },
      ];
    case "contracts":
      return [
        { label: "Contratos ativos", value: count(d.contracts, "Vigente") },
        {
          label: "Aguardando assinatura",
          value: d.contracts.filter(
            (r) => r.signature === "Aguardando assinatura",
          ).length,
        },
        {
          label: "Próximos do vencimento",
          value: d.contracts.filter(
            (r) => r.status === "Vigente" && d.nearExpiry(r.end),
          ).length,
        },
        { label: "Encerrados", value: count(d.contracts, "Encerrado") },
      ];
    case "charges":
      return [
        {
          label: "Receita prevista · outubro",
          value: d.brl(d.sumCharges(d.octoberCharges)),
        },
        {
          label: "Receita recebida · outubro",
          value: d.brl(
            d.sumCharges(d.octoberCharges.filter((r) => r.status === "Pago")),
          ),
        },
        {
          label: "Pendentes · outubro",
          value: d.brl(
            d.sumCharges(
              d.octoberCharges.filter((r) => r.status === "Pendente"),
            ),
          ),
        },
        {
          label: "Em atraso · outubro",
          value: d.brl(
            d.sumCharges(
              d.octoberCharges.filter((r) => r.status === "Atrasado"),
            ),
          ),
        },
      ];
    case "inspections":
      return [
        {
          label: "Vistorias agendadas",
          value: count(d.inspections, "Agendada"),
        },
        { label: "Em andamento", value: count(d.inspections, "Em andamento") },
        { label: "Concluídas", value: count(d.inspections, "Concluída") },
        {
          label: "Pendentes de laudo",
          value: d.inspections.filter((r) => r.report !== "Concluído").length,
        },
      ];
    case "maintenance":
      return [
        "Aberta",
        "Em andamento",
        "Aguardando orçamento",
        "Concluída",
      ].map((status) => ({
        label: status,
        value: count(d.maintenance, status),
      }));
  }
}
