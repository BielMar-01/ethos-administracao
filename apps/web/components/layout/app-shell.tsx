"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useMobile } from "../../hooks/use-mobile";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const mobile = useMobile();
  const sidebarOpen = mobile && openPath === pathname;
  useEffect(() => {
    if (!sidebarOpen) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document
      .querySelector<HTMLButtonElement>(
        '#ethos-sidebar button[aria-label="Fechar navegação"]',
      )
      ?.focus();
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenPath(null);
    }
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [sidebarOpen]);
  return (
    <div
      className="app-frame min-h-screen bg-background text-foreground"
      data-collapsed={collapsed}
    >
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setOpenPath(null)}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
      />
      <div className="shell-content min-h-screen" inert={sidebarOpen}>
        <Header
          menuOpen={sidebarOpen}
          onMenuClick={() => setOpenPath(pathname)}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full min-w-0 max-w-screen-2xl space-y-6 p-4 md:p-8 xl:p-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
