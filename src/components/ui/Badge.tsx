import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "good"
  | "warning"
  | "critical"
  | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Une pastille porte toujours un texte, jamais une couleur seule. */
  children: ReactNode;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-surface-appui text-encre-secondaire",
  accent: "bg-accent-clair text-accent",
  good: "bg-bon-clair text-bon",
  warning: "bg-vigilance-clair text-vigilance",
  critical: "bg-critique-clair text-critique",
  info: "bg-info-clair text-info",
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
        "badge porte-couleur inline-flex items-center rounded-champ px-2.5 py-0.5 text-[12px] font-semibold leading-5",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
