import { LoaderCircle } from "lucide-react";

type LoadingStateProps = {
  message?: string;
};

export function LoadingState({
  message = "Carregando informações...",
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="panel flex min-h-64 flex-col items-center justify-center gap-4 border border-border bg-surface p-6"
    >
      <LoaderCircle
        size={30}
        className="animate-spin text-primary"
        aria-hidden="true"
      />

      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}
