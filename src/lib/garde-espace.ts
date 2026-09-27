import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { espaceParDefaut } from "@/lib/espace-par-defaut";
import type { NomRole } from "@/types";

/**
 * Garde d'espace (F-AUTH-07, RG-AUTH-60) pour un segment d'URL de l'application
 * ("/app/patient", "/app/medecin", "/app/etablissement", "/app/ministere") :
 * l'espace actif etant lu dans la session serveur, un utilisateur qui a choisi
 * un autre espace n'ouvre pas les pages de celui-ci en tapant l'adresse. Sans
 * session : connexion ; hors espace : accueil de l'espace actif.
 *
 * Complete, sans les remplacer, les controles de role de chaque action et de
 * chaque lecture (Zero Trust) : c'est la barriere de navigation.
 */
export async function garderEspace(rolesAutorises: readonly NomRole[]): Promise<void> {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  if (!session.roles.some((role) => rolesAutorises.includes(role))) {
    redirect(espaceParDefaut(session.roles));
  }
}

/** Roles dont l'espace est le segment "/app/medecin" (tous les professionnels de sante hors administration). */
export const ROLES_ESPACE_PROFESSIONNEL: readonly NomRole[] = [
  "medecin",
  "infirmier",
  "agent_communautaire",
  "pharmacien",
  "laboratoire",
];

/** "/app/etablissement" : l'administration de l'etablissement, et l'infirmier pour la file du jour (voir facility/file-du-jour.ts). */
export const ROLES_ESPACE_ETABLISSEMENT: readonly NomRole[] = ["admin_etablissement", "infirmier"];
