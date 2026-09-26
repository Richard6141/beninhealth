import { prisma } from "@/lib/prisma";
import { executerTacheHoraire, executerTacheNocturne } from "./agregation";

/**
 * Planification des taches de F-PIL-07 (points 2 et 3 du pack) : une tache
 * horaire (recalcule les jours/etablissements touches par la file
 * d'evenements) et une tache nocturne a 02h00 heure du serveur (filet de
 * securite, recalcule les 90 derniers jours complets pour tous les
 * etablissements).
 *
 * Implementation en process (setInterval), pas de file de taches externe
 * (Redis/BullMQ) : coherent avec le reste de ce MVP (un seul serveur Next.js,
 * pas d'infrastructure de job runner deployee). A revoir si la plateforme
 * doit un jour tourner sur plusieurs instances (deux instances lanceraient
 * chacune leur propre planificateur et dupliqueraient le travail : sans
 * consequence fonctionnelle grace a l'idempotence RG-PIL-60, mais du travail
 * en double).
 */

const INTERVALLE_HORAIRE_MS = 60 * 60 * 1000;
const INTERVALLE_VERIFICATION_NOCTURNE_MS = 5 * 60 * 1000;
const HEURE_TACHE_NOCTURNE = 2;

declare global {
  // eslint-disable-next-line no-var
  var __planificateurPilotageDemarre: boolean | undefined;
}

let derniereDateTacheNocturne: string | null = null;

async function executerTacheHoraireAvecJournal(): Promise<void> {
  try {
    const { joursTraites } = await executerTacheHoraire(prisma);
    if (joursTraites > 0) {
      console.log(`[pilotage] tache horaire : ${joursTraites} couple(s) jour/etablissement recalcule(s)`);
    }
  } catch (erreur) {
    console.error("[pilotage] echec de la tache horaire de recalcul", erreur);
  }
}

async function verifierEtLancerTacheNocturne(): Promise<void> {
  const maintenant = new Date();
  const cleJour = maintenant.toISOString().slice(0, 10);

  if (maintenant.getHours() !== HEURE_TACHE_NOCTURNE || derniereDateTacheNocturne === cleJour) {
    return;
  }

  derniereDateTacheNocturne = cleJour;
  try {
    const { joursTraites } = await executerTacheNocturne(prisma);
    console.log(`[pilotage] tache nocturne : ${joursTraites} couple(s) jour/etablissement recalcule(s)`);
  } catch (erreur) {
    console.error("[pilotage] echec de la tache nocturne de recalcul", erreur);
  }
}

/**
 * Demarre les deux tâches planifiees. Idempotent (un drapeau global evite un
 * double demarrage si register() est appele plusieurs fois, ce qui arrive en
 * developpement avec le rechargement a chaud de Next.js).
 */
export function demarrerPlanificateurPilotage(): void {
  if (globalThis.__planificateurPilotageDemarre) {
    return;
  }
  globalThis.__planificateurPilotageDemarre = true;

  setInterval(() => {
    void executerTacheHoraireAvecJournal();
  }, INTERVALLE_HORAIRE_MS);

  setInterval(() => {
    void verifierEtLancerTacheNocturne();
  }, INTERVALLE_VERIFICATION_NOCTURNE_MS);

  console.log("[pilotage] planificateur demarre (tache horaire + verification nocturne 02h00)");
}
