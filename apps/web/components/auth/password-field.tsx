"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
export const inputClass =
  "mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none transition focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60";
export const actionClass =
  "inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60";
export function PasswordField({
  name = "password",
  label = "Senha",
  newPassword = false,
}: {
  name?: string;
  label?: string;
  newPassword?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="text-sm font-semibold" htmlFor={name}>
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={newPassword ? 12 : 1}
          maxLength={128}
          autoComplete={newPassword ? "new-password" : "current-password"}
          aria-describedby={newPassword ? `${name}-requirements` : undefined}
          className={`${inputClass} pr-14`}
        />
        <button
          type="button"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
          className="absolute inset-y-0 right-1 mt-2 flex min-w-12 items-center justify-center rounded-lg text-muted focus-visible:ring-2 focus-visible:ring-primary"
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>
      {newPassword && (
        <ul
          id={`${name}-requirements`}
          className="mt-3 space-y-1 text-xs leading-5 text-muted"
        >
          <li>Pelo menos 12 caracteres (máximo 128).</li>
          <li>Uma letra maiúscula e uma minúscula.</li>
          <li>Um número e um caractere especial.</li>
        </ul>
      )}
    </div>
  );
}
