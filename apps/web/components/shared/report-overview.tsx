"use client";

import { useDemoSnapshot } from "../providers/demo-provider";
import { StatCards } from "./module-layout";

export function ReportOverview() {
  const data = useDemoSnapshot();
  return (
    <StatCards
      items={[
        {
          label: "Imóveis na carteira fictícia",
          value: data.properties.length,
        },
        {
          label: "Ocupação demonstrativa",
          value: `${Math.round((data.properties.filter((r) => r.status === "Alugado").length / (data.properties.length || 1)) * 100)}%`,
        },
        {
          label: "Receita mensal contratada",
          value: data.brl(data.contractedRevenue),
        },
      ]}
    />
  );
}
