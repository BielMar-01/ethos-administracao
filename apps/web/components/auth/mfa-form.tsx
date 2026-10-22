"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthFrame } from "./auth-frame";
import { LogoutButton } from "./logout-button";
import { actionClass, inputClass } from "./password-field";
import { authRequest, authMessage } from "../../lib/auth-client";
export function MfaForm() {
  const router = useRouter(),
    [enabled, setEnabled] = useState<boolean | null>(null),
    [secret, setSecret] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    authRequest("/me")
      .then(async (r) => {
        if (!r.ok) throw Error();
        setEnabled((await r.json()).mfaEnabled);
      })
      .catch(() => setError("Entre novamente para continuar."));
  }, []);
  async function setup() {
    setBusy(true);
    try {
      const result = await authRequest("/mfa/setup", {}),
        data = await result.json();
      if (!result.ok) {
        setError(authMessage(data.error?.code));
        return;
      }
      setSecret(data.secret);
    } catch {
      setError("Não foi possível preparar o autenticador.");
    } finally {
      setBusy(false);
    }
  }
  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    try {
      const response = await authRequest(
          secret ? "/mfa/enable" : "/mfa/verify",
          { code },
        ),
        result = await response.json();
      if (!response.ok) {
        setError(authMessage(result.error?.code));
        return;
      }
      setSecret("");
      if (result.recoveryCodes?.length) setCodes(result.recoveryCodes);
      else {
        router.replace("/organizations");
        router.refresh();
      }
    } catch {
      setError("Não foi possível verificar o código.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title="Uma camada extra de proteção."
      description="Confirme com seu aplicativo autenticador. A autenticação em duas etapas é obrigatória para administradores da plataforma."
    >
      <div className="space-y-5">
        {enabled === null && !error && (
          <p role="status">Carregando segurança…</p>
        )}
        {enabled === false && !secret && !codes.length && (
          <>
            <p className="text-sm leading-6 text-muted">
              Configure uma conta TOTP no seu aplicativo autenticador e guarde
              os códigos de recuperação em um local seguro.
            </p>
            <button
              disabled={busy}
              onClick={setup}
              className={`${actionClass} w-full`}
            >
              Configurar autenticador
            </button>
          </>
        )}
        {secret && (
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="mb-3 text-sm font-semibold">
              Adicione esta chave manualmente ao autenticador
            </p>
            <code className="block break-all text-sm tracking-wider">
              {secret}
            </code>
            <p className="mt-3 text-xs leading-5 text-muted">
              Selecione TOTP, 6 dígitos e intervalo de 30 segundos. Não
              compartilhe esta chave.
            </p>
          </div>
        )}
        {(enabled === true || !!secret) && !codes.length && (
          <form onSubmit={verify} className="space-y-4">
            <label className="block text-sm font-semibold" htmlFor="code">
              {secret
                ? "Código do autenticador"
                : "Código do autenticador ou de recuperação"}
              <input
                name="code"
                id="code"
                autoComplete="one-time-code"
                required
                minLength={6}
                maxLength={64}
                className={inputClass}
              />
            </label>
            <button disabled={busy} className={`${actionClass} w-full`}>
              {busy ? "Verificando…" : "Confirmar código"}
            </button>
          </form>
        )}
        {!!codes.length && (
          <div>
            <p role="status" className="mb-4 text-sm leading-6">
              Autenticação em duas etapas ativada. Guarde estes códigos agora:
              cada um só pode ser usado uma vez e não será exibido novamente.
            </p>
            <ul className="space-y-2 rounded-xl bg-background p-4">
              {codes.map((code) => (
                <li key={code} className="break-all font-mono text-xs">
                  {code}
                </li>
              ))}
            </ul>
            <button
              className={`${actionClass} mt-5 w-full`}
              onClick={() => {
                setCodes([]);
                router.replace("/organizations");
                router.refresh();
              }}
            >
              Salvei os códigos, continuar
            </button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <LogoutButton />
      </div>
    </AuthFrame>
  );
}
