"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthFrame } from "./auth-frame";
import { LogoutButton } from "./logout-button";
import { authRequest, authMessage } from "../../lib/auth-client";
import { actionClass } from "./password-field";
export function OrganizationPicker() {
  const router = useRouter(),
    [organizations, setOrganizations] = useState<
      { id: string; name: string }[] | null
    >(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    authRequest("/me")
      .then(async (response) => {
        if (!response.ok) throw Error();
        const result = await response.json();
        if (active) setOrganizations(result.organizations);
      })
      .catch(() => {
        if (active)
          setError(
            "Não foi possível carregar suas organizações. Tente entrar novamente.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function choose(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await authRequest("/organization", { organizationId: id });
      if (!result.ok) {
        setError(authMessage((await result.json()).error?.code));
        return;
      }
      router.replace("/app/dashboard");
      router.refresh();
    } catch {
      setError("Não foi possível selecionar a organização.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title="Seu espaço de gestão."
      description="Escolha uma organização para continuar. O acesso depende dos vínculos e permissões da sua conta."
    >
      <div className="space-y-5">
        {!organizations && !error && (
          <p role="status">Carregando organizações…</p>
        )}
        {organizations?.length === 0 && (
          <p className="leading-7 text-muted">
            Sua conta ainda não possui uma organização ativa. Solicite o vínculo
            ao administrador da sua organização.
          </p>
        )}
        {organizations?.map((org) => (
          <button
            key={org.id}
            disabled={busy}
            onClick={() => choose(org.id)}
            className={`${actionClass} w-full break-words`}
          >
            {org.name}
          </button>
        ))}
        {error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/account/security"
            className="text-sm text-muted underline underline-offset-4"
          >
            Segurança da conta
          </Link>
          <LogoutButton />
        </div>
      </div>
    </AuthFrame>
  );
}
