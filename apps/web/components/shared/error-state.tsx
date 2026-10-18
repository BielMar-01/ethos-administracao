"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";

type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = "Não foi possível carregar as informações",
  description = "Ocorreu um problema inesperado. Tente novamente.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="panel flex min-h-64 flex-col items-center justify-center border border-danger/25 bg-surface p-6 text-center sm:p-8"
    >
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <AlertTriangle size={26} />
      </div>

      <h3 className="text-lg font-semibold text-foreground">{title}</h3>

      <p className="mt-2 max-w-md text-sm text-muted">{description}</p>

      {onRetry && (
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RotateCcw size={16} />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
