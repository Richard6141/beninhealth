/**
 * Filtres du centre national de pilotage (F-PIL-02, chapitre 14 du pack) :
 * territoire (departement), type d'etablissement, sexe, tranche d'age. Regles
 * pures, sans "use server" ni acces base : partagees par la lecture, l'ecran
 * et les tests. Les filtres vivent dans l'URL pour partager une vue.
 *
 * Un filtre n'est propose a un indicateur que si l'agregat porte la
 * dimension correspondante : IND-04 n'a pas de sexe et une tranche binaire
 * (< 5 ans, >= 5 ans) qui n'est pas la tranche standard, IND-05 et IND-08
 * comptent des etablissements ou des ordonnances, IND-10 n'a pas de sexe.
 * Quand un filtre actif ne peut pas s'appliquer a une carte, la carte le dit
 * ("Non disponible avec ces filtres") : jamais un chiffre non filtre presente
 * comme filtre.
 */

import { TRANCHES_AGE_STANDARD } from "./tranches-age";

export type SexeFiltre = "M" | "F";

export interface FiltresPilotage {
  /** Id de Departement. */
  departementId: string | null;
  /** Valeur de EtablissementSanitaire.type. */
  typeEtablissement: string | null;
  sexe: SexeFiltre | null;
  trancheAge: string | null;
}

export const FILTRES_VIDES: FiltresPilotage = { departementId: null, typeEtablissement: null, sexe: null, trancheAge: null };

export const SEXES_FILTRE: { code: SexeFiltre; libelle: string }[] = [
  { code: "F", libelle: "Femmes" },
  { code: "M", libelle: "Hommes" },
];

export const TRANCHES_AGE_FILTRE: readonly string[] = TRANCHES_AGE_STANDARD;

/** Dimensions que l'agregat de chaque indicateur porte reellement (agregation.ts). Le territoire et le type passent toujours par l'etablissement. */
export const DIMENSIONS_PAR_INDICATEUR: Record<string, { sexe: boolean; trancheAge: boolean }> = {
  "IND-01": { sexe: true, trancheAge: true },
  "IND-02": { sexe: true, trancheAge: true },
  "IND-03": { sexe: true, trancheAge: true },
  "IND-04": { sexe: false, trancheAge: false },
  "IND-05": { sexe: false, trancheAge: false },
  "IND-08": { sexe: false, trancheAge: false },
  "IND-10": { sexe: false, trancheAge: true },
};

/** Vrai si tous les filtres actifs peuvent s'appliquer a l'indicateur. Un indicateur inconnu n'accepte aucun filtre de sexe ni d'age. */
export function filtreApplicable(indicateur: string, filtres: FiltresPilotage): boolean {
  const dimensions = DIMENSIONS_PAR_INDICATEUR[indicateur] ?? { sexe: false, trancheAge: false };
  if (filtres.sexe !== null && !dimensions.sexe) return false;
  if (filtres.trancheAge !== null && !dimensions.trancheAge) return false;
  return true;
}

export function auMoinsUnFiltre(filtres: FiltresPilotage): boolean {
  return filtres.departementId !== null || filtres.typeEtablissement !== null || filtres.sexe !== null || filtres.trancheAge !== null;
}

const FORME_IDENTIFIANT = /^[A-Za-z0-9_-]{1,64}$/;
const FORME_TYPE = /^[A-Za-z0-9_ -]{1,60}$/;

function premiereValeur(valeur: string | string[] | undefined): string | null {
  const brute = Array.isArray(valeur) ? valeur[0] : valeur;
  return brute === undefined || brute === "" ? null : brute;
}

/**
 * Filtres lus dans l'URL. Controle de forme seulement (une valeur invalide
 * devient "pas de filtre") : l'existence du departement et du type est
 * reverifiee par la lecture cote serveur, jamais crue sur parole.
 */
export function lireFiltresDepuisParametres(parametres: Record<string, string | string[] | undefined>): FiltresPilotage {
  const departement = premiereValeur(parametres.territoire);
  const type = premiereValeur(parametres.type);
  const sexe = premiereValeur(parametres.sexe);
  const tranche = premiereValeur(parametres.age);

  return {
    departementId: departement !== null && FORME_IDENTIFIANT.test(departement) ? departement : null,
    typeEtablissement: type !== null && FORME_TYPE.test(type) ? type : null,
    sexe: sexe === "M" || sexe === "F" ? sexe : null,
    trancheAge: tranche !== null && TRANCHES_AGE_FILTRE.includes(tranche) ? tranche : null,
  };
}

/** Parametres d'URL correspondant aux filtres actifs (les filtres vides sont omis). */
export function parametresDesFiltres(filtres: FiltresPilotage): [string, string][] {
  const parametres: [string, string][] = [];
  if (filtres.departementId) parametres.push(["territoire", filtres.departementId]);
  if (filtres.typeEtablissement) parametres.push(["type", filtres.typeEtablissement]);
  if (filtres.sexe) parametres.push(["sexe", filtres.sexe]);
  if (filtres.trancheAge) parametres.push(["age", filtres.trancheAge]);
  return parametres;
}

export interface OptionsFiltresPilotage {
  departements: { id: string; nom: string }[];
  types: string[];
}
