import { prisma } from "@/lib/prisma";
import { suivreExecution } from "@/modules/administration/executions-taches";
import { demarrerRepriseSms, tenterLivraison } from "./livraison";
import { fournisseurSms, type SmsProvider } from "./provider";

/**
 * Remise des SMS differes (F-NOT-02, RG-NOT-04 du pack) : un SMS non urgent
 * demande entre 21h et 7h (heure du Benin) est enregistre au statut "differe"
 * avec une date programmee a 7h00 (voir envoyer.ts). Ce module le remet
 * quand cette date est atteinte : la ligne passe a "en_attente" puis la
 * livraison est tentee tout de suite par livraison.ts (RG-NOT-03 : reprises et
 * statut "echec"). Avec la boite d'envoi simulee, la ligne devient "simule".
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
export async function remettreSmsDifferes(maintenant: Date = new Date(), fournisseur: SmsProvider = fournisseurSms()): Promise<number> {
  const echus = await prisma.envoiSms.findMany({
    where: { statut: "differe", dateProgrammee: { lte: maintenant } },
    select: { id: true },
  });

  let remis = 0;
  for (const { id } of echus) {
    const reclamation = await prisma.envoiSms.updateMany({
      where: { id, statut: "differe" },
      data: { statut: "en_attente", tentatives: 0, prochaineTentativeLe: maintenant, dateEnvoi: maintenant },
    });
    if (reclamation.count === 0) continue;
    remis += 1;
    await tenterLivraison(id, fournisseur, maintenant);
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

  // Les reprises de SMS (RG-NOT-03) partent avec la remise : un seul point de demarrage dans src/instrumentation.ts.
  demarrerRepriseSms();

  setInterval(() => {
    void executerRemiseAvecJournal();
  }, INTERVALLE_VERIFICATION_MS);

  console.log("[notification] remise planifiee des SMS differes demarree (toutes les 5 minutes)");
}
