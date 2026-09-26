import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type AlertLevel = "critical" | "warning" | "info" | "success";

export interface AlertProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  level?: AlertLevel;
  title: ReactNode;
  children?: ReactNode;
}

const levelConfig: Record<
  AlertLevel,
  { label: string; container: string; tag: string }
> = {
  critical: {
    label: "BLOQUANT",
    container: "border-critique bg-critique-clair",
    tag: "border-critique text-critique",
  },
  warning: {
    label: "ATTENTION",
    container: "border-vigilance bg-vigilance-clair",
    tag: "border-vigilance text-vigilance",
  },
  info: {
    label: "INFORMATION",
    container: "border-info bg-info-clair",
    tag: "border-info text-info",
  },
  success: {
    label: "VALIDÉ",
    container: "border-bon bg-bon-clair",
    tag: "border-bon text-bon",
  },
};

/**
 * Bandeau de statut : la couleur n'est jamais le seul signal, une étiquette
 * en toutes lettres précède toujours le titre (BLOQUANT/ATTENTION/
 * INFORMATION/VALIDÉ). role="alert" pour le critique, role="status" sinon.
 */
export function Alert({
  level = "info",
  title,
  children,
  className,
  ...props
}: AlertProps) {
  const config = levelConfig[level];

  return (
    <div
      role={level === "critical" ? "alert" : "status"}
      className={cn(
        "alerte porte-couleur rounded-carte border px-4 py-3",
        config.container,
        className
      )}
      {...props}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className={cn(
            "inline-block rounded-badge border px-1.5 py-0.5 text-[12px] font-semibold tracking-[0.06em]",
            config.tag
          )}
        >
          {config.label}
        </span>
        <p className="text-[15px] font-semibold text-encre">{title}</p>
      </div>
      {children ? (
        <p className="mt-1 text-[13px] text-encre-secondaire">{children}</p>
      ) : null}
    </div>
  );
}
