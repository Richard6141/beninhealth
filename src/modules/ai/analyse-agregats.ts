/**
 * Analyse assistee des agregats de pilotage (F-IA-04, chapitre 16 du pack) :
 * detection de valeurs atypiques et de tendances sur des series hebdomadaires
 * DEJA AGREGEES par territoire, jamais sur des donnees individuelles. Module
 * pur (aucun acces base) : des statistiques robustes et deterministes, sans
 * modele ni service externe, chaque signal portant l'explication de son calcul.
 * Complete les alertes epidemiologiques de F-PIL-06 (autre regle, meme esprit :
 * un signal statistique A VERIFIER, jamais une conclusion ni une communication).
 *
 * Masquage (RG-PIL-02) : une valeur de 1 a 4 n'est jamais affichee. Un signal
 * exige au moins 10 unites observees, et les valeurs de comparaison trop
 * petites sont remplacees par "moins de 5" ou ecartent le signal.
 */

import { masquerPetitEffectif, type ValeurMasquee } from "@/modules/pilotage/masquage";

export const SEMAINES_REFERENCE = 8;
export const SEMAINES_REFERENCE_MINIMUM = 5;
export const SEUIL_ECART = 3;
export const MINIMUM_UNITES_SIGNAL = 10;
export const MEDIANE_MINIMUM_CHUTE = 20;
export const SEMAINES_TENDANCE = 8;
export const SEUIL_TENDANCE_POURCENT = 30;
export const VARIATIONS_MINIMUM_MEME_SENS = 5;
export const MOYENNE_MINIMUM_DEBUT_TENDANCE = 5;
export const NOMBRE_MAXIMUM_SIGNAUX = 30;

export interface SerieHebdomadaire {
  code: string;
  libelle: string;
  territoire: string;
  /** Semaines consecutives, la plus recente en dernier ; debut = lundi, "AAAA-MM-JJ". */
  semaines: readonly { debut: string; valeur: number }[];
}

export type TypeSignal = "pic" | "chute" | "hausse" | "baisse";

export interface SignalAnalyse {
  type: TypeSignal;
  code: string;
  libelle: string;
  territoire: string;
  /** Semaine concernee (lundi) : la derniere semaine pour un pic ou une chute, la derniere de la fenetre pour une tendance. */
  semaine: string;
  /** Valeur de la semaine, "< 5" si elle est inferieure a 5 (RG-PIL-02). */
  observe: ValeurMasquee;
  /** Mediane de reference pour un pic ou une chute, moyenne du debut de fenetre pour une tendance. */
  attendu: ValeurMasquee;
  /** Nombre d'ecarts-types robustes (pic, chute) ou variation en pourcentage (tendance). Vaut le seuil quand une valeur est masquee : jamais de score exact qui permettrait de retrouver une valeur masquee. */
  mesure: number;
  explication: string;
}

export function mediane(valeurs: readonly number[]): number {
  if (valeurs.length === 0) return 0;
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 1 ? triees[milieu] : (triees[milieu - 1] + triees[milieu]) / 2;
}

function moyenne(valeurs: readonly number[]): number {
  return valeurs.length === 0 ? 0 : valeurs.reduce((total, valeur) => total + valeur, 0) / valeurs.length;
}

/** Quantile par interpolation lineaire, sur une copie triee. */
function quantile(valeurs: readonly number[], proportion: number): number {
  if (valeurs.length === 0) return 0;
  const triees = [...valeurs].sort((a, b) => a - b);
  const position = (triees.length - 1) * proportion;
  const bas = Math.floor(position);
  const haut = Math.ceil(position);
  return triees[bas] + (triees[haut] - triees[bas]) * (position - bas);
}

/**
 * Dispersion habituelle d'une serie : la plus grande de quatre mesures, toutes
 * resistantes aux valeurs extremes ou naturelles pour un comptage : l'ecart
 * absolu median corrige (1,4826 x MAD), l'ecart interquartile ramene a un
 * ecart-type (IQR / 1,349, qui evite qu'une serie a deux niveaux, dont la MAD
 * est nulle, donne une dispersion trop faible), la racine carree de la mediane
 * (variation naturelle d'un comptage) et 1. Ne devient jamais nulle.
 */
export function dispersionRobuste(reference: readonly number[]): number {
  const centre = mediane(reference);
  const mad = mediane(reference.map((valeur) => Math.abs(valeur - centre)));
  const iqr = quantile(reference, 0.75) - quantile(reference, 0.25);
  return Math.max(1.4826 * mad, iqr / 1.349, Math.sqrt(centre), 1);
}

function nombre(valeur: number): string {
  return Number.isInteger(valeur) ? String(valeur) : valeur.toFixed(1).replace(".", ",");
}

