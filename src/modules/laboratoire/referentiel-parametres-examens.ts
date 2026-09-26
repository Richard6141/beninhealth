/**
 * Referentiel des parametres structures d'un examen (F-LAB-03 du pack) :
 * pour un sous-ensemble d'examens quantitatifs de
 * src/modules/laboratoire/referentiel-examens.ts, la liste des parametres
 * mesures (ex. NFS -> hemoglobine, globules blancs, plaquettes), avec unite
 * et valeurs de reference, pour calculer automatiquement l'indicateur
 * (N normal, L bas, H haut, LL/HH critique) et rejeter une valeur hors des
 * limites physiologiquement possibles (RG-LAB-20).
 *
 * Module pur (pas de "use server", pas d'acces base), meme approche que
 * referentiel-examens.ts et referentiel-allergies.ts.
 *
 * Perimetre reduit et assume : seuls 3 examens quantitatifs simples sont
 * couverts ce soir (glycemie, creatinine, taux d'hemoglobine, transaminases),
 * pas les 22 examens du referentiel ni les panels complexes (NFS complete,
 * ionogramme, bilan lipidique) qui demanderaient un travail de recherche de
 * valeurs de reference plus long. Les examens non couverts ici restent en
 * resultat texte libre (ExamenMedical.resultat), comportement inchange.
 *
 * Valeurs de reference adulte uniquement (pas d'ajustement par age, seulement
 * par sexe quand la difference est significative) : des plages usuelles de
 * biologie medicale generaliste, pas celles d'un laboratoire de reference
 * precis. A remplacer par un vrai referentiel biologique valide avant tout
 * usage reel.
 *
 * ExamenMedical.typeExamen stocke le LIBELLE de l'examen (jamais son code),
 * voir referentiel-examens.ts : ce referentiel indexe donc ses entrees par
 * le libelle exact de REFERENTIEL_EXAMENS (resolu depuis le code ci-dessous,
 * jamais duplique en dur), pour rester synchrone si ce libelle change un
 * jour.
 */

import { REFERENTIEL_EXAMENS } from "./referentiel-examens";

export type Sexe = "M" | "F";
export type Indicateur = "N" | "L" | "H" | "LL" | "HH";

function libelleDuCode(code: string): string {
  const examen = REFERENTIEL_EXAMENS.find((e) => e.code === code);
  if (!examen) {
    throw new Error(`Code d'examen inconnu dans REFERENTIEL_EXAMENS : ${code}`);
  }
  return examen.libelle;
}

export interface ParametreExamenReferentiel {
  code: string;
  libelle: string;
  unite: string;
  /** Limites physiologiquement possibles (RG-LAB-20) : hors de cette plage, la valeur est refusee. */
  limitePhysioMin: number;
  limitePhysioMax: number;
  /** Plage normale, la meme pour les deux sexes sauf si normalParSexe est fourni. */
  normalMin: number;
  normalMax: number;
  /** Override de la plage normale par sexe, quand la difference est significative. */
  normalParSexe?: Record<Sexe, { min: number; max: number }>;
  /** Seuils critiques (LL / HH) : au-dela, priorite haute (RG-LAB-21). */
  critiqueMin: number;
  critiqueMax: number;
}

export interface ExamenParametresReferentiel {
  codeExamen: string;
  parametres: ParametreExamenReferentiel[];
}

