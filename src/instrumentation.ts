/**
 * Point d'entree Next.js execute une fois au demarrage du serveur (stable
 * depuis Next 15, aucun flag experimental requis). Demarre les taches
 * planifiees en process : pilotage (F-PIL-07, chapitre 14 du pack, voir
 * src/modules/pilotage/planificateur.ts), marquage des rendez-vous absents
 * (F-RDV-04/05, RG-RDV-40/41, voir src/modules/facility/marquage-absences.ts), purge
 * des notifications (F-NOT-01, conservation 90 jours, voir
 * src/modules/notification/purge.ts) et rappels de rendez-vous (F-RDV-07,
 * voir src/modules/facility/rappels-rendez-vous.ts) et remise des SMS differes
 * a 7h00 (F-NOT-02, RG-NOT-04, voir src/modules/notification/sms/remise-differes.ts),
 * relances du laboratoire (F-LAB-05, expiration des demandes F-LAB-01/RG-LAB-03,
 * voir src/modules/laboratoire/relances.ts) et
 * detection d'anomalies d'acces (F-AUD-03, voir src/modules/audit/detection-anomalies.ts) et
 * escalade des demandes de rectification sans reponse sous 30 jours (F-CIT-13, voir
 * src/modules/patient/rectification-escalade.ts) et detection horaire des alertes
 * epidemiologiques (F-PIL-06, voir src/modules/pilotage/detection-alertes.ts).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { demarrerPlanificateurPilotage } = await import("@/modules/pilotage/planificateur");
  demarrerPlanificateurPilotage();

  const { demarrerMarquageAbsences } = await import("@/modules/facility/marquage-absences");
  demarrerMarquageAbsences();

  const { demarrerExpirationDemandes } = await import("@/modules/facility/expiration-demandes");
  demarrerExpirationDemandes();

  const { demarrerPurgeNotifications } = await import("@/modules/notification/purge");
  demarrerPurgeNotifications();

  const { demarrerRappelsRendezVous } = await import("@/modules/facility/rappels-rendez-vous");
  demarrerRappelsRendezVous();

  const { demarrerRemiseSmsDifferes } = await import("@/modules/notification/sms/remise-differes");
  demarrerRemiseSmsDifferes();

  const { demarrerRelancesLaboratoire } = await import("@/modules/laboratoire/relances");
  demarrerRelancesLaboratoire();

  const { demarrerDetectionAnomalies } = await import("@/modules/audit/detection-anomalies");
  demarrerDetectionAnomalies();

  const { demarrerEscaladeRectification } = await import("@/modules/patient/rectification-escalade");
  demarrerEscaladeRectification();

  const { demarrerDetectionAlertesEpidemiologiques } = await import("@/modules/pilotage/detection-alertes");
  demarrerDetectionAlertesEpidemiologiques();
}
