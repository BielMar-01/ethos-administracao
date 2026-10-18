import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "control h-11 w-full min-w-0 border border-border bg-background px-3 text-sm text-foreground focus:border-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
