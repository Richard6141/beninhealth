import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EtatVideProps extends HTMLAttributes<HTMLDivElement> {
  titre: ReactNode;
  description?: ReactNode;
}

/**
 * État vide : encadré bordé sur fond gris léger, sans motif ni illustration
 * décorative (icône, image...). Un simple titre et, en option, une
 * description courte.
 */
export function EtatVide({ titre, description, className, ...props }: EtatVideProps) {
  return (
    <div
      className={cn(
        "rounded-carte border border-bordure bg-plan px-4 py-8 text-center",
        className
      )}
      {...props}
    >
      <p className="text-[14px] font-semibold text-encre">{titre}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-[36ch] text-[13px] text-encre-attenuee">
          {description}
        </p>
      ) : null}
    </div>
  );
}
