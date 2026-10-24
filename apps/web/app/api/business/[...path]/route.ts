import { NextRequest, NextResponse } from "next/server";
import { resourceNames, definition, type Resource } from "@ethos/contracts";
import {
  apiOrigin,
  authCookies,
  webOrigin,
} from "../../../../lib/auth-transport";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function allowed(path: string[], method: string) {
  const [resource, id, action] = path;
  if (!resource || path.length > 3) return false;
  if (resourceNames.includes(resource as Resource)) {
    if (path.length === 1) return ["GET", "POST"].includes(method);
    if (!id || !uuid.test(id)) return false;
    if (path.length === 2) return ["GET", "PATCH"].includes(method);
    const d = definition(resource as Resource);
    return (
      method === "POST" &&
      [...(d.actions ?? []), ...(d.archive ? ["archive"] : [])].includes(
        action ?? "",
      )
    );
  }
  return (
    (method === "GET" &&
      ((path.length === 1 &&
        ["dashboard", "calendar", "notifications", "settings"].includes(
          resource,
        )) ||
        (path.length === 2 &&
          resource === "reports" &&
          ["portfolio", "finance", "occupancy"].includes(id ?? "")) ||
        (resource === "finance" && id === "summary" && path.length === 2))) ||
    (resource === "settings" && path.length === 1 && method === "PATCH") ||
    (resource === "notifications" &&
      Boolean(id && uuid.test(id)) &&
      action === "read" &&
      path.length === 3 &&
      method === "POST")
  );
}
async function bridge(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!allowed(path, request.method))
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND" } },
      { status: 404 },
    );
  if (request.method !== "GET" && request.headers.get("origin") !== webOrigin())
    return NextResponse.json(
      { success: false, error: { code: "CSRF_REJECTED" } },
      { status: 403 },
    );
  const context = request.headers.get("x-ethos-context");
  if (!context || !uuid.test(context))
    return NextResponse.json(
      { success: false, error: { code: "ORGANIZATION_REQUIRED" } },
      { status: 409 },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 65536)
    return new NextResponse(null, { status: 413 });
  try {
    const body = request.method === "GET" ? undefined : await request.text();
    if (body && Buffer.byteLength(body) > 65536)
      return new NextResponse(null, { status: 413 });
    const upstream = await fetch(
      `${apiOrigin()}/api/v1/${path.join("/")}${request.nextUrl.search}`,
      {
        method: request.method,
        body,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
        headers: {
          cookie: authCookies(request.headers.get("cookie") ?? ""),
          origin: request.headers.get("origin") ?? "",
          "content-type": "application/json",
          "x-csrf-token": request.headers.get("x-csrf-token") ?? "",
          "x-ethos-context": context,
          "if-match": request.headers.get("if-match") ?? "",
          "idempotency-key": request.headers.get("idempotency-key") ?? "",
        },
      },
    );
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        ...(upstream.headers.has("etag")
          ? { etag: upstream.headers.get("etag")! }
          : {}),
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Serviço temporariamente indisponível.",
        },
      },
      { status: 503 },
    );
  }
}
export const GET = bridge;
export const POST = bridge;
export const PATCH = bridge;
