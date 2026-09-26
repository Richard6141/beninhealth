/**
 * Verification interne de la disponibilite d'un professionnel (F-ETA-05).
 * Module SANS "use server" : cette fonction est appelee par les actions de
 * prise de rendez-vous, jamais directement par un client (en "use server",
 * chaque export est un point d'entree atteignable par POST sans session).
 */

import { prisma } from "@/lib/prisma";
import { dateDepuisJourCivil, jourCivilBenin } from "@/modules/administration/jours-feries-calcul";

/**
 * Utilise par creerRendezVousAction (src/modules/facility/actions.ts) :
 * verifie qu'un instant UTC donne tombe dans un creneau defini pour ce
 * professionnel, en heure LOCALE Africa/Porto-Novo (RG-ETA-43, UTC+1 fixe,
 * sans heure d'ete : un simple decalage d'une heure suffit).
 *
 * Limite assumee (perimetre reduit F-ETA-05) : si ce professionnel n'a
 * ENCORE aucun creneau configure, renvoie true (comportement inchange par
 * rapport a avant cette fiche), pour ne pas bloquer retroactivement la prise
 * de rendez-vous aupres de tous les professionnels deja existants qui n'ont
 * jamais defini d'agenda. Des qu'un professionnel definit au moins un
 * creneau, seules les heures qu'il a explicitement ouvertes deviennent
 * reservables pour lui.
 *
 * RG-ETA-42 : un jour ferie ACTIF du referentiel (F-ADM-04) ne genere aucun
 * creneau, quel que soit l'agenda du professionnel, y compris quand il n'en
 * a defini aucun. Le jour civil est celui du Benin. Un jour desactive, ou
 * une annee jamais generee, ne bloque rien.
 */
export async function dateDansUnCreneauDisponible(professionnelId: string, dateUtc: Date): Promise<boolean> {
  const jourFerie = await prisma.jourFerie.findFirst({
    where: { date: dateDepuisJourCivil(jourCivilBenin(dateUtc)), actif: true },
    select: { id: true },
  });

  if (jourFerie) {
    return false;
  }

  const creneaux = await prisma.creneauDisponibilite.findMany({ where: { professionnelId } });
  if (creneaux.length === 0) {
    return true;
  }

  const dateLocale = new Date(dateUtc.getTime() + 60 * 60 * 1000);
  const jourSemaineLocal = dateLocale.getUTCDay();
  const minutesLocal = dateLocale.getUTCHours() * 60 + dateLocale.getUTCMinutes();

  return creneaux.some(
    (creneau) =>
      creneau.jourSemaine === jourSemaineLocal &&
      minutesLocal >= creneau.heureDebutMinutes &&
      minutesLocal < creneau.heureFinMinutes
  );
}
