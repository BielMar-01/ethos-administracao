"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, PanelLeftClose, PanelLeftOpen, Building2 } from "lucide-react";
import {
  mainNavigation,
  secondaryNavigation,
  type NavigationItem,
} from "../../lib/navigation";
import { cn } from "../../lib/utils";

export function Sidebar({
  open,
  onClose,
  collapsed,
  onToggle,
}: {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  function item(item: NavigationItem) {
    const active =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        aria-label={item.label}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
          active
            ? "bg-primary/10 font-semibold text-accent-foreground"
            : "text-muted hover:bg-surface-secondary hover:text-foreground",
        )}
      >
        <Icon size={18} className="shrink-0" aria-hidden="true" />
        <span className="nav-label">{item.label}</span>
      </Link>
    );
  }
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        id="ethos-sidebar"
        aria-label="Navegação administrativa"
        onKeyDown={(event) => {
          if (!open || event.key !== "Tab") return;
          const elements = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>("a,button"),
          ).filter((element) => element.getClientRects().length > 0);
          const first = elements[0],
            last = elements.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        className={cn(
          "app-sidebar fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-surface lg:translate-x-0",
          open
            ? "visible translate-x-0"
            : "invisible -translate-x-full lg:visible",
        )}
      >
        <div className="sidebar-brand flex h-20 shrink-0 items-center justify-between border-b border-border px-6">
          <Link
            href="/app/dashboard"
            onClick={onClose}
            aria-label="Ethos Administração — Dashboard"
            className="flex items-center gap-3"
          >
            <Building2
              size={24}
              className="shrink-0 text-accent-foreground"
              aria-hidden="true"
            />
            <div className="brand-label">
              <div className="font-display text-xl font-semibold tracking-widest text-accent-foreground">
                ETHOS
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted">
                Administração
              </div>
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar navegação"
            className="rounded-lg p-2 lg:hidden"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav
          aria-label="Navegação principal"
          className="flex-1 space-y-1 overflow-y-auto px-3 py-5"
        >
          <p className="nav-group-label mb-3 px-3 text-xs font-semibold uppercase tracking-widest text-muted">
            Patrimônio e operação
          </p>
          {mainNavigation.map(item)}
          <div className="my-5 border-t border-border" />
          <p className="nav-group-label mb-3 px-3 text-xs font-semibold uppercase tracking-widest text-muted">
            Sistema
          </p>
          {secondaryNavigation.map(item)}
        </nav>
        <div className="shrink-0 border-t border-border p-4">
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expandir navegação" : "Recolher navegação"}
            aria-expanded={!collapsed}
            className="hidden w-full items-center justify-center gap-2 rounded-lg border border-border p-2 text-sm text-muted hover:text-foreground lg:flex"
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
            <span className="nav-label">Recolher menu</span>
          </button>
          <p className="sidebar-footer-copy mt-3 text-xs text-muted">
            Ethos Administração
          </p>
          <p className="sidebar-footer-copy text-xs text-muted">
            Carteira demonstrativa
          </p>
        </div>
      </aside>
    </>
  );
}
