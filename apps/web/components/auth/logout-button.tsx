"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authRequest, authMessage } from "../../lib/auth-client";
export function LogoutButton() {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    try {
      const result = await authRequest("/logout", {});
      if (!result.ok && result.status !== 401) {
        setError(authMessage((await result.json()).error?.code));
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Não foi possível sair. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm"
      >
        {busy ? "Saindo…" : "Sair"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
