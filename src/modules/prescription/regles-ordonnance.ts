/**
 * Regles de composition d'une ordonnance (F-PRE-01 du pack).
 *
 * Module SANS "use server" : constantes et fonctions pures, partagees entre
 * les actions serveur (qui restent l'autorite) et le formulaire (retour
 * immediat a l'ecran).
 *
 * - RG-PRE-01 : de 1 a NOMBRE_LIGNES_MAX lignes.
 * - RG-PRE-02 : pour un patient de moins de AGE_POIDS_REQUIS_ANS ans, un poids
 *   releve depuis moins de FENETRE_POIDS_JOURS jours est obligatoire avant la
 *   signature. Ce depot n'a pas de champ "poids du patient" : le poids vient
 *   des constantes vitales, soit d'une consultation, soit d'une prise en
 *   charge infirmiere.
 * - Duree d'un traitement bornee a DUREE_TRAITEMENT_MAX_JOURS jours par ligne.
 */

import { ageAnnees } from "@/modules/clinical/controles-constantes";

export const NOMBRE_LIGNES_MAX = 10;
export const DUREE_TRAITEMENT_MAX_JOURS = 90;
export const AGE_POIDS_REQUIS_ANS = 12;
export const FENETRE_POIDS_JOURS = 30;

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

export interface MesurePoids {
  date: Date;
  poidsKg: number | null;
}

export interface PoidsRetenu {
  poidsKg: number;
  date: Date;
}

/** Vrai si le poids est obligatoire avant signature (RG-PRE-02). */
export function poidsRequisPourPatient(dateNaissance: Date, maintenant: Date): boolean {
  return ageAnnees(dateNaissance, maintenant) < AGE_POIDS_REQUIS_ANS;
}

/** Debut de la fenetre pendant laquelle un poids reste valable pour signer. */
export function debutFenetrePoids(maintenant: Date): Date {
  return new Date(maintenant.getTime() - FENETRE_POIDS_JOURS * MS_PAR_JOUR);
}

/**
 * Poids le plus recent parmi les mesures, ou null si aucune mesure valide
 * (renseignee, strictement positive, datee de moins de FENETRE_POIDS_JOURS
 * jours et pas dans le futur).
 */
export function poidsRecent(mesures: MesurePoids[], maintenant: Date): PoidsRetenu | null {
  const debut = debutFenetrePoids(maintenant).getTime();
  let retenu: PoidsRetenu | null = null;

  for (const mesure of mesures) {
    if (mesure.poidsKg === null || !(mesure.poidsKg > 0)) continue;

    const instant = mesure.date.getTime();
    if (instant < debut || instant > maintenant.getTime()) continue;

    if (retenu === null || instant > retenu.date.getTime()) {
      retenu = { poidsKg: mesure.poidsKg, date: mesure.date };
    }
  }

  return retenu;
}

export const MESSAGE_POIDS_MANQUANT =
  `Patient de moins de ${AGE_POIDS_REQUIS_ANS} ans : son poids, releve depuis moins de ${FENETRE_POIDS_JOURS} jours, est obligatoire avant de signer l'ordonnance. ` +
  "Renseignez-le dans les constantes vitales d'une consultation, ou faites-le relever par l'infirmier, puis reessayez.";

export const MESSAGE_TROP_DE_LIGNES = `Une ordonnance ne peut pas comporter plus de ${NOMBRE_LIGNES_MAX} lignes. Repartissez les medicaments sur deux ordonnances.`;

export const MESSAGE_DUREE_TROP_LONGUE = `La duree d'un traitement ne peut pas depasser ${DUREE_TRAITEMENT_MAX_JOURS} jours.`;
