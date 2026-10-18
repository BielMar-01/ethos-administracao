"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, House } from "lucide-react";

import { mainNavigation, secondaryNavigation } from "../../lib/navigation";

export function Breadcrumbs() {
  const pathname = usePathname();

  const items = [...mainNavigation, ...secondaryNavigation];

  const currentPage = items
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];

  const isDashboard = pathname === "/app/dashboard";

  return (
    <nav aria-label="Caminho de navegação">
      <ol className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <li>
          <Link
            href="/app/dashboard"
            className="flex items-center gap-2 transition-colors hover:text-foreground"
          >
            <House size={14} />
            Início
          </Link>
        </li>

        {!isDashboard && (
          <>
            <li aria-hidden="true">
              <ChevronRight size={14} />
            </li>

            <li aria-current="page" className="font-medium text-foreground">
              {currentPage?.label ?? "Página"}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
