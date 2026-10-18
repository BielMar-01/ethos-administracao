import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export default function NotFound() {
  return <div className="space-y-6"><PageHeader title="Página não encontrada" eyebrow="Erro 404" description="Esta área administrativa não existe ou foi movida." /><EmptyState title="Vamos voltar à administração?" description="Use a navegação lateral para encontrar uma das áreas disponíveis." action={<Link href="/app/dashboard" className="rounded-lg border border-border px-4 py-3 text-sm underline underline-offset-4">Voltar ao Dashboard</Link>} /></div>;
}
