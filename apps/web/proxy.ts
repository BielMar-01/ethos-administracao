import { NextRequest, NextResponse } from "next/server";
import {
  apiFetch,
  authCookies,
  patchCookies,
  webOrigin,
} from "./lib/auth-transport";

export async function proxy(request: NextRequest) {
  let cookie = authCookies(request.headers.get("cookie") ?? "");
  const changes: string[] = [];
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    for (const value of changes) response.headers.append("set-cookie", value);
    return response;
  };
  try {
    let result = await apiFetch("/me", cookie);
    if (result.status === 401) {
      const challenge = await apiFetch("/csrf", cookie);
      if (challenge.ok) {
        changes.push(...challenge.headers.getSetCookie());
        cookie = patchCookies(cookie, changes);
        const csrf = (await challenge.json()).csrfToken;
        const refreshed = await apiFetch("/refresh", cookie, {
          method: "POST",
          headers: {
            origin: webOrigin(),
            "x-csrf-token": csrf,
            "content-type": "application/json",
          },
          body: "{}",
        });
        changes.push(...refreshed.headers.getSetCookie());
        cookie = patchCookies(cookie, refreshed.headers.getSetCookie());
        if (refreshed.ok) result = await apiFetch("/me", cookie);
      }
    }
    if (!result.ok) return redirect("/login");
    const current = await result.json(),
      path = request.nextUrl.pathname;
    const limited =
      (current.assurance !== "PASSWORD" && current.assurance !== "MFA") ||
      (current.superAdmin && current.assurance !== "MFA");
    if (limited && path !== "/mfa") return redirect("/mfa");
    if (path.startsWith("/app")) {
      if (!current.organizationId) return redirect("/organizations");
      const resource = path.split("/")[2] || "dashboard";
      const check = await apiFetch(
        `/authorize?permission=${encodeURIComponent(resource + ".read")}`,
        cookie,
      );
      if (!check.ok)
        return redirect(
          check.status === 409 ? "/organizations" : "/access-denied",
        );
    }
    const headers = new Headers(request.headers);
    headers.set("cookie", cookie);
    const response = NextResponse.next({ request: { headers } });
    for (const value of changes) response.headers.append("set-cookie", value);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return redirect("/login?unavailable=1");
  }
}
export const config = {
  matcher: ["/app/:path*", "/organizations", "/account/:path*", "/mfa"],
};
