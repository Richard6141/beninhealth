import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "good"
  | "warning"
  | "alert"
  | "critical"
  | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Une pastille porte toujours un texte, jamais une couleur seule. */
  children: ReactNode;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-surface-appui text-encre-secondaire",
  accent: "bg-accent text-white",
  good: "bg-bon text-white",
  warning: "bg-vigilance text-white",
  alert: "bg-alerte text-white",
  critical: "bg-critique text-white",
  info: "bg-info text-white",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "badge porte-couleur inline-flex items-center rounded-badge px-2.5 py-0.5 text-[12px] font-semibold leading-5",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
