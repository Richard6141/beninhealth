/**
 * Calcul des jours feries (F-ADM-04, RG-ETA-42 du pack). Module SANS
 * "use server" : fonctions pures, partagees entre l'administration du
 * referentiel et la verification des creneaux.
 *
 * Dates au format "AAAA-MM-JJ" (jour civil, sans fuseau) : c'est ce que
 * stocke JourFerie.date (colonne DATE). Le jour civil d'un instant est celui
 * du Benin, UTC+1 sans heure d'ete (meme convention que RG-ETA-43).
 *
 * Seuls les jours DETERMINISTES sont generes : dates fixes et fetes
 * chretiennes mobiles (calculees a partir de Paques). Les fetes musulmanes
 * (Aid el-Fitr, Aid el-Kebir, Maouloud) dependent de l'observation de la lune
 * et sont donc a saisir a la main par l'administration, jamais deduites ici.
 * La liste des fetes retenues reprend le calendrier officiel du Benin tel
 * qu'il est connu de l'equipe et n'a pas ete revalidee aupres d'une source
 * officielle : l'administrateur la relit avant usage.
 */

export interface JourFerieCalcule {
  /** "AAAA-MM-JJ" */
  date: string;
  libelle: string;
}

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;
const DECALAGE_BENIN_MS = 60 * 60 * 1000;

function enChaine(annee: number, mois: number, jour: number): string {
  return `${String(annee).padStart(4, "0")}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

/** Dimanche de Paques (calendrier gregorien, algorithme de Meeus, Jones et Butcher). */
export function dimancheDePaques(annee: number): { mois: number; jour: number } {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;

  return { mois, jour };
}

function apresPaques(annee: number, jours: number): string {
  const paques = dimancheDePaques(annee);
  const date = new Date(Date.UTC(annee, paques.mois - 1, paques.jour) + jours * MS_PAR_JOUR);

  return enChaine(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Jours feries fixes et chretiens mobiles d'une annee, tries par date. */
export function joursFeriesDeterministes(annee: number): JourFerieCalcule[] {
  return [
    { date: enChaine(annee, 1, 1), libelle: "Jour de l'An" },
    { date: enChaine(annee, 1, 10), libelle: "Fête nationale du Vodoun" },
    { date: apresPaques(annee, 1), libelle: "Lundi de Pâques" },
    { date: enChaine(annee, 5, 1), libelle: "Fête du Travail" },
    { date: apresPaques(annee, 39), libelle: "Ascension" },
    { date: apresPaques(annee, 50), libelle: "Lundi de Pentecôte" },
    { date: enChaine(annee, 8, 1), libelle: "Fête de l'Indépendance" },
    { date: enChaine(annee, 8, 15), libelle: "Assomption" },
    { date: enChaine(annee, 11, 1), libelle: "Toussaint" },
    { date: enChaine(annee, 12, 25), libelle: "Noël" },
  ].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

/** Jour civil ("AAAA-MM-JJ") d'un instant, a l'heure du Benin. */
export function jourCivilBenin(instant: Date): string {
  const local = new Date(instant.getTime() + DECALAGE_BENIN_MS);

  return enChaine(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
}

const FORMAT_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Vrai pour une vraie date du calendrier au format "AAAA-MM-JJ" (refuse 2026-02-30). */
export function jourCivilValide(valeur: string): boolean {
  const morceaux = FORMAT_JOUR.exec(valeur);
  if (!morceaux) return false;

  const [, annee, mois, jour] = morceaux.map(Number);
  const date = new Date(Date.UTC(annee, mois - 1, jour));

  return date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour;
}

/** Valeur a passer a Prisma pour une colonne DATE : minuit UTC du jour civil. */
export function dateDepuisJourCivil(jour: string): Date {
  return new Date(`${jour}T00:00:00.000Z`);
}

/** Jour civil ("AAAA-MM-JJ") d'une colonne DATE lue par Prisma. */
export function jourCivilDepuisDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
