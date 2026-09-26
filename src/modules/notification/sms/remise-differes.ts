import { prisma } from "@/lib/prisma";
import { suivreExecution } from "@/modules/administration/executions-taches";

/**
 * Remise des SMS differes (F-NOT-02, RG-NOT-04 du pack) : un SMS non urgent
 * demande entre 21h et 7h (heure du Benin) est enregistre au statut "differe"
 * avec une date programmee a 7h00 (voir envoyer.ts). Ce module le remet
 * quand cette date est atteinte : la ligne passe a "simule" (seul fournisseur
 * de ce depot, boite d'envoi simulee : aucun SMS reel ne part) et sa date
 * d'envoi devient l'instant de la remise.
 *
 * Meme principe d'implementation que purge.ts (setInterval en process, pas de
 * file de taches externe). Chaque ligne est reclamee par une mise a jour
 * conditionnelle (statut encore "differe") : si deux instances tournent, une
 * seule remet un SMS donne, jamais deux fois.
 */

const INTERVALLE_VERIFICATION_MS = 5 * 60 * 1000;

declare global {
  var __remiseSmsDifferesDemarree: boolean | undefined;
}

/** Remet les SMS differes dont la date programmee est atteinte. Retourne le nombre remis. */
export async function remettreSmsDifferes(maintenant: Date = new Date()): Promise<number> {
  const echus = await prisma.envoiSms.findMany({
    where: { statut: "differe", dateProgrammee: { lte: maintenant } },
    select: { id: true },
  });

  let remis = 0;
  for (const { id } of echus) {
    const reclamation = await prisma.envoiSms.updateMany({
      where: { id, statut: "differe" },
      data: { statut: "simule", dateEnvoi: maintenant },
    });
    remis += reclamation.count;
  }

  return remis;
}

async function executerRemiseAvecJournal(): Promise<void> {
  try {
    await suivreExecution("remise_sms_differes", async () => {
      const remis = await remettreSmsDifferes();
      if (remis > 0) {
        console.log(`[notification] ${remis} SMS differe(s) remis a leur heure programmee`);
      }
      return remis;
    });
  } catch (erreur) {
    console.error("[notification] echec de la remise des SMS differes", erreur);
  }
}

/** Demarre la remise planifiee. Idempotent (drapeau global), comme demarrerPurgeNotifications. */
export function demarrerRemiseSmsDifferes(): void {
  if (globalThis.__remiseSmsDifferesDemarree) {
    return;
  }
  globalThis.__remiseSmsDifferesDemarree = true;

  setInterval(() => {
    void executerRemiseAvecJournal();
  }, INTERVALLE_VERIFICATION_MS);

  console.log("[notification] remise planifiee des SMS differes demarree (toutes les 5 minutes)");
}
