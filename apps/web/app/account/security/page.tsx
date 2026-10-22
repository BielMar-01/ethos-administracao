import { requireSession } from "../../../lib/auth-server";
import { AccountSecurity } from "../../../components/auth/account-security";
import { apiFetch } from "../../../lib/auth-transport";
import { cookies } from "next/headers";
export default async function Security() {
  await requireSession();
  const response = await apiFetch("/sessions", (await cookies()).toString());
  if (!response.ok) throw new Error("ACCOUNT_SESSIONS_UNAVAILABLE");
  const { sessions, currentSessionId } = await response.json();
  return (
    <AccountSecurity
      initialSessions={sessions}
      currentSessionId={currentSessionId}
    />
  );
}
