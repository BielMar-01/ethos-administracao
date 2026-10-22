"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthFrame } from "./auth-frame";
import { PasswordField, inputClass, actionClass } from "./password-field";
import { authRequest, authMessage } from "../../lib/auth-client";

type Mode =
  | "login"
  | "register"
  | "forgot-password"
  | "reset-password"
  | "verify-email";
const copy: Record<
  Mode,
  { title: string; description: string; button: string }
> = {
  login: {
    title: "Bem-vindo à Ethos.",
    description: "Entre para acessar sua organização e continuar sua gestão.",
    button: "Entrar com segurança",
  },
  register: {
    title: "Um novo começo para sua gestão.",
    description:
      "Crie sua conta. O acesso às organizações é concedido por um administrador.",
    button: "Criar minha conta",
  },
  "forgot-password": {
    title: "Vamos recuperar seu acesso.",
    description:
      "Informe seu e-mail. Se ele for elegível, enviaremos as instruções de recuperação.",
    button: "Enviar instruções",
  },
  "reset-password": {
    title: "Renove sua senha.",
    description: "Escolha uma senha forte e exclusiva para sua conta Ethos.",
    button: "Redefinir senha",
  },
  "verify-email": {
    title: "Confirme seu e-mail.",
    description:
      "Conclua a confirmação para entrar na sua conta com segurança.",
    button: "Confirmar e-mail",
  },
};
const subscribeHash = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
const linkToken = () =>
  new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const token = useSyncExternalStore(subscribeHash, linkToken, () => "");
  const details = copy[mode],
    resend = mode === "verify-email" && !token;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    const data = new FormData(event.currentTarget),
      email = String(data.get("email") ?? ""),
      password = String(data.get("password") ?? "");
    if (
      (mode === "register" || mode === "reset-password") &&
      (!/[A-Z]/.test(password) ||
        !/[a-z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !/[^A-Za-z0-9\s]/.test(password))
    ) {
      setError("A senha precisa cumprir todos os requisitos indicados.");
      setBusy(false);
      return;
    }
    if (mode === "reset-password" && !token) {
      setError("Abra o link enviado por e-mail ou solicite novas instruções.");
      setBusy(false);
      return;
    }
    const payload: Record<string, unknown> =
      mode === "login"
        ? { email, password }
        : mode === "register"
          ? { email, password, displayName: String(data.get("displayName")) }
          : mode === "forgot-password" || resend
            ? { email }
            : mode === "reset-password"
              ? { token, password }
              : { token };
    try {
      const response = await authRequest(
        resend ? "/resend-verification" : `/${mode}`,
        payload,
      );
      const result = await response.json();
      if (!response.ok) {
        setError(authMessage(result.error?.code));
        return;
      }
      if (mode === "login") {
        router.replace(
          result.assurance === "MFA_PENDING" || result.assurance === "MFA_SETUP"
            ? "/mfa"
            : "/organizations",
        );
        router.refresh();
        return;
      }
      setSuccess(
        mode === "reset-password"
          ? "Senha redefinida. Entre novamente para continuar."
          : mode === "verify-email" && !resend
            ? "E-mail confirmado. Você já pode entrar."
            : "Se os dados forem elegíveis, você receberá instruções por e-mail.",
      );
    } catch {
      setError(
        "O acesso está temporariamente indisponível. Tente novamente em instantes.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame title={details.title} description={details.description}>
      <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
        {mode === "register" && (
          <div>
            <label htmlFor="displayName" className="text-sm font-semibold">
              Seu nome
            </label>
            <input
              id="displayName"
              name="displayName"
              autoComplete="name"
              minLength={2}
              maxLength={200}
              required
              className={inputClass}
            />
          </div>
        )}
        {(mode === "login" ||
          mode === "register" ||
          mode === "forgot-password" ||
          resend) && (
          <div>
            <label htmlFor="email" className="text-sm font-semibold">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={320}
              className={inputClass}
            />
          </div>
        )}
        {(mode === "login" ||
          mode === "register" ||
          mode === "reset-password") && (
          <PasswordField newPassword={mode !== "login"} />
        )}
        {mode === "verify-email" && token && (
          <p className="text-sm leading-6 text-muted">
            Seu link está pronto. Confirme abaixo para ativar seu acesso.
          </p>
        )}
        {mode === "reset-password" && !token && (
          <p className="text-sm text-muted">
            Use o link de recuperação enviado ao seu e-mail.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-foreground"
          >
            {error}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm"
          >
            {success}
          </p>
        )}
        <button
          disabled={busy || !!success}
          className={`${actionClass} w-full`}
        >
          {busy ? "Aguarde…" : resend ? "Reenviar confirmação" : details.button}
        </button>
        <div className="flex flex-wrap justify-between gap-3 text-sm text-muted">
          {mode === "login" ? (
            <>
              <Link href="/forgot-password" className="hover:text-foreground">
                Esqueci minha senha
              </Link>
              <Link href="/register" className="hover:text-foreground">
                Criar conta
              </Link>
              <Link href="/verify-email" className="hover:text-foreground">
                Confirmar e-mail
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-foreground">
                Voltar para entrar
              </Link>
              {mode === "reset-password" && (
                <Link href="/forgot-password">Solicitar novo link</Link>
              )}
            </>
          )}
        </div>
      </form>
    </AuthFrame>
  );
}
