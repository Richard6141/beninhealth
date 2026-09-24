import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/**
 * Rectangle de chargement : dégradé qui glisse en boucle, à dimensionner
 * exactement comme le contenu final pour éviter tout saut de mise en page.
 * Toujours aria-hidden ; l'annonce d'attente se fait au niveau du conteneur
 * (role="status") qui englobe un ou plusieurs squelettes.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "sans-impression anim-squelette-onde rounded-champ bg-[linear-gradient(90deg,var(--surface-appui)_25%,var(--bordure)_37%,var(--surface-appui)_63%)] bg-[length:200%_100%]",
        className
      )}
      {...props}
    />
  );
}
