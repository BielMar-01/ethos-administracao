import { AppShell } from "../../../components/layout/app-shell";
import { DemoProvider } from "../../../components/providers/demo-provider";
import { requireSession } from "../../../lib/auth-server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession(true);
  return (
    <DemoProvider>
      <AppShell>{children}</AppShell>
    </DemoProvider>
  );
}
