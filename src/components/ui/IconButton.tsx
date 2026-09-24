import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  icon: LucideIcon;
  /** title et aria-label sont dérivés de cette seule prop, toujours identiques. */
  label: string;
  danger?: boolean;
}

export function IconButton({
  icon: Icon,
  label,
  danger = false,
  disabled,
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-champ border border-bordure-forte bg-surface text-encre-secondaire transition-colors motion-reduce:transition-none",
        "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        danger
          ? "hover:border-critique hover:bg-critique-clair hover:text-critique"
          : "hover:bg-surface-appui hover:text-encre",
        className
      )}
      {...props}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
