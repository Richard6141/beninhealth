/**
 * Le Benin est toujours a l'heure Africa/Porto-Novo, UTC+1 fixe, sans heure
 * d'ete. Ce depot ne doit JAMAIS deduire une heure "locale" a partir du
 * fuseau horaire du serveur (horloge systeme / process.env.TZ) : celui-ci
 * depend de l'hebergement et peut deriver dans le temps (ex. un serveur
 * configure sur Europe/London coincide avec UTC+1 tant que l'heure d'ete
 * britannique est active, puis diverge d'une heure fin octobre). Point
 * d'entree unique pour cette conversion, plutot qu'un `new Date(chaine)` ou
 * un `.getHours()`/`.setHours()` ambiant repete a chaque endroit qui
 * manipule une heure de rendez-vous ou de rappel (voir
 * docs/coordination-agents.md, F-ETA-05, pour l'incident d'origine).
 *
 * `src/modules/facility/creneau-disponible.ts` (dateDansUnCreneauDisponible)
 * appliquait deja ce principe independamment, avec le meme calcul manuel :
 * ce fichier n'y touche pas (deja correct, pas son perimetre), mais tout
 * nouveau code devrait utiliser ces fonctions plutot que redupliquer le
 * calcul une troisieme fois.
 */

const DECALAGE_BENIN_MS = 60 * 60 * 1000;

/**
 * Interprete une chaine "YYYY-MM-DDTHH:mm" (ou avec secondes), telle que
 * produite par un champ <input type="datetime-local">, comme une heure
 * LOCALE Africa/Porto-Novo (jamais le fuseau du serveur), et renvoie
 * l'instant UTC correspondant. Renvoie une Date invalide (Number.isNaN sur
 * .getTime()) si la chaine ne correspond pas au format attendu, comme
 * new Date() sur une chaine invalide.
 */
export function dateDepuisChaineLocaleBenin(valeur: string): Date {
  const correspondance = valeur
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);

  if (!correspondance) {
    return new Date(NaN);
  }

  const [, annee, mois, jour, heure, minute, seconde] = correspondance;

  return new Date(
    Date.UTC(
      Number(annee),
      Number(mois) - 1,
      Number(jour),
      Number(heure) - 1, // UTC+1 : on retranche le decalage pour obtenir l'UTC.
      Number(minute),
      seconde ? Number(seconde) : 0
    )
  );
}

/**
 * Jour de la semaine (0 = dimanche) et minutes depuis minuit, en heure LOCALE
 * Africa/Porto-Novo, pour un instant UTC donne (meme calcul que
 * dateDansUnCreneauDisponible dans creneau-disponible.ts).
 */
export function jourEtMinutesLocalesBenin(dateUtc: Date): { jourSemaine: number; minutes: number } {
  const dateLocale = new Date(dateUtc.getTime() + DECALAGE_BENIN_MS);
  return {
    jourSemaine: dateLocale.getUTCDay(),
    minutes: dateLocale.getUTCHours() * 60 + dateLocale.getUTCMinutes(),
  };
}

/** 18h00 heure locale Africa/Porto-Novo, la veille du jour de dateUtc (instant UTC correspondant). */
export function veilleA18hBenin(dateUtc: Date): Date {
  const dateLocale = new Date(dateUtc.getTime() + DECALAGE_BENIN_MS);
  const veilleLocaleMinuit = Date.UTC(
    dateLocale.getUTCFullYear(),
    dateLocale.getUTCMonth(),
    dateLocale.getUTCDate() - 1,
    18,
    0,
    0,
    0
  );
  return new Date(veilleLocaleMinuit - DECALAGE_BENIN_MS);
}
