import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icône lucide-react affichée avant le libellé (jamais seule, voir IconButton). */
  iconBefore?: LucideIcon;
  /** Icône lucide-react affichée après le libellé. */
  iconAfter?: LucideIcon;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-marine text-white hover:bg-marine-fonce",
  secondary:
    "border border-bordure-forte bg-surface text-encre hover:bg-surface-appui",
  ghost: "border border-transparent bg-transparent text-marine hover:bg-marine-clair",
  danger:
    "border border-critique bg-transparent text-critique hover:bg-critique-clair",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 px-3 text-[13px]",
  md: "h-11 gap-2 px-4 text-[15px]",
  lg: "h-12 gap-2 px-5 text-[15px]",
};

export function Button({
  variant = "primary",
  size = "md",
  iconBefore: IconBefore,
  iconAfter: IconAfter,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-carte font-semibold transition-colors motion-reduce:transition-none",
        "focus-visible:outline-2 focus-visible:outline-marine focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {IconBefore ? <IconBefore size={16} aria-hidden="true" /> : null}
      <span>{children}</span>
      {IconAfter ? <IconAfter size={16} aria-hidden="true" /> : null}
    </button>
  );
}
