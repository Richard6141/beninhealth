/**
 * Espace d'une notification (F-NOT-01 : "les notifications citoyennes
 * n'apparaissent pas dans l'espace pro et inversement"). Module pur.
 *
 * Une notification n'a pas de colonne "espace" : elle porte un lien direct vers
 * l'element concerne, et ce lien dit dans quel espace elle a du sens
 * (/app/patient pour le citoyen, /app/medecin, /app/etablissement ou
 * /app/ministere pour un professionnel ou un administrateur). Une notification
 * sans lien, ou dont le lien mene a un ecran commun (notifications, securite),
 * apparait dans tous les espaces : rien n'est jamais masque sur une hypothese.
 *
 * Le filtre ne s'applique que si l'utilisateur a choisi un espace (F-AUTH-07 :
 * la session ne contient alors que ce role). Sans choix, tous les roles du
 * compte y figurent et rien n'est filtre.
 */

import type { Prisma } from "@prisma/client";

export type EspaceNotification = "patient" | "professionnel";

const PREFIXE_LIEN_PATIENT = "/app/patient";
const PREFIXES_LIEN_PROFESSIONNEL = ["/app/medecin", "/app/etablissement", "/app/ministere"] as const;

export const TAILLE_PAGE_NOTIFICATIONS = 30;

/** Espace actif deduit des roles de la session, ou null quand plusieurs espaces sont ouverts (aucun filtre). */
export function espaceDesRoles(roles: readonly string[]): EspaceNotification | null {
  if (roles.length !== 1) return null;
  return roles[0] === "patient" ? "patient" : "professionnel";
}

/** Espace auquel un lien de notification est reserve, ou null s'il est commun. */
export function espaceDuLien(lien: string | null): EspaceNotification | null {
  if (lien === null) return null;
  if (lien === PREFIXE_LIEN_PATIENT || lien.startsWith(`${PREFIXE_LIEN_PATIENT}/`)) return "patient";
  if (PREFIXES_LIEN_PROFESSIONNEL.some((prefixe) => lien === prefixe || lien.startsWith(`${prefixe}/`))) return "professionnel";
  return null;
}

/** Condition Prisma qui garde les notifications visibles dans l'espace : celles de cet espace et les communes. */
export function conditionEspace(espace: EspaceNotification | null): Prisma.NotificationWhereInput {
  if (espace === null) return {};
  const exclus = espace === "patient" ? PREFIXES_LIEN_PROFESSIONNEL : [PREFIXE_LIEN_PATIENT];
  return {
    OR: [{ lien: null }, { AND: exclus.map((prefixe) => ({ NOT: { lien: { startsWith: prefixe } } })) }],
  };
}
