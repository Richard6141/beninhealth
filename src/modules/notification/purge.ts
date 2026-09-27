import { prisma } from "@/lib/prisma";
import { purgerExecutionsAnciennes, suivreExecution } from "@/modules/administration/executions-taches";
import { purgerCommentairesRetourExpires } from "@/modules/ai/journal";

/**
 * Purge des notifications au-dela de la conservation prevue par le pack
 * (F-NOT-01 : "Conservation 90 jours"). Contrairement au chainage du journal
 * d'audit (JournalAudit, jamais purge : trace legale), une notification est
 * un message de confort de lecture, pas une preuve : sa suppression apres
 * 90 jours n'affecte aucune trace d'audit, qui reste ailleurs (JournalAudit).
 *
 * Meme principe d'implementation que src/modules/pilotage/planificateur.ts
 * (setInterval en process, pas de file de taches externe), mais module
 * separe et independant : ne depend d'aucun fichier du module pilotage, pas
 * de risque de collision avec les chantiers en cours dessus ce soir.
 */

const JOURS_CONSERVATION = 90;
const INTERVALLE_VERIFICATION_MS = 6 * 60 * 60 * 1000; // toutes les 6h suffit pour une purge quotidienne

declare global {
  var __purgeNotificationsDemarree: boolean | undefined;
}

/** Supprime les notifications plus vieilles que JOURS_CONSERVATION. Retourne le nombre supprime. */
export async function purgerNotificationsExpirees(maintenant: Date = new Date()): Promise<number> {
  const seuil = new Date(maintenant.getTime() - JOURS_CONSERVATION * 24 * 60 * 60 * 1000);

  const resultat = await prisma.notification.deleteMany({
    where: { date: { lt: seuil } },
  });

  return resultat.count;
}

async function executerPurgeAvecJournal(): Promise<void> {
  try {
    await suivreExecution("purge_notifications", async () => {
      const nombreSupprime = await purgerNotificationsExpirees();
      if (nombreSupprime > 0) {
        console.log(`[notification] purge : ${nombreSupprime} notification(s) de plus de ${JOURS_CONSERVATION} jours supprimee(s)`);
      }
      // Le suivi des taches (F-ADM-01) se purge lui-meme, a 30 jours.
      await purgerExecutionsAnciennes();
      // RG-IA-08 : les commentaires libres de retour sur l'IA sont effaces a 30 jours.
      await purgerCommentairesRetourExpires();
      return nombreSupprime;
    });
  } catch (erreur) {
    console.error("[notification] echec de la purge planifiee", erreur);
  }
}

/**
 * Demarre la purge planifiee. Idempotent (drapeau global, meme technique que
 * demarrerPlanificateurPilotage) : evite un double demarrage si register()
 * est appele plusieurs fois (rechargement a chaud de Next.js en
 * developpement).
 */
export function demarrerPurgeNotifications(): void {
  if (globalThis.__purgeNotificationsDemarree) {
    return;
  }
  globalThis.__purgeNotificationsDemarree = true;

  setInterval(() => {
    void executerPurgeAvecJournal();
  }, INTERVALLE_VERIFICATION_MS);

  console.log("[notification] purge planifiee demarree (conservation 90 jours)");
}
