import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-5 sm:flex-row sm:items-center",
        className,
      )}
    >
      <div className="min-w-0 space-y-3">
        {eyebrow && (
          <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-accent-foreground before:h-px before:w-8 before:bg-primary">
            {eyebrow}
          </p>
        )}

        <h1 className="font-display text-3xl font-medium tracking-tight text-foreground md:text-4xl xl:text-5xl">
          {title}
        </h1>

        {description && (
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
      )}
    </div>
  );
}
