import { AppShell } from "../../../components/layout/app-shell";
import { BusinessProvider } from "../../../components/providers/business-provider";
import { requireSession } from "../../../lib/auth-server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession(true);
  return (
    <BusinessProvider
      key={`${session.user.id}:${session.organizationId}`}
      organizationId={session.organizationId}
    >
      <AppShell>{children}</AppShell>
    </BusinessProvider>
  );
}
