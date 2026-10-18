import { AdministrativeModule } from "./administrative-module";
import { ModuleLayout } from "./module-layout";
import { CalendarView } from "./calendar-view";

export function InspectionsPage() {
  return <AdministrativeModule domain="inspections" />;
}
export function MaintenancePage() {
  return <AdministrativeModule domain="maintenance" />;
}
export function CalendarPage() {
  return (
    <ModuleLayout
      title="Agenda"
      area="Planejamento da operação"
      description="Compromissos e vencimentos a partir de 17 de outubro de 2026, derivados da carteira em memória."
    >
      <CalendarView />
    </ModuleLayout>
  );
}
