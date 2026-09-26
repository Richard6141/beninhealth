import { cn } from "@/lib/cn";

export interface NavigationProgressBarProps {
  /** Avancement de 0 à 100. Le composant n'est pas encore branché au routing. */
  progress?: number;
  active?: boolean;
  className?: string;
}

/**
 * Filet de 3px en haut d'écran, aplat marine (aucun dégradé, voir la
 * charte) : se déclenche au clic sur un lien interne et se termine dès que
 * la page affichée a changé (branchement au routing laissé à une étape
 * ultérieure).
 */
export function NavigationProgressBar({
  progress = 70,
  active = true,
  className,
}: NavigationProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div
      aria-hidden="true"
      className={cn(
        "sans-impression pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden bg-transparent transition-opacity duration-[220ms] ease-in motion-reduce:transition-none",
        active ? "opacity-100" : "opacity-0",
        className
      )}
    >
      <div
        className="h-full bg-marine transition-[width] duration-[600ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
