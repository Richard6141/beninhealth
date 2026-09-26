import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/**
 * Rectangle de chargement : pulsation d'opacité en aplat (aucun dégradé, voir
 * la charte), à dimensionner exactement comme le contenu final pour éviter
 * tout saut de mise en page. Toujours aria-hidden ; l'annonce d'attente se
 * fait au niveau du conteneur (role="status") qui englobe un ou plusieurs
 * squelettes.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "sans-impression anim-squelette-pulse rounded-champ bg-surface-appui",
        className
      )}
      {...props}
    />
  );
}
