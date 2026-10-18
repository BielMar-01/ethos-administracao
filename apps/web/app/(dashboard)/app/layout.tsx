import { AppShell } from "../../../components/layout/app-shell";
import { DemoProvider } from "../../../components/providers/demo-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DemoProvider>
      <AppShell>{children}</AppShell>
    </DemoProvider>
  );
}
