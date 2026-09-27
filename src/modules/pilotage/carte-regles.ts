/**
 * Regles pures de la carte sanitaire (F-PIL-03) : projection des contours,
 * classes de la carte choroplethe, bornes de periode. Sans "use server" ni
 * acces base : partagees par le module de lecture, l'ecran et les tests.
 *
 * Palette : cinq nuances sequentielles d'un meme bleu, du plus clair au plus
 * fonce (l'ordre des classes se lit par la luminosite, pas par la teinte),
 * avec legende textuelle et tableau equivalent : la couleur n'est jamais le
 * seul support de l'information.
 */

import { GEOMETRIES_DEPARTEMENTS, type Anneau } from "./geometrie-departements";
import type { ValeurMasquee } from "./masquage";

export const NOMBRE_CLASSES = 5;

export const COULEURS_CLASSES = ["#e4eef8", "#b0cfea", "#72a6d3", "#357ab8", "#0f4c88"] as const;

/** Un departement sans donnee (aucun agregat lisible) : gris neutre, distinct de la classe la plus claire. */
export const COULEUR_SANS_DONNEE = "#d9d9d9";

/** Nom sans accent ni casse, pour rapprocher les contours du referentiel. */
export function normaliserNomDepartement(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Classe (0 a 4) d'une valeur affichee : cinq intervalles egaux entre 0 et le
 * maximum. Une valeur masquee ("< 5", RG-PIL-02) tombe toujours dans la classe
 * la plus faible : la classe ne revele pas plus que la valeur affichee.
 */
export function classeDeLaValeur(valeur: ValeurMasquee, maximum: number): number {
  if (valeur === "< 5" || maximum <= 0) return 0;
  return Math.min(NOMBRE_CLASSES - 1, Math.floor((valeur / maximum) * NOMBRE_CLASSES));
}

export interface ClasseLegende {
  classe: number;
  couleur: string;
  /** Libelle "de X a Y". */
  libelle: string;
}

export function legendeDesClasses(maximum: number): ClasseLegende[] {
  if (maximum <= 0) {
    return COULEURS_CLASSES.map((couleur, classe) => ({ classe, couleur, libelle: "0" }));
  }

  // Une valeur entiere v est dans la classe k si floor(v * 5 / maximum) = k, soit v >= ceil(k * maximum / 5) : bornes exactes, jamais arrondies.
  const borneBasse = (classe: number) => Math.ceil((classe * maximum) / NOMBRE_CLASSES);

  return COULEURS_CLASSES.map((couleur, classe) => {
    const bas = borneBasse(classe);
    const haut = classe === NOMBRE_CLASSES - 1 ? maximum : borneBasse(classe + 1) - 1;
    return { classe, couleur, libelle: haut < bas ? "aucune valeur" : bas === haut ? String(bas) : `${bas} à ${haut}` };
  });
}

export const PERIODES_CARTE = ["aujourdhui", "7j", "30j", "mois"] as const;
export type PeriodeCarte = (typeof PERIODES_CARTE)[number];

/** Memes bornes que le tableau de bord (jours UTC, fin exclue) : la carte et les cartes d'indicateurs parlent de la meme periode. */
export function plageDePeriode(periode: PeriodeCarte, maintenant: Date): { debut: Date; fin: Date } {
  const debutAujourdhui = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
  const fin = new Date(debutAujourdhui);
  fin.setUTCDate(fin.getUTCDate() + 1);

  if (periode === "aujourdhui") return { debut: debutAujourdhui, fin };

  const debut = new Date(debutAujourdhui);
  if (periode === "7j") debut.setUTCDate(debut.getUTCDate() - 6);
  else if (periode === "30j") debut.setUTCDate(debut.getUTCDate() - 29);
  else debut.setUTCDate(1);

  return { debut, fin };
}

// ---------------------------------------------------------------- projection

const LARGEUR_VUE = 400;

function anneauxDe(geometrie: (typeof GEOMETRIES_DEPARTEMENTS)[number]): Anneau[] {
  return geometrie.type === "Polygon" ? (geometrie.coordonnees as Anneau[]) : (geometrie.coordonnees as Anneau[][]).flat();
}

const TOUS_LES_POINTS = GEOMETRIES_DEPARTEMENTS.flatMap((g) => anneauxDe(g).flat());
const LON_MIN = Math.min(...TOUS_LES_POINTS.map(([lon]) => lon));
const LON_MAX = Math.max(...TOUS_LES_POINTS.map(([lon]) => lon));
const LAT_MIN = Math.min(...TOUS_LES_POINTS.map(([, lat]) => lat));
const LAT_MAX = Math.max(...TOUS_LES_POINTS.map(([, lat]) => lat));
// Projection equirectangulaire corrigee de la latitude moyenne : suffisant pour un pays de 6 a 12 degres nord.
const FACTEUR_LON = Math.cos((((LAT_MIN + LAT_MAX) / 2) * Math.PI) / 180);
const ECHELLE = LARGEUR_VUE / ((LON_MAX - LON_MIN) * FACTEUR_LON);

export const HAUTEUR_VUE = Math.ceil((LAT_MAX - LAT_MIN) * ECHELLE);
export const LARGEUR_VUE_CARTE = LARGEUR_VUE;

/** Longitude et latitude vers coordonnees du dessin (x vers l'est, y vers le sud). */
export function projeter(longitude: number, latitude: number): { x: number; y: number } {
  return {
    x: Math.round((longitude - LON_MIN) * FACTEUR_LON * ECHELLE * 10) / 10,
    y: Math.round((LAT_MAX - latitude) * ECHELLE * 10) / 10,
  };
}

export interface DepartementSvg {
  nom: string;
  /** Nom normalise (sans accent, en minuscules), cle de rapprochement avec le referentiel. */
  cle: string;
  /** Trace SVG ("d") de tous les anneaux. */
  d: string;
  /** Centre approximatif du plus grand anneau, pour poser une marque. */
  centre: { x: number; y: number };
}

function traceDesAnneaux(anneaux: Anneau[]): string {
  return anneaux
    .map((anneau) => {
      const points = anneau.map(([lon, lat]) => projeter(lon, lat));
      return `M${points.map((p) => `${p.x} ${p.y}`).join("L")}Z`;
    })
    .join("");
}

function centreDuPlusGrandAnneau(anneaux: Anneau[]): { x: number; y: number } {
  const plusGrand = [...anneaux].sort((a, b) => b.length - a.length)[0];
  const lons = plusGrand.map(([lon]) => lon);
  const lats = plusGrand.map(([, lat]) => lat);
  return projeter((Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2);
}

export const DEPARTEMENTS_SVG: readonly DepartementSvg[] = GEOMETRIES_DEPARTEMENTS.map((geometrie) => {
  const anneaux = anneauxDe(geometrie);
  return {
    nom: geometrie.nom,
    cle: normaliserNomDepartement(geometrie.nom),
    d: traceDesAnneaux(anneaux),
    centre: centreDuPlusGrandAnneau(anneaux),
  };
});
