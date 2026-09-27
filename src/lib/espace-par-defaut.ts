import type { NomRole } from "@/types";

/** Page d'accueil de l'espace correspondant aux roles d'un utilisateur (meme ordre que la redirection apres connexion). */
export function espaceParDefaut(roles: NomRole[]): string {
  if (roles.includes("patient")) return "/app/patient";
  if (roles.includes("admin_national")) return "/app/ministere";
  if (roles.includes("admin_etablissement")) return "/app/etablissement";
  return "/app/medecin";
}