export const REFERENTIEL_PARAMETRES_EXAMENS: ExamenParametresReferentiel[] = [
  {
    codeExamen: "GLYCEMIE",
    parametres: [
      {
        code: "GLYCEMIE_JEUN",
        libelle: "Glycémie à jeun",
        unite: "g/L",
        limitePhysioMin: 0.1,
        limitePhysioMax: 6,
        normalMin: 0.7,
        normalMax: 1.1,
        critiqueMin: 0.4,
        critiqueMax: 3,
      },
    ],
  },
  {
    codeExamen: "CREATININE",
    parametres: [
      {
        code: "CREATININE_SANGUINE",
        libelle: "Créatinine sanguine",
        unite: "mg/L",
        limitePhysioMin: 1,
        limitePhysioMax: 150,
        normalMin: 6,
        normalMax: 13,
        normalParSexe: { F: { min: 5, max: 9.7 }, M: { min: 7, max: 13 } },
        critiqueMin: 3,
        critiqueMax: 40,
      },
    ],
  },
  {
    codeExamen: "TAUX_HEMOGLOBINE",
    parametres: [
      {
        code: "HEMOGLOBINE",
        libelle: "Taux d'hémoglobine",
        unite: "g/dL",
        limitePhysioMin: 2,
        limitePhysioMax: 24,
        normalMin: 12,
        normalMax: 17.5,
        normalParSexe: { F: { min: 12, max: 15.5 }, M: { min: 13.5, max: 17.5 } },
        critiqueMin: 6.5,
        critiqueMax: 20,
      },
    ],
  },
  {
    codeExamen: "TRANSAMINASES",
    parametres: [
      {
        code: "ASAT",
        libelle: "ASAT (SGOT)",
        unite: "UI/L",
        limitePhysioMin: 1,
        limitePhysioMax: 2000,
        normalMin: 5,
        normalMax: 40,
        critiqueMin: 2,
        critiqueMax: 400,
      },
      {
        code: "ALAT",
        libelle: "ALAT (SGPT)",
        unite: "UI/L",
        limitePhysioMin: 1,
        limitePhysioMax: 2000,
        normalMin: 5,
        normalMax: 45,
        critiqueMin: 2,
        critiqueMax: 400,
      },
    ],
  },
];

const PAR_LIBELLE_EXAMEN = new Map(
  REFERENTIEL_PARAMETRES_EXAMENS.map((e) => [libelleDuCode(e.codeExamen), e])
);
const PAR_CODE_PARAMETRE = new Map(
  REFERENTIEL_PARAMETRES_EXAMENS.flatMap((e) => e.parametres.map((p) => [p.code, p] as const))
);

/**
 * Les parametres structures d'un examen, ou null si cet examen n'est pas
 * dans le perimetre reduit ci-dessus. Prend le LIBELLE de l'examen (valeur
 * stockee dans ExamenMedical.typeExamen), jamais son code.
 */
export function parametresPourExamen(typeExamenLibelle: string): ParametreExamenReferentiel[] | null {
  return PAR_LIBELLE_EXAMEN.get(typeExamenLibelle)?.parametres ?? null;
}

function plageNormale(parametre: ParametreExamenReferentiel, sexe: Sexe): { min: number; max: number } {
  return parametre.normalParSexe?.[sexe] ?? { min: parametre.normalMin, max: parametre.normalMax };
}

/**
 * Calcule l'indicateur (N/L/H/LL/HH) d'une valeur pour un parametre et un
 * sexe donnes. Retourne null si la valeur est hors des limites
 * physiologiquement possibles (RG-LAB-20 : a rejeter, jamais a afficher avec
 * un indicateur).
 */
export function calculerIndicateur(
  codeParametre: string,
  valeur: number,
  sexe: Sexe
): Indicateur | null {
  const parametre = PAR_CODE_PARAMETRE.get(codeParametre);
  if (!parametre) return null;

  if (valeur < parametre.limitePhysioMin || valeur > parametre.limitePhysioMax) {
    return null;
  }

  const { min, max } = plageNormale(parametre, sexe);

  if (valeur < parametre.critiqueMin) return "LL";
  if (valeur < min) return "L";
  if (valeur <= max) return "N";
  if (valeur <= parametre.critiqueMax) return "H";
  return "HH";
}

/** true si la valeur est dans les limites physiologiquement possibles du parametre (RG-LAB-20). */
export function valeurPhysiologiquementPossible(codeParametre: string, valeur: number): boolean {
  const parametre = PAR_CODE_PARAMETRE.get(codeParametre);
  if (!parametre) return false;
  return valeur >= parametre.limitePhysioMin && valeur <= parametre.limitePhysioMax;
}

export function libelleParametre(codeParametre: string): string {
  return PAR_CODE_PARAMETRE.get(codeParametre)?.libelle ?? codeParametre;
}

export function uniteParametre(codeParametre: string): string {
  return PAR_CODE_PARAMETRE.get(codeParametre)?.unite ?? "";
}
