/**
 * Validation de la reponse du modele (F-IA-01 etape 5, RG-IA-06). Module pur.
 *
 * Une puce n'est conservee que si : elle cite au moins une etiquette
 * existante, ne cite aucune etiquette inconnue, et chaque nombre qu'elle
 * contient apparait dans la source citee. Toute autre puce est supprimee avant
 * affichage. Moins de NOMBRE_MIN_PUCES puces conformes : resume indisponible.
 */

import { NOMBRE_MAX_PUCES, NOMBRE_MIN_PUCES, type ElementSource, type PuceValidee } from "./regles";

export interface ResultatValidation {
  puces: PuceValidee[];
  /** Nombre de puces lues dans la reponse (avant validation), plafonne a NOMBRE_MAX_PUCES. */
  pucesLues: number;
  pucesSupprimees: number;
  /** Faux si moins de NOMBRE_MIN_PUCES puces conformes : le resume ne doit pas etre affiche. */
  disponible: boolean;
}

const MOTIF_ETIQUETTE = /\[(S\d+)\]/g;
const MOTIF_NOMBRE = /\d+(?:[.,]\d+)?/g;

/** Extrait les puces d'une reponse : lignes commencant par "-", "*" ou une puce de liste. */
export function extrairePuces(reponse: string): string[] {
  return reponse
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter((ligne) => /^[-*•]\s+\S/.test(ligne))
    .map((ligne) => ligne.replace(/^[-*•]\s+/, "").trim());
}

function normaliserNombre(valeur: string): string {
  return valeur.replace(",", ".");
}

/** Tous les nombres d'un texte, en retirant les etiquettes [S1] qui ne sont pas des donnees. */
function nombresDe(texte: string): string[] {
  return (texte.replace(MOTIF_ETIQUETTE, " ").match(MOTIF_NOMBRE) ?? []).map(normaliserNombre);
}

export function validerReponse(reponse: string, elements: readonly ElementSource[]): ResultatValidation {
  const parEtiquette = new Map(elements.map((element) => [element.etiquette, element]));
  const brutes = extrairePuces(reponse).slice(0, NOMBRE_MAX_PUCES);
  const conformes: PuceValidee[] = [];

  for (const brute of brutes) {
    const citees = [...brute.matchAll(MOTIF_ETIQUETTE)].map((correspondance) => correspondance[1]);
    if (citees.length === 0) continue;
    if (citees.some((etiquette) => !parEtiquette.has(etiquette))) continue;

    const nombresSources = new Set(citees.flatMap((etiquette) => nombresDe(parEtiquette.get(etiquette)?.texte ?? "")));
    if (nombresDe(brute).some((nombre) => !nombresSources.has(nombre))) continue;

    conformes.push({
      texte: brute.replace(MOTIF_ETIQUETTE, "").replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim(),
      sources: [...new Set(citees)],
    });
  }

  return {
    puces: conformes,
    pucesLues: brutes.length,
    pucesSupprimees: brutes.length - conformes.length,
    disponible: conformes.length >= NOMBRE_MIN_PUCES,
  };
}
