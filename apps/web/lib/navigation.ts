
import {
  LayoutDashboard,
  Building2,
  Users,
  KeyRound,
  FileText,
  Wallet,
  ClipboardCheck,
  Wrench,
  CalendarDays,
  ChartNoAxesCombined,
  Bell,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const mainNavigation: NavigationItem[] = [
  {
    label: "Dashboard",
    href: "/app/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Imóveis",
    href: "/app/properties",
    icon: Building2,
  },
  {
    label: "Proprietários",
    href: "/app/owners",
    icon: Users,
  },
  {
    label: "Inquilinos",
    href: "/app/tenants",
    icon: KeyRound,
  },
  {
    label: "Locações",
    href: "/app/leases",
    icon: FileText,
  },
  {
    label: "Contratos",
    href: "/app/contracts",
    icon: FileText,
  },
  {
    label: "Financeiro",
    href: "/app/finance",
    icon: Wallet,
  },
  {
    label: "Vistorias",
    href: "/app/inspections",
    icon: ClipboardCheck,
  },
  {
    label: "Manutenções",
    href: "/app/maintenance",
    icon: Wrench,
  },
  {
    label: "Agenda",
    href: "/app/calendar",
    icon: CalendarDays,
  },
  {
    label: "Relatórios",
    href: "/app/reports",
    icon: ChartNoAxesCombined,
  },
];

export const secondaryNavigation: NavigationItem[] = [
  {
    label: "Notificações",
    href: "/app/notifications",
    icon: Bell,
  },
  {
    label: "Configurações",
    href: "/app/settings",
    icon: Settings,
  },
];
