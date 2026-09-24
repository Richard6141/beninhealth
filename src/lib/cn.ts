import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Fusionne des classes Tailwind conditionnelles : clsx assemble les entrées
 * (chaînes, objets, tableaux, valeurs falsy ignorées), puis tailwind-merge
 * résout les conflits entre classes Tailwind équivalentes (la dernière
 * gagne). Utilisé par tous les composants de src/components/ui.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
