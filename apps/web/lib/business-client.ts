import type { ApiError } from "@ethos/contracts";
import { refreshSession } from "./auth-client";
export class ApiFault extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}
const messages: Record<string, string> = {
  ACCESS_DENIED: "Você não tem permissão para esta operação.",
  STATE_CONFLICT:
    "A operação conflita com vínculos ou histórico. Atualize os dados e confira o estado do registro.",
  RESOURCE_NOT_FOUND: "Registro indisponível nesta organização.",
  PERSISTENCE_NOT_ENABLED:
    "A escrita ainda não está habilitada neste ambiente.",
  HISTORY_IMMUTABLE:
    "Este registro é histórico. Use a operação de renovação, reajuste ou uma nova versão.",
  ORGANIZATION_CHANGED: "A organização da sessão mudou. Selecione-a novamente.",
  CSRF_REJECTED: "Não foi possível validar a solicitação. Atualize a página.",
};
export async function businessRequest<T>(
  path: string,
  organizationId: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
  retry = true,
): Promise<T> {
  const method = options.method ?? "GET",
    headers: Record<string, string> = { "x-ethos-context": organizationId };
  if (method !== "GET") {
    const challenge = await fetch("/api/auth/csrf", {
      cache: "no-store",
      credentials: "same-origin",
      signal: options.signal,
    });
    if (!challenge.ok)
      throw new ApiFault(
        challenge.status,
        "CSRF_REJECTED",
        "Não foi possível validar a solicitação.",
      );
    headers["x-csrf-token"] = (await challenge.json()).csrfToken;
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`/api/business/${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
    cache: "no-store",
    credentials: "same-origin",
    signal: options.signal,
  });
  if (response.status === 401 && retry) {
    if (await refreshSession())
      return businessRequest(path, organizationId, options, false);
    // Security boundary: discard all client state when the session is lost.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
  if (!response.ok) {
    const result = (await response
      .json()
      .catch(() => ({ error: { code: "SERVICE_UNAVAILABLE" } }))) as ApiError;
    const code = result.error?.code ?? "SERVICE_UNAVAILABLE";
    // Full navigation discards the stale organization's query cache.
    if (code === "ORGANIZATION_CHANGED")
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/organizations");
    throw new ApiFault(
      response.status,
      code,
      messages[code] ??
        result.error?.message ??
        "Não foi possível concluir a operação.",
      result.error?.fields,
    );
  }
  return response.json() as Promise<T>;
}
