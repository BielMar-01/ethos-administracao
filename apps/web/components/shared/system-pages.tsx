import { NotificationCenter } from "./notification-center";
import { ModuleLayout, SectionCard, StatusBadge } from "./module-layout";
import { EmptyState } from "./empty-state";
import { reports, settings } from "../../lib/mock-data/system";

import { ReportOverview } from "./report-overview";

export function ReportsPage() {
  return (
    <ModuleLayout
      title="Relatórios"
      area="Inteligência patrimonial"
      description="Catálogo das análises previstas para acompanhar a evolução da carteira."
    >
      <ReportOverview />
      <SectionCard
        title="Catálogo de relatórios"
        description="Prévia das categorias planejadas. Geração e exportação ainda indisponíveis."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((r) => (
            <article
              key={r.id}
              className="rounded-xl border border-border bg-background p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">
                {r.category}
              </p>
              <h3 className="mt-3 font-semibold">{r.title}</h3>
              <p className="mb-5 mt-2 text-sm leading-relaxed text-muted">
                {r.description}
              </p>
              <StatusBadge>Disponibilidade futura</StatusBadge>
            </article>
          ))}
        </div>
      </SectionCard>
      <EmptyState
        title="Nenhum relatório gerado"
        description="A geração de relatórios e as exportações serão disponibilizadas em uma etapa futura."
      />
    </ModuleLayout>
  );
}

export function NotificationsPage() {
  return (
    <ModuleLayout
      title="Notificações"
      area="Central de avisos"
      description="Avisos derivados da carteira demonstrativa e indicação de leitura em memória."
    >
      <NotificationCenter />
    </ModuleLayout>
  );
}

export function SettingsPage() {
  return (
    <ModuleLayout
      title="Configurações"
      area="Sistema e organização"
      description="Conheça as áreas de configuração previstas para sua administradora."
    >
      <SectionCard
        title="Configurações da organização"
        description="Os cards apresentam o escopo futuro. Não há edição de dados ou configurações organizacionais persistentes nesta etapa."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {settings.map((r) => (
            <article
              key={r.id}
              className="rounded-xl border border-border bg-background p-5"
            >
              <p className="text-xs uppercase tracking-wider text-accent-foreground">
                {r.category}
              </p>
              <h3 className="mt-3 font-semibold">{r.title}</h3>
              <p className="mb-5 mt-2 text-sm leading-relaxed text-muted">
                {r.description}
              </p>
              <StatusBadge>
                {r.id === "preferences"
                  ? "Tema disponível no cabeçalho"
                  : "Configuração futura"}
              </StatusBadge>
            </article>
          ))}
        </div>
      </SectionCard>
    </ModuleLayout>
  );
}
