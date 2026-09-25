/**
 * Convention d'identifiant public, commune a tous les types de compte de la
 * plateforme : "BJ-SANTE-<CODE>-<sequence sur 4 chiffres>". Le prefixe
 * "BJ-SANTE" est partage par tous (marque nationale de la plateforme), le
 * code a 3 lettres identifie immediatement le type de compte sans avoir a
 * ouvrir le dossier (ex : BJ-SANTE-MED-0001 est visiblement un medecin,
 * BJ-SANTE-PAT-0001 visiblement un patient).
 *
 * La sequence est calculee par simple comptage des identifiants deja
 * attribues pour ce code (voir compterEtFormater ci-dessous) : suffisant a
 * l'echelle de ce MVP (un seul processus Node, base SQLite locale), pas
 * concu pour resister a une forte concurrence d'ecriture.
 */

import type { NomRole } from "@/types";

/** Code a 3 lettres par role applicatif (voir src/types/domain-identity.ts pour NomRole). */
export const CODES_IDENTIFIANT_PAR_ROLE: Record<NomRole, string> = {
  patient: "PAT",
  medecin: "MED",
  infirmier: "INF",
  agent_communautaire: "AGC",
  pharmacien: "PHA",
  laboratoire: "LAB",
  admin_etablissement: "ADM",
  admin_national: "MIN",
};

/** Code de l'entite EtablissementSanitaire elle-meme (pas une personne). */
export const CODE_IDENTIFIANT_ETABLISSEMENT = "ETB";

const PREFIXE_PLATEFORME = "BJ-SANTE";

/** Formate un identifiant complet a partir d'un code et d'un numero de sequence. */
export function formaterIdentifiant(code: string, sequence: number): string {
  return `${PREFIXE_PLATEFORME}-${code}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Calcule le prochain identifiant pour un code donne, a partir du nombre
 * d'identifiants de ce code deja attribues (compteur fourni par l'appelant,
 * generalement un `count()` Prisma filtre par prefixe).
 */
export function prochainIdentifiant(code: string, nombreExistant: number): string {
  return formaterIdentifiant(code, nombreExistant + 1);
}

/** Prefixe complet ("BJ-SANTE-MED-") utile pour un `count()` Prisma `startsWith`. */
export function prefixeIdentifiant(code: string): string {
  return `${PREFIXE_PLATEFORME}-${code}-`;
}
