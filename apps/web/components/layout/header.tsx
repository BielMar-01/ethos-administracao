"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Bell, CircleUserRound } from "lucide-react";
import { ThemeToggle } from "../ui/theme-toggle";
import { Breadcrumbs } from "../shared/breadcrumbs";
import { mainNavigation, secondaryNavigation } from "../../lib/navigation";

export function Header({
  onMenuClick,
  menuOpen,
}: {
  onMenuClick: () => void;
  menuOpen: boolean;
}) {
  const pathname = usePathname();
  const current =
    [...mainNavigation, ...secondaryNavigation].find(
      (item) => pathname === item.href,
    )?.label ?? "Administração";
  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-md md:px-8 xl:px-10">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Abrir menu"
          aria-controls="ethos-sidebar"
          aria-expanded={menuOpen}
          className="control shrink-0 rounded-lg border border-border p-2 lg:hidden"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{current}</p>
          <p className="text-xs text-muted sm:hidden">Ethos Administração</p>
          <div className="mt-1 hidden sm:block">
            <Breadcrumbs />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <ThemeToggle />
        <Link
          href="/app/notifications"
          aria-label="Abrir central de notificações"
          className="control flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground"
        >
          <Bell size={18} aria-hidden="true" />
        </Link>
        <span
          title="Perfil — indisponível no ambiente demonstrativo"
          className="hidden h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-accent-foreground sm:flex"
        >
          <CircleUserRound size={22} aria-hidden="true" />
        </span>
      </div>
    </header>
  );
}
