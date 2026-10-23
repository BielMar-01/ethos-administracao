"use client";
import { useState } from "react";
import { ResourcePanel } from "./resource-panel";
import { SummaryPanel } from "./summary-panel";
import { Button } from "../ui/button";
export function FinanceWorkspace() {
  const [tab, setTab] = useState<"charges" | "payments" | "receipts">(
    "charges",
  );
  return (
    <div className="space-y-6">
      <SummaryPanel endpoint="finance/summary" title="Financeiro" />
      <nav aria-label="Operações financeiras" className="flex flex-wrap gap-3">
        {(["charges", "payments", "receipts"] as const).map((value, i) => (
          <Button
            key={value}
            aria-pressed={tab === value}
            variant={tab === value ? "primary" : "secondary"}
            onClick={() => setTab(value)}
          >
            {["Cobranças", "Pagamentos", "Recibos"][i]}
          </Button>
        ))}
      </nav>
      <ResourcePanel key={tab} resource={tab} />
    </div>
  );
}