function jourMois(dateIso: string): string {
  const [, mois, jour] = dateIso.split("-");
  return `${jour}/${mois}`;
}

function valeurTexte(valeur: ValeurMasquee): string {
  return valeur === "< 5" ? "moins de 5" : String(valeur);
}

function minuscule(libelle: string): string {
  return libelle.charAt(0).toLowerCase() + libelle.slice(1);
}

function detecterEcart(serie: SerieHebdomadaire): SignalAnalyse | null {
  const valeurs = serie.semaines.map((semaine) => semaine.valeur);
  if (valeurs.length < SEMAINES_REFERENCE_MINIMUM + 1) return null;

  const derniere = serie.semaines[serie.semaines.length - 1];
  const reference = valeurs.slice(-(SEMAINES_REFERENCE + 1), -1);
  if (reference.length < SEMAINES_REFERENCE_MINIMUM) return null;

  const centre = mediane(reference);
  const dispersion = dispersionRobuste(reference);
  const score = (derniere.valeur - centre) / dispersion;
  const attendu = masquerPetitEffectif(centre);
  const observe = masquerPetitEffectif(derniere.valeur);
  // Une valeur masquee ne doit pas pouvoir se retrouver par le calcul : score et dispersion ne sont alors pas affiches.
  const precis = attendu !== "< 5" && observe !== "< 5";
  const base = { code: serie.code, libelle: serie.libelle, territoire: serie.territoire, semaine: derniere.debut, observe, attendu };
  const scoreArrondi = Math.round(score * 10) / 10;
  const contexte = `Semaine du ${jourMois(derniere.debut)} : ${valeurTexte(observe)} ${minuscule(serie.libelle)}, contre ${attendu === "< 5" ? "une médiane inférieure à 5" : `une médiane de ${attendu}`} sur les ${reference.length} semaines précédentes. `;

  if (score >= SEUIL_ECART && derniere.valeur >= MINIMUM_UNITES_SIGNAL) {
    return {
      ...base,
      type: "pic",
      mesure: precis ? scoreArrondi : SEUIL_ECART,
      explication:
        contexte +
        (precis
          ? `L'écart vaut ${nombre(scoreArrondi)} fois la dispersion habituelle (${nombre(Math.round(dispersion * 10) / 10)}), au-dessus du seuil de ${SEUIL_ECART}.`
          : `L'écart dépasse ${SEUIL_ECART} fois la dispersion habituelle (valeur exacte non affichée : effectif inférieur à 5).`),
    };
  }

  if (score <= -SEUIL_ECART && centre >= MEDIANE_MINIMUM_CHUTE) {
    return {
      ...base,
      type: "chute",
      mesure: precis ? scoreArrondi : -SEUIL_ECART,
      explication:
        contexte +
        (precis
          ? `L'écart vaut ${nombre(Math.abs(scoreArrondi))} fois la dispersion habituelle (${nombre(Math.round(dispersion * 10) / 10)}) en dessous de la médiane : baisse d'activité réelle ou retard de saisie à vérifier.`
          : `L'écart dépasse ${SEUIL_ECART} fois la dispersion habituelle en dessous de la médiane (valeur exacte non affichée : effectif inférieur à 5) : baisse d'activité réelle ou retard de saisie à vérifier.`),
    };
  }

  return null;
}

function detecterTendance(serie: SerieHebdomadaire): SignalAnalyse | null {
  const fenetre = serie.semaines.slice(-SEMAINES_TENDANCE);
  if (fenetre.length < SEMAINES_TENDANCE) return null;

  const valeurs = fenetre.map((semaine) => semaine.valeur);
  const moitie = Math.floor(valeurs.length / 2);
  const debut = moyenne(valeurs.slice(0, moitie));
  const fin = moyenne(valeurs.slice(-moitie));
  if (debut < MOYENNE_MINIMUM_DEBUT_TENDANCE || fin < MINIMUM_UNITES_SIGNAL) return null;

  let hausses = 0;
  let baisses = 0;
  for (let index = 1; index < valeurs.length; index += 1) {
    if (valeurs[index] > valeurs[index - 1]) hausses += 1;
    else if (valeurs[index] < valeurs[index - 1]) baisses += 1;
  }

  const variation = ((fin - debut) / debut) * 100;
  const derniere = fenetre[fenetre.length - 1];
  const variations = valeurs.length - 1;
  const arrondi = Math.round(variation);
  const communs = { code: serie.code, libelle: serie.libelle, territoire: serie.territoire, semaine: derniere.debut, observe: masquerPetitEffectif(derniere.valeur), attendu: masquerPetitEffectif(Math.round(debut)) };

  const description = (sens: "hausse" | "baisse", nombreSens: number) =>
    `Sur les ${valeurs.length} dernières semaines, la moyenne hebdomadaire de ${minuscule(serie.libelle)} passe de ${nombre(Math.round(debut * 10) / 10)} (${moitie} premières semaines) ` +
    `à ${nombre(Math.round(fin * 10) / 10)} (${moitie} dernières), soit ${arrondi > 0 ? "+" : ""}${arrondi} %, avec ${nombreSens} ${sens === "hausse" ? "hausses" : "baisses"} sur ${variations} variations hebdomadaires. ` +
    `Seuil : au moins ${SEUIL_TENDANCE_POURCENT} % de variation et ${VARIATIONS_MINIMUM_MEME_SENS} variations sur ${variations} dans le même sens.`;

  if (variation >= SEUIL_TENDANCE_POURCENT && hausses >= VARIATIONS_MINIMUM_MEME_SENS) {
    return { ...communs, type: "hausse", mesure: arrondi, explication: description("hausse", hausses) };
  }
  if (variation <= -SEUIL_TENDANCE_POURCENT && baisses >= VARIATIONS_MINIMUM_MEME_SENS) {
    return { ...communs, type: "baisse", mesure: arrondi, explication: description("baisse", baisses) };
  }
  return null;
}

