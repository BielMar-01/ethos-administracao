import Link from "next/link";
import { ThemeToggle } from "../components/ui/theme-toggle";

import {
  Building2,
  FileText,
  ShieldCheck,
  Wallet,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    title: "Gestão de imóveis",
    description: "Centralize propriedades e locações.",
    icon: Building2,
  },
  {
    title: "Contratos",
    description: "Organize documentos e renovações.",
    icon: FileText,
  },
  {
    title: "Financeiro",
    description: "Acompanhe cobranças e pagamentos.",
    icon: Wallet,
  },
  {
    title: "Segurança",
    description: "Controle de acesso e histórico.",
    icon: ShieldCheck,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7">
        <div>
          <div className="text-2xl font-semibold tracking-[0.2em] text-accent-foreground">
            ETHOS
          </div>
          <div className="text-[10px] uppercase tracking-[0.35em] text-muted">
            Administração
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />

          <Link
            href="/app/dashboard"
            className="rounded-lg border border-border px-5 py-3 text-sm transition hover:border-primary"
          >
            Demonstração
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pb-20 pt-20 md:pt-32">
        <div className="max-w-3xl">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.35em] text-accent-foreground">
            Gestão imobiliária inteligente
          </p>

          <h1 className="font-display text-4xl font-medium leading-tight tracking-tight md:text-6xl">
            A excelência na gestão começa com confiança.
          </h1>

          <p className="mt-7 max-w-xl text-base leading-8 text-muted">
            Uma plataforma para organizar imóveis, inquilinos, contratos,
            pagamentos e todo o ciclo de vida das suas locações.
          </p>

          <Link
            href="/app/dashboard"
            className="mt-10 inline-flex items-center gap-3 rounded-lg bg-primary px-7 py-4 font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Explorar demonstração
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => {
          const Icon = feature.icon;

          return (
            <article
              key={feature.title}
              className="rounded-xl border border-border bg-surface p-6"
            >
              <Icon className="mb-6 text-primary" size={25} />

              <h2 className="mb-2 text-lg font-semibold">{feature.title}</h2>

              <p className="text-sm leading-6 text-muted">
                {feature.description}
              </p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
