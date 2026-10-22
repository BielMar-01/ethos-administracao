let refreshing: Promise<boolean> | undefined;
export async function authRequest(
  path: string,
  body?: Record<string, unknown>,
  retry = true,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body) {
    const challenge = await fetch("/api/auth/csrf", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!challenge.ok) return challenge;
    headers["x-csrf-token"] = (await challenge.json()).csrfToken;
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`/api/auth${path}`, {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (
    response.status === 401 &&
    retry &&
    !["/login", "/refresh", "/verify-email", "/reset-password"].includes(path)
  ) {
    refreshing ??= authRequest("/refresh", {}, false)
      .then((r) => r.ok)
      .finally(() => {
        refreshing = undefined;
      });
    if (await refreshing) return authRequest(path, body, false);
  }
  return response;
}
export function authMessage(code?: string) {
  const messages: Record<string, string> = {
    INVALID_CREDENTIALS:
      "Não foi possível entrar. Confira seus dados e a confirmação do e-mail.",
    RATE_LIMIT_EXCEEDED:
      "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
    INVALID_OR_EXPIRED_TOKEN:
      "Este link expirou ou já foi usado. Solicite um novo link.",
    INVALID_MFA_CODE:
      "Código inválido ou já utilizado. Aguarde um novo código ou use um código de recuperação.",
    REAUTHENTICATION_REQUIRED: "Confirme sua senha novamente para continuar.",
    CSRF_REJECTED:
      "Não foi possível validar esta solicitação. Atualize a página e tente novamente.",
    MFA_REQUIRED: "Confirme sua autenticação em duas etapas para continuar.",
  };
  return (
    messages[code ?? ""] ??
    "Não foi possível concluir. Verifique os dados e tente novamente."
  );
}
