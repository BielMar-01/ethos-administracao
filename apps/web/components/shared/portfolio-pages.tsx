import Link from "next/link";
import { AdministrativeModule } from "./administrative-module";
import { SectionCard } from "./module-layout";
import { FinanceSummary } from "./finance-summary";

export function PropertiesPage() {
  return <AdministrativeModule domain="properties" />;
}
export function OwnersPage() {
  return <AdministrativeModule domain="owners" />;
}
export function TenantsPage() {
  return <AdministrativeModule domain="tenants" />;
}
export function LeasesPage() {
  return (
    <AdministrativeModule domain="leases">
      <SectionCard
        title="O vínculo central da operação"
        description="O imóvel é o patrimônio; a locação define o vínculo comercial; o contrato formaliza esse vínculo."
      >
        <Link
          href="/app/contracts"
          className="text-sm underline underline-offset-4"
        >
          Consultar documentos contratuais
        </Link>
      </SectionCard>
    </AdministrativeModule>
  );
}
export function ContractsPage() {
  return (
    <AdministrativeModule domain="contracts">
      <SectionCard
        title="Ciclo contratual"
        description="Sem geração de documentos ou assinatura digital."
      >
        <ol className="flex flex-wrap gap-3">
          {[
            "Rascunho",
            "Aguardando assinatura",
            "Assinado",
            "Vigente",
            "Encerrado",
          ].map((step, index) => (
            <li
              key={step}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              {index + 1}. {step}
              {index < 4 && <span aria-hidden="true"> →</span>}
            </li>
          ))}
        </ol>
      </SectionCard>
    </AdministrativeModule>
  );
}
export function FinancePage() {
  return (
    <AdministrativeModule domain="charges">
      <FinanceSummary />
    </AdministrativeModule>
  );
}
