/**
 * Verification interne de la disponibilite d'un professionnel (F-ETA-05).
 * Module SANS "use server" : cette fonction est appelee par les actions de
 * prise de rendez-vous, jamais directement par un client (en "use server",
 * chaque export est un point d'entree atteignable par POST sans session).
 */

import { prisma } from "@/lib/prisma";
import { dateDepuisJourCivil, jourCivilBenin } from "@/modules/administration/jours-feries-calcul";

type ResultatCreneau =
  | { statut: "ferie" }
  | { statut: "aucun_horaire" }
  | { statut: "hors_horaire" }
  | { statut: "trouve"; capacite: number };

/**
 * Cherche le creneau (s'il existe) qui couvre cet instant pour ce
 * professionnel. Partage par dateDansUnCreneauDisponible et
 * capaciteDuCreneau ci-dessous pour ne jamais dupliquer la logique de
 * correspondance jour/heure.
 *
 * RG-ETA-42 : un jour ferie ACTIF du referentiel (F-ADM-04) ne genere aucun
 * creneau, quel que soit l'agenda du professionnel, y compris quand il n'en
 * a defini aucun. Le jour civil est celui du Benin.
 *
 * Limite assumee (perimetre reduit F-ETA-05) : si ce professionnel n'a
 * ENCORE aucun creneau configure, "aucun_horaire" (traite comme disponible
 * par dateDansUnCreneauDisponible, comportement inchange par rapport a
 * avant cette fiche), pour ne pas bloquer retroactivement la prise de
 * rendez-vous aupres de tous les professionnels deja existants qui n'ont
 * jamais defini d'agenda. Des qu'un professionnel definit au moins un
 * creneau, seules les heures qu'il a explicitement ouvertes deviennent
 * reservables pour lui.
 */
async function trouverCreneauCorrespondant(professionnelId: string, dateUtc: Date): Promise<ResultatCreneau> {
  const jourFerie = await prisma.jourFerie.findFirst({
    where: { date: dateDepuisJourCivil(jourCivilBenin(dateUtc)), actif: true },
    select: { id: true },
  });

  if (jourFerie) {
    return { statut: "ferie" };
  }

  const creneaux = await prisma.creneauDisponibilite.findMany({ where: { professionnelId } });
  if (creneaux.length === 0) {
    return { statut: "aucun_horaire" };
  }

  // RG-ETA-43 : ce fuseau est fixe UTC+1 sans heure d'ete, donc un simple
  // decalage d'une heure suffit, pas besoin de stocker un fuseau.
  const dateLocale = new Date(dateUtc.getTime() + 60 * 60 * 1000);
  const jourSemaineLocal = dateLocale.getUTCDay();
  const minutesLocal = dateLocale.getUTCHours() * 60 + dateLocale.getUTCMinutes();

  const trouve = creneaux.find(
    (creneau) =>
      creneau.jourSemaine === jourSemaineLocal &&
      minutesLocal >= creneau.heureDebutMinutes &&
      minutesLocal < creneau.heureFinMinutes
  );

  return trouve ? { statut: "trouve", capacite: trouve.capacite } : { statut: "hors_horaire" };
}

/**
 * Utilise par creerRendezVousAction (src/modules/facility/actions.ts) :
 * verifie qu'un instant UTC donne tombe dans un creneau defini pour ce
 * professionnel, en heure LOCALE Africa/Porto-Novo. Voir
 * trouverCreneauCorrespondant ci-dessus pour le detail des cas.
 */
export async function dateDansUnCreneauDisponible(professionnelId: string, dateUtc: Date): Promise<boolean> {
  const resultat = await trouverCreneauCorrespondant(professionnelId, dateUtc);
  return resultat.statut === "aucun_horaire" || resultat.statut === "trouve";
}

/**
 * Capacite du creneau qui couvre cet instant (F-ETA-05, ajoute le
 * 2026-09-27) : nombre de patients pouvant reserver le meme creneau
 * nominal. Renvoie 1 quand le professionnel n'a defini aucun agenda
 * (meme limite assumee que dateDansUnCreneauDisponible ci-dessus : on ne
 * change pas le comportement par defaut, seule une capacite explicitement
 * configuree autorise plus d'un rendez-vous au meme instant nominal).
 * A n'appeler qu'apres avoir verifie dateDansUnCreneauDisponible (une
 * date hors creneau ou feriee n'a pas de capacite a proprement parler,
 * ce cas ne devrait jamais atteindre ce point dans les appelants).
 */
export async function capaciteDuCreneau(professionnelId: string, dateUtc: Date): Promise<number> {
  const resultat = await trouverCreneauCorrespondant(professionnelId, dateUtc);
  return resultat.statut === "trouve" ? resultat.capacite : 1;
}
