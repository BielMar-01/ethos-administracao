import { FinanceWorkspace } from "../business/finance-workspace";
import { ResourcePanel } from "../business/resource-panel";

export function PropertiesPage() {
  return <ResourcePanel resource="properties" />;
}
export function OwnersPage() {
  return <ResourcePanel resource="owners" />;
}
export function TenantsPage() {
  return <ResourcePanel resource="tenants" />;
}
export function LeasesPage() {
  return <ResourcePanel resource="leases" />;
}
export function ContractsPage() {
  return <ResourcePanel resource="contracts" />;
}
export function FinancePage() {
  return <FinanceWorkspace />;
}
