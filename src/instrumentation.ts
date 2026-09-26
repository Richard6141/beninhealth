/**
 * Point d'entree Next.js execute une fois au demarrage du serveur (stable
 * depuis Next 15, aucun flag experimental requis). Demarre les taches
 * planifiees en process : pilotage (F-PIL-07, chapitre 14 du pack, voir
 * src/modules/pilotage/planificateur.ts), marquage des rendez-vous absents
 * (F-RDV-04/05, RG-RDV-40, voir src/modules/facility/file-du-jour.ts), purge
 * des notifications (F-NOT-01, conservation 90 jours, voir
 * src/modules/notification/purge.ts) et rappels de rendez-vous (F-RDV-07,
 * voir src/modules/facility/rappels-rendez-vous.ts) et remise des SMS differes
 * a 7h00 (F-NOT-02, RG-NOT-04, voir src/modules/notification/sms/remise-differes.ts).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { demarrerPlanificateurPilotage } = await import("@/modules/pilotage/planificateur");
  demarrerPlanificateurPilotage();

  const { demarrerMarquageAbsences } = await import("@/modules/facility/marquage-absences");
  demarrerMarquageAbsences();

  const { demarrerPurgeNotifications } = await import("@/modules/notification/purge");
  demarrerPurgeNotifications();

  const { demarrerRappelsRendezVous } = await import("@/modules/facility/rappels-rendez-vous");
  demarrerRappelsRendezVous();

  const { demarrerRemiseSmsDifferes } = await import("@/modules/notification/sms/remise-differes");
  demarrerRemiseSmsDifferes();
}
