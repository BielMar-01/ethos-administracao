import Link from "next/link";
import { ThemeToggle } from "../ui/theme-toggle";
export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" aria-label="Ethos Administração, início">
          <span className="block text-xl font-semibold tracking-[0.25em]">
            ETHOS
          </span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-muted">
            Administração
          </span>
        </Link>
        <ThemeToggle />
      </header>
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-8 sm:px-8 sm:py-14 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <section className="max-w-lg">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Confiança em cada detalhe
          </p>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 text-base leading-7 text-muted">{description}</p>
          <p className="mt-8 hidden border-l-2 border-primary pl-5 text-sm leading-7 text-muted lg:block">
            Sua gestão com clareza, organização e a segurança que seu patrimônio
            merece.
          </p>
        </section>
        <section className="min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-xl shadow-black/5 sm:p-9">
          {children}
        </section>
      </div>
      <footer className="px-5 py-8 text-center text-xs text-muted">
        Ethos Administração · Gestão com confiança
      </footer>
    </main>
  );
}
