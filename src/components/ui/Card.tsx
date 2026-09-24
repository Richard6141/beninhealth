import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Titre de l'en-tête optionnel. */
  title?: ReactNode;
  /** Description courte sous le titre. */
  description?: ReactNode;
  /** Zone d'actions alignée à droite de l'en-tête (boutons, menu...). */
  actions?: ReactNode;
  children?: ReactNode;
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
  ...props
}: CardProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <div
      className={cn(
        "carte rounded-carte border border-bordure bg-surface p-4 shadow-[var(--ombre-carte)] sm:p-6",
        className
      )}
      {...props}
    >
      {hasHeader ? (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            {title ? (
              <h3 className="text-[20px] font-bold text-encre">{title}</h3>
            ) : null}
            {description ? (
              <p className="text-[13px] text-encre-secondaire">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
