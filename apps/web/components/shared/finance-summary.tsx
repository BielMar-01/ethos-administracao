"use client";

import { useDemoSnapshot } from "../providers/demo-provider";
import { SectionCard, StatusBadge } from "./module-layout";
import { EmptyState } from "./empty-state";

export function FinanceSummary() {
  const data = useDemoSnapshot();
  const paid = data.charges.filter((r) => r.status === "Pago");
  const pending = data.charges.filter(
    (r) => r.status === "Pendente" || r.status === "Atrasado",
  );
  return (
    <>
      <SectionCard
        title="Resumo financeiro"
        description="Indicadores de outubro de 2026. Referência fixa: 17/10/2026."
      >
        <p className="text-sm leading-relaxed text-muted">
          Receitas previstas incluem cobranças válidas da competência. Cobranças
          canceladas não entram no resumo. Os históricos abaixo abrangem todas
          as competências da carteira em memória.
        </p>
        <ul className="mt-4 flex flex-wrap gap-4 text-sm">
          {["Pago", "Pendente", "Atrasado"].map((status) => (
            <li key={status}>
              {status}:{" "}
              {data.octoberCharges.filter((r) => r.status === status).length}
            </li>
          ))}
        </ul>
      </SectionCard>
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title="Pagamentos demonstrativos">
          {paid.length ? (
            <ul className="space-y-4">
              {paid.map((r) => (
                <li key={r.id} className="text-sm">
                  <p className="font-medium">
                    {r.period} · {data.brl(r.value)}
                  </p>
                  <p className="mt-1 break-words text-muted">
                    {data.property(data.lease(r.leaseId).propertyId).name}
                    {r.paidOn && ` · Recebido em ${data.date(r.paidOn)}`}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nenhum recebimento"
              description="As cobranças pagas demonstrativamente aparecerão aqui."
            />
          )}
        </SectionCard>
        <SectionCard title="Pendências">
          {pending.length ? (
            <ul className="space-y-4">
              {pending.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap justify-between gap-2 text-sm"
                >
                  <span>
                    {data.property(data.lease(r.leaseId).propertyId).name} ·{" "}
                    {data.brl(r.value)}
                  </span>
                  <StatusBadge>{r.status}</StatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nenhuma pendência"
              description="Não há cobranças pendentes ou atrasadas na carteira demonstrativa."
            />
          )}
        </SectionCard>
      </div>
    </>
  );
}
