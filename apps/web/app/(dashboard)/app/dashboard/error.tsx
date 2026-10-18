
"use client";

import { ErrorState } from "../../../../components/shared/error-state";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Erro ao carregar o dashboard"
      description="Não foi possível carregar o painel administrativo."
      onRetry={reset}
    />
  );
}
