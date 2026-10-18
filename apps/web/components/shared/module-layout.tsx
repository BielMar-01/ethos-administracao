import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { PageHeader } from "./page-header";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { EmptyState } from "./empty-state";
import { MetricCard } from "./metric-card";

export function DemoDataNotice() {
  return (
    <p className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-xs leading-relaxed text-muted">
      <Info
        size={18}
        className="mt-0.5 shrink-0 text-primary"
        aria-hidden="true"
      />
      <span>
        Ambiente demonstrativo · Referência: 17/10/2026. Alterações existem
        somente em memória e são perdidas ao recarregar a página. Nenhuma
        operação real é executada.
      </span>
    </p>
  );
}

export function ModuleLayout({
  title,
  description,
  area,
  children,
}: {
  title: string;
  description: string;
  area: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader title={title} description={description} eyebrow={area} />
      <DemoDataNotice />
      {children}
    </div>
  );
}

export type Metric = { label: string; value: string | number; detail?: string };
export function StatCards({ items }: { items: Metric[] }) {
  return (
    <section
      aria-label="Indicadores demonstrativos"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {items.map((item) => (
        <MetricCard key={item.label} {...item} />
      ))}
    </section>
  );
}

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export function StatusBadge({ children }: { children: string }) {
  const variant = [
    "Pago",
    "Ativa",
    "Ativo",
    "Vigente",
    "Assinado",
    "Concluída",
    "Concluído",
    "Disponível",
  ].includes(children)
    ? "success"
    : ["Atrasado", "Cancelado", "Prioridade urgente"].includes(children)
      ? "danger"
      : [
            "Pendente",
            "Aguardando assinatura",
            "Aguardando orçamento",
            "Em manutenção",
            "Prioridade alta",
          ].includes(children)
        ? "warning"
        : ["Agendada", "Em andamento", "Em elaboração"].includes(children)
          ? "info"
          : "default";
  return <Badge variant={variant}>{children}</Badge>;
}

export type Column<T> = { label: string; render: (record: T) => ReactNode };
export function RecordList<T extends { id: string }>({
  records,
  columns,
  title,
}: {
  records: readonly T[];
  columns: Column<T>[];
  title: string;
}) {
  if (!records.length)
    return (
      <EmptyState
        title="Nenhum registro demonstrativo"
        description="Os registros desta área aparecerão aqui quando estiverem disponíveis."
      />
    );
  return (
    <section aria-label={title} className="space-y-3">
      {records.map((record) => (
        <article
          key={record.id}
          className="rounded-xl border border-border bg-background p-4"
        >
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            {columns.map((column) => (
              <div key={column.label} className="min-w-0">
                <dt className="text-xs text-muted">{column.label}</dt>
                <dd className="mt-1 break-words text-sm font-medium">
                  {column.render(record)}
                </dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </section>
  );
}
