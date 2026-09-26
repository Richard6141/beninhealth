/**
 * Point d'entree Next.js execute une fois au demarrage du serveur (stable
 * depuis Next 15, aucun flag experimental requis). Sert ici uniquement a
 * demarrer le planificateur des taches de pilotage (F-PIL-07, chapitre 14 du
 * pack) : voir src/modules/pilotage/planificateur.ts.
 *
 * F-RDV-04/05 (RG-RDV-40) : marquage planifie horaire des rendez-vous
 * "absent", voir src/modules/facility/file-du-jour.ts.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { demarrerPlanificateurPilotage } = await import("@/modules/pilotage/planificateur");
  demarrerPlanificateurPilotage();

  const { demarrerMarquageAbsences } = await import("@/modules/facility/file-du-jour");
  demarrerMarquageAbsences();
}
