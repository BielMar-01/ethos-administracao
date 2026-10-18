"use client";

import {
  Building2,
  CircleCheck,
  Clock3,
  Wallet,
  FileWarning,
  Wrench,
} from "lucide-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";

import { Badge } from "../../../../components/ui/badge";

import { PageHeader } from "@/components/shared/page-header";
import { DemoDataNotice } from "@/components/shared/module-layout";
import { useDemoSnapshot } from "@/components/providers/demo-provider";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";

export default function DashboardPage() {
  const {
    properties,
    activeLeases,
    contractedRevenue,
    brl,
    octoberCharges,
    contracts,
    nearExpiry,
    maintenance,
    charges,
  } = useDemoSnapshot();
  const metrics = [
    {
      title: "Total de imóveis",
      value: String(properties.length),
      detail: "Imóveis cadastrados",
      icon: Building2,
    },
    {
      title: "Imóveis alugados",
      value: String(activeLeases.length),
      detail: `${Math.round((properties.filter((item) => item.status === "Alugado").length / (properties.length || 1)) * 100)}% de ocupação`,
      icon: CircleCheck,
    },
    {
      title: "Receita prevista",
      value: brl(contractedRevenue),
      detail: "Referência mensal",
      icon: Wallet,
    },
    {
      title: "Pagamentos pendentes",
      value: String(
        octoberCharges.filter(
          (item) => item.status === "Pendente" || item.status === "Atrasado",
        ).length,
      ),
      detail: "Cobranças em aberto",
      icon: Clock3,
    },
  ];

  const activities = [
    ...charges
      .filter((r) => r.status === "Pago")
      .slice(0, 1)
      .map((r) => ({
        title: "Recebimento demonstrativo",
        description: r.period,
        status: r.status,
        variant: "success" as const,
      })),
    ...contracts
      .filter((r) => r.status === "Vigente" && nearExpiry(r.end))
      .slice(0, 1)
      .map((r) => ({
        title: "Contrato a acompanhar",
        description: r.number,
        status: r.status,
        variant: "warning" as const,
      })),
    ...maintenance
      .filter((r) => r.status !== "Conclu\u00edda")
      .slice(0, 1)
      .map((r) => ({
        title: "Reparo demonstrativo",
        description: r.description,
        status: r.status,
        variant: "info" as const,
      })),
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        eyebrow="Visão geral"
        description="Acompanhe os principais indicadores da sua operação."
      />
      <DemoDataNotice />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.title}
            label={metric.title}
            value={metric.value}
            detail={metric.detail}
            icon={metric.icon}
          />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Atividades recentes</CardTitle>
            <CardDescription>
              Últimos acontecimentos da administração.
            </CardDescription>
          </CardHeader>

          <div className="divide-y divide-border">
            {!activities.length && (
              <EmptyState
                title="Nenhuma atividade para acompanhar"
                description="Os acontecimentos da carteira demonstrativa aparecerão aqui."
              />
            )}
            {activities.map((activity) => (
              <div
                key={activity.title}
                className="flex flex-wrap items-center justify-between gap-3 py-5"
              >
                <div>
                  <p className="text-sm font-medium">{activity.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {activity.description}
                  </p>
                </div>

                <Badge variant={activity.variant}>{activity.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Contratos</CardTitle>
              <CardDescription>Acompanhamento de vencimentos.</CardDescription>
            </CardHeader>

            <div className="flex items-center gap-4">
              <FileWarning className="text-primary" size={28} />
              <div>
                <p className="text-2xl font-semibold">
                  {
                    contracts.filter(
                      (item) =>
                        item.status === "Vigente" && nearExpiry(item.end),
                    ).length
                  }
                </p>
                <p className="text-xs text-muted">Próximos do vencimento</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manutenções</CardTitle>
              <CardDescription>Solicitações em acompanhamento.</CardDescription>
            </CardHeader>

            <div className="flex items-center gap-4">
              <Wrench className="text-primary" size={28} />
              <div>
                <p className="text-2xl font-semibold">
                  {
                    maintenance.filter((item) => item.status === "Aberta")
                      .length
                  }
                </p>
                <p className="text-xs text-muted">Solicitações abertas</p>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
