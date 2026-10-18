import type { ComponentProps, ReactNode } from "react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export function FormField({
  id,
  label,
  required,
  description,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  description?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </Label>
      {children}
      {description && (
        <p id={`${id}-description`} className="text-xs text-muted">
          {description}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-sm font-medium text-danger"
        >
          Erro: {error}
        </p>
      )}
    </div>
  );
}
export function DateInput(props: ComponentProps<typeof Input>) {
  return <Input {...props} type="date" />;
}
export function CurrencyInput(props: ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      type="number"
      inputMode="decimal"
      min="0"
      max="1000000000"
      step="0.01"
    />
  );
}
export function FormActions({
  onCancel,
  submitting,
}: {
  onCancel: () => void;
  submitting: boolean;
}) {
  return (
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <Button variant="outline" onClick={onCancel} disabled={submitting}>
        Cancelar
      </Button>
      <Button type="submit" disabled={submitting}>
        Salvar exemplo em memória
      </Button>
    </div>
  );
}
