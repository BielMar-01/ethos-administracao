"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { businessRequest } from "../../lib/business-client";
import { useOrganization } from "../providers/business-provider";
import { PageHeader } from "../shared/page-header";
import { LoadingState } from "../shared/loading-state";
import { ErrorState } from "../shared/error-state";
import { Input } from "../ui/input";
import type { Result } from "@ethos/contracts";
export type Summary = {
  from: string;
  to: string;
  currency: string;
  counts: Record<string, number>;
  finance: Record<string, string> | null;
};
export function SummaryPanel({
  endpoint,
  title,
}: {
  endpoint: string;
  title: string;
}) {
  const org = useOrganization(),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const params = new URLSearchParams({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });
  const query = useQuery({
    queryKey: [org, endpoint, from, to],
    queryFn: ({ signal }) =>
      businessRequest<Result<Summary>>(`${endpoint}?${params}`, org, {
        signal,
      }),
  });
  const labels: Record<string, string> = {
    properties: "Imóveis",
    units: "Unidades",
    activeLeases: "Locações ativas",
    owners: "Proprietários",
    tenants: "Inquilinos",
    expected: "Cobranças emitidas",
    allocated: "Recebimentos alocados",
    outstanding: "Saldo em aberto",
    overdue: "Saldo vencido",
    cash: "Recebimentos confirmados",
  };
  return (
    <section className="space-y-5">
      <PageHeader
        title={title}
        eyebrow="Carteira da organização"
        description="Indicadores calculados a partir dos registros persistidos."
      />
      <div className="flex flex-wrap gap-4">
        <label className="text-sm">
          De
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Até
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <p className="text-sm text-muted">
            Período: {query.data.data.from} a {query.data.data.to}. Cobranças
            por competência; recebimentos pela data do pagamento.
          </p>
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries({
              ...query.data.data.counts,
              ...query.data.data.finance,
            }).map(([key, value]) => (
              <div
                key={key}
                className="rounded-2xl border border-border bg-surface p-5"
              >
                <dt className="text-sm text-muted">{labels[key] ?? key}</dt>
                <dd className="mt-3 break-words text-2xl font-semibold">
                  {typeof value === "string"
                    ? `${query.data.data.currency} ${value}`
                    : value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
