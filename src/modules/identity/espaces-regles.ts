/**
 * Regles pures du choix de l'espace actif (F-AUTH-07 du pack). Sans "use
 * server" ni acces base : partagees par la session, l'action de changement et
 * l'en-tete.
 *
 * Limite assumee : un espace est un ROLE du compte (patient, medecin,
 * infirmier, ...), avec l'etablissement de son profil professionnel affiche
 * pour information. Ce depot n'a qu'un profil professionnel (donc un seul
 * etablissement) par compte : un medecin affilie a deux etablissements et
 * limite a l'etablissement actif (CA-1 du pack) n'est pas representable.
 */

import type { NomRole } from "@/types";

export const LIBELLES_ESPACE: Record<NomRole, string> = {
  patient: "Mon espace santé (personnel)",
  medecin: "Médecin",
  infirmier: "Infirmier ou sage-femme",
  agent_communautaire: "Agent communautaire",
  pharmacien: "Pharmacien",
  laboratoire: "Laboratoire",
  admin_etablissement: "Administration d'établissement",
  admin_national: "Ministère de la Santé",
};

/** Roles dont l'espace exige un profil professionnel (donc un etablissement). */
export const ROLES_PROFESSIONNELS: readonly NomRole[] = [
  "medecin",
  "infirmier",
  "agent_communautaire",
  "pharmacien",
  "laboratoire",
  "admin_etablissement",
];

export function estRoleProfessionnel(role: NomRole): boolean {
  return ROLES_PROFESSIONNELS.includes(role);
}

/** Page d'accueil d'un espace. */
export function accueilDeLEspace(role: NomRole): string {
  switch (role) {
    case "patient":
      return "/app/patient";
    case "admin_national":
      return "/app/ministere";
    case "admin_etablissement":
      return "/app/etablissement";
    default:
      return "/app/medecin";
  }
}

const ROLES_CONNUS: readonly NomRole[] = [
  "patient",
  "medecin",
  "infirmier",
  "agent_communautaire",
  "pharmacien",
  "laboratoire",
  "admin_etablissement",
  "admin_national",
];

export function estNomRole(valeur: unknown): valeur is NomRole {
  return typeof valeur === "string" && (ROLES_CONNUS as readonly string[]).includes(valeur);
}

/**
 * Roles effectivement appliques a la session : le seul espace actif s'il en
 * a ete choisi un que le compte possede, sinon tous les roles du compte
 * (comportement anterieur a F-AUTH-07, pour un compte qui n'a jamais choisi).
 */
export function rolesEffectifs(rolesDuCompte: NomRole[], espaceActif: string | null | undefined): NomRole[] {
  if (espaceActif && estNomRole(espaceActif) && rolesDuCompte.includes(espaceActif)) {
    return [espaceActif];
  }
  return rolesDuCompte;
}

export interface EspaceUtilisateur {
  role: NomRole;
  libelle: string;
  /** Nom de l'etablissement du profil professionnel, null pour l'espace personnel et le ministere. */
  etablissementNom: string | null;
  accueil: string;
  actif: boolean;
}
