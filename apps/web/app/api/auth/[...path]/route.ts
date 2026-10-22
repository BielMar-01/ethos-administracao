import { NextRequest, NextResponse } from "next/server";
import { apiFetch, webOrigin } from "../../../../lib/auth-transport";

const paths = new Set([
  "csrf",
  "register",
  "login",
  "logout",
  "logout-all",
  "forgot-password",
  "reset-password",
  "verify-email",
  "resend-verification",
  "refresh",
  "reauthenticate",
  "change-password",
  "me",
  "sessions",
  "sessions/revoke",
  "organization",
  "permissions",
  "authorize",
  "mfa/setup",
  "mfa/enable",
  "mfa/verify",
  "platform/access",
]);
async function bridge(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params,
    route = path.join("/");
  if (!paths.has(route))
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (request.method !== "GET" && request.headers.get("origin") !== webOrigin())
    return NextResponse.json(
      { error: { code: "CSRF_REJECTED" } },
      { status: 403 },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 16384)
    return new NextResponse(null, { status: 413 });
  try {
    const body = request.method === "GET" ? undefined : await request.text();
    if (body && Buffer.byteLength(body) > 16384)
      return new NextResponse(null, { status: 413 });
    const upstream = await apiFetch(
      `/${route}${request.nextUrl.search}`,
      request.headers.get("cookie") ?? "",
      {
        method: request.method,
        body,
        headers: {
          "content-type": "application/json",
          origin: request.headers.get("origin") ?? "",
          "x-csrf-token": request.headers.get("x-csrf-token") ?? "",
          "user-agent": request.headers.get("user-agent") ?? "",
        },
      },
    );
    const response = new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
    for (const cookie of upstream.headers.getSetCookie())
      response.headers.append("set-cookie", cookie);
    return response;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Acesso temporariamente indisponível.",
        },
      },
      { status: 503 },
    );
  }
}
export const GET = bridge;
export const POST = bridge;
