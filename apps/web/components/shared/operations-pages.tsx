import { ResourcePanel } from "../business/resource-panel";
export { CalendarWorkspace as CalendarPage } from "../business/complement-pages";
export function InspectionsPage() {
  return <ResourcePanel resource="inspections" />;
}
export function MaintenancePage() {
  return <ResourcePanel resource="maintenance" />;
}
