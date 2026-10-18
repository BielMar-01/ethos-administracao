import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "control inline-flex max-w-full cursor-pointer items-center justify-center gap-2 whitespace-normal rounded-control text-center text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-foreground disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border border-primary bg-primary text-primary-foreground shadow-sm hover:brightness-105 active:brightness-95",
        secondary: "bg-surface-secondary text-foreground hover:opacity-80",
        outline:
          "border border-border bg-transparent text-foreground hover:border-primary",
        ghost: "text-foreground hover:bg-surface-secondary",
        destructive:
          "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20",
      },
      size: {
        sm: "min-h-9 px-3 py-2",
        md: "min-h-11 px-5 py-2.5",
        lg: "min-h-12 px-7 py-3",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