/** Analyse une serie : au plus un ecart (derniere semaine) et une tendance (dernieres semaines). */
export function analyserSerie(serie: SerieHebdomadaire): SignalAnalyse[] {
  return [detecterEcart(serie), detecterTendance(serie)].filter((signal): signal is SignalAnalyse => signal !== null);
}

/** Classement : les pics et hausses d'abord (plus utiles a surveiller), puis par intensite decroissante. */
export function analyserSeries(series: readonly SerieHebdomadaire[]): SignalAnalyse[] {
  const rang: Record<TypeSignal, number> = { pic: 0, hausse: 1, chute: 2, baisse: 3 };
  return series
    .flatMap((serie) => analyserSerie(serie))
    .sort((a, b) => rang[a.type] - rang[b.type] || Math.abs(b.mesure) - Math.abs(a.mesure) || a.territoire.localeCompare(b.territoire, "fr"))
    .slice(0, NOMBRE_MAXIMUM_SIGNAUX);
}

// Construction des series a partir de lignes d'agregats quotidiens (aucune donnee individuelle).

export function lundiDe(date: Date): Date {
  const jour = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const decalage = (jour.getUTCDay() + 6) % 7;
  jour.setUTCDate(jour.getUTCDate() - decalage);
  return jour;
}

export function dateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Lundis des `nombre` dernieres semaines COMPLETES avant `maintenant`, la plus ancienne en premier. */
export function lundisDesSemainesCompletes(maintenant: Date, nombreDeSemaines: number): string[] {
  const lundiCourant = lundiDe(maintenant);
  const cles: string[] = [];
  for (let index = nombreDeSemaines; index >= 1; index -= 1) {
    const lundi = new Date(lundiCourant);
    lundi.setUTCDate(lundi.getUTCDate() - 7 * index);
    cles.push(dateIso(lundi));
  }
  return cles;
}

export interface LigneAgregat {
  territoireId: string;
  date: Date;
  valeur: number;
}

/** Somme les lignes par territoire et par semaine ; une semaine sans ligne vaut 0. Les lignes hors des semaines demandees sont ignorees. */
export function construireSeriesHebdomadaires(
  lignes: readonly LigneAgregat[],
  lundis: readonly string[],
  territoires: ReadonlyMap<string, string>,
  indicateur: { code: string; libelle: string }
): SerieHebdomadaire[] {
  const totaux = new Map<string, Map<string, number>>();
  const semainesRetenues = new Set(lundis);
  for (const ligne of lignes) {
    const semaine = dateIso(lundiDe(ligne.date));
    if (!semainesRetenues.has(semaine)) continue;
    let parSemaine = totaux.get(ligne.territoireId);
    if (!parSemaine) {
      parSemaine = new Map();
      totaux.set(ligne.territoireId, parSemaine);
    }
    parSemaine.set(semaine, (parSemaine.get(semaine) ?? 0) + ligne.valeur);
  }

  const series: SerieHebdomadaire[] = [];
  for (const [territoireId, parSemaine] of totaux) {
    const nom = territoires.get(territoireId);
    if (nom === undefined) continue;
    const semaines = lundis.map((debut) => ({ debut, valeur: parSemaine.get(debut) ?? 0 }));
    if (semaines.every((semaine) => semaine.valeur === 0)) continue;
    series.push({ code: indicateur.code, libelle: indicateur.libelle, territoire: nom, semaines });
  }
  return series;
}
