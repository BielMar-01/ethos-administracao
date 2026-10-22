import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiFetch } from "./auth-transport";
export async function requireSession(requireOrganization = false) {
  let response: Response;
  try {
    response = await apiFetch("/me", (await cookies()).toString());
  } catch {
    redirect("/login?unavailable=1");
  }
  if (!response.ok) redirect("/login");
  const session = await response.json();
  if (
    (session.assurance !== "PASSWORD" && session.assurance !== "MFA") ||
    (session.superAdmin && session.assurance !== "MFA")
  )
    redirect("/mfa");
  if (requireOrganization && !session.organizationId)
    redirect("/organizations");
  return session;
}
