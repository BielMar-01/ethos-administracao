import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";

export default function NotFound() {
  return <main className="mx-auto max-w-2xl space-y-6 px-6 py-24"><PageHeader title="Página não encontrada" eyebrow="Erro 404" description="O endereço solicitado não corresponde a uma página disponível." /><Link href="/" className="inline-block rounded-lg border border-border px-4 py-3 text-sm underline underline-offset-4">Voltar ao início</Link></main>;
}
