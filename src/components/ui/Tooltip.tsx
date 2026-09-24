import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TooltipProps {
  content: ReactNode;
  /** Libellé accessible du déclencheur (aria-label). */
  label?: string;
  className?: string;
}

/**
 * Infobulle en pur CSS : aucune logique JavaScript, déclenchée par :hover et
 * :focus-within uniquement (jamais seulement au clic), pour rester
 * accessible au clavier.
 */
export function Tooltip({
  content,
  label = "Plus d'information",
  className,
}: TooltipProps) {
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      <button
        type="button"
        aria-label={label}
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full border border-bordure-forte text-encre-attenuee transition-colors motion-reduce:transition-none",
          "hover:border-accent hover:text-accent focus:border-accent focus:text-accent",
          "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        )}
      >
        <Info size={14} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-champ border border-bordure bg-surface px-3 py-2 text-[12.5px] text-encre-secondaire opacity-0 shadow-[var(--ombre-carte)] transition-opacity motion-reduce:transition-none",
          "group-hover/tooltip:pointer-events-auto group-hover/tooltip:opacity-100",
          "group-focus-within/tooltip:pointer-events-auto group-focus-within/tooltip:opacity-100"
        )}
      >
        {content}
      </span>
    </span>
  );
}
