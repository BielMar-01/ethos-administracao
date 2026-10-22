"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthFrame } from "./auth-frame";
import { PasswordField, actionClass } from "./password-field";
import { authRequest, authMessage } from "../../lib/auth-client";
import { LogoutButton } from "./logout-button";
export type Session = {
  id: string;
  deviceLabel: string;
  createdAt: string;
  lastSeenAt: string;
};
export function AccountSecurity({
  initialSessions,
  currentSessionId,
}: {
  initialSessions: Session[];
  currentSessionId: string;
}) {
  const router = useRouter(),
    [sessions, setSessions] = useState<Session[] | null>(initialSessions),
    [current, setCurrent] = useState(currentSessionId),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await authRequest("/sessions");
      if (!response.ok) throw Error();
      const result = await response.json();
      setSessions(result.sessions);
      setCurrent(result.currentSessionId);
    } catch {
      setError("Não foi possível carregar as sessões.");
    }
  }, []);
  async function action(
    path: string,
    body: Record<string, unknown>,
    message: string,
  ) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await authRequest(path, body),
        result = await response.json();
      if (!response.ok) {
        setError(authMessage(result.error?.code));
        return;
      }
      setStatus(message);
      if (
        path === "/change-password" ||
        path === "/logout-all" ||
        (path === "/sessions/revoke" && body.id === current)
      ) {
        router.replace("/login");
        router.refresh();
      } else await load();
    } catch {
      setError("Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }
  function passwordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void action(
      "/change-password",
      {
        currentPassword: String(data.get("currentPassword")),
        password: String(data.get("password")),
      },
      "Senha alterada. Entre novamente.",
    );
  }
  return (
    <AuthFrame
      title="Sua conta, sob seu controle."
      description="Gerencie sua senha, autenticação em duas etapas e dispositivos conectados."
    >
      <div className="space-y-8" aria-busy={busy}>
        <div className="flex flex-wrap justify-between gap-3">
          <Link
            href="/organizations"
            className="text-sm underline underline-offset-4"
          >
            Organizações
          </Link>
          <LogoutButton />
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-border p-3 text-sm"
          >
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="text-sm">
            {status}
          </p>
        )}
        <section>
          <h2 className="font-display text-2xl">Confirme sua identidade</h2>
          <p className="my-3 text-sm leading-6 text-muted">
            Ações sensíveis exigem confirmação recente da senha.
          </p>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const value = String(
                new FormData(event.currentTarget).get(
                  "reauthenticationPassword",
                ),
              );
              void action(
                "/reauthenticate",
                { password: value },
                "Identidade confirmada por cinco minutos.",
              );
              event.currentTarget.reset();
            }}
          >
            <PasswordField
              name="reauthenticationPassword"
              label="Senha atual"
            />
            <button disabled={busy} className={actionClass}>
              Confirmar identidade
            </button>
          </form>
        </section>
        <section className="border-t border-border pt-6">
          <h2 className="mb-4 font-display text-2xl">Alterar senha</h2>
          <form onSubmit={passwordChange} className="space-y-4">
            <PasswordField name="currentPassword" label="Senha atual" />
            <PasswordField newPassword label="Nova senha" />
            <button disabled={busy} className={actionClass}>
              Alterar senha e encerrar sessões
            </button>
          </form>
        </section>
        <section className="border-t border-border pt-6">
          <h2 className="mb-3 font-display text-2xl">
            Autenticação em duas etapas
          </h2>
          <p className="mb-4 text-sm leading-6 text-muted">
            Use um aplicativo autenticador. Para administradores da plataforma,
            esta proteção é obrigatória.
          </p>
          <Link href="/mfa" className={actionClass}>
            Gerenciar autenticador
          </Link>
        </section>
        <section className="border-t border-border pt-6">
          <h2 className="mb-4 font-display text-2xl">Sessões ativas</h2>
          {!sessions && <p role="status">Carregando sessões…</p>}
          <ul className="space-y-3">
            {sessions?.map((session) => (
              <li
                key={session.id}
                className="rounded-xl border border-border p-4"
              >
                <p className="break-words text-sm font-semibold">
                  {session.id === current
                    ? "Este dispositivo"
                    : session.deviceLabel || "Dispositivo"}
                </p>
                <p className="my-2 text-xs text-muted">
                  Última atividade:{" "}
                  {new Date(session.lastSeenAt).toLocaleString("pt-BR")}
                </p>
                <button
                  disabled={busy}
                  className="min-h-11 text-sm underline underline-offset-4"
                  onClick={() =>
                    void action(
                      "/sessions/revoke",
                      { id: session.id },
                      "Sessão encerrada.",
                    )
                  }
                >
                  Encerrar sessão
                </button>
              </li>
            ))}
          </ul>
          <button
            disabled={busy}
            className={`${actionClass} mt-4 w-full`}
            onClick={() =>
              void action("/logout-all", {}, "Sessões encerradas.")
            }
          >
            Sair de todos os dispositivos
          </button>
        </section>
      </div>
    </AuthFrame>
  );
}
