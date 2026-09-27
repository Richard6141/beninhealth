/**
 * Expiration des demandes de rendez-vous sans reponse (F-RDV-03, RG-RDV-20) :
 * une demande passe a "expire" (et le patient est prevenu) 24 heures apres sa
 * creation, ou au plus tard 1 heure avant le creneau, au premier des deux.
 * Le creneau est libere. Module serveur SANS "use server" (meme raison que
 * marquage-absences.ts : jamais un point d'entree atteignable par POST).
 */

import { prisma } from "@/lib/prisma";
import { suivreExecution } from "@/modules/administration/executions-taches";
import { creerNotification } from "@/modules/notification/creer";
import { transitionnerRendezVous } from "./rendez-vous-etats";
import { AVANCE_EXPIRATION_AVANT_CRENEAU_MS, DELAI_EXPIRATION_DEMANDE_MS, demandeExpiree } from "./regles-rendez-vous";

const INTERVALLE_VERIFICATION_MS = 15 * 60 * 1000;

/**
 * Passe a "expire" les demandes dont le delai est ecoule et previent chaque
 * patient. Retourne le nombre de demandes expirees. Chaque transition est
 * conditionnee au statut "demande" : une demande confirmee ou refusee entre la
 * lecture et l'ecriture n'est jamais ecrasee.
 */
export async function expirerDemandesSansReponse(maintenant: Date = new Date()): Promise<number> {
  const candidates = await prisma.rendezVous.findMany({
    where: {
      statut: "demande",
      OR: [
        { dateCreation: { lte: new Date(maintenant.getTime() - DELAI_EXPIRATION_DEMANDE_MS) } },
        { date: { lte: new Date(maintenant.getTime() + AVANCE_EXPIRATION_AVANT_CRENEAU_MS) } },
      ],
    },
    include: { patient: { select: { userId: true } }, etablissement: { select: { nom: true } } },
  });

  let expirees = 0;

  for (const demande of candidates) {
    if (!demandeExpiree(demande.dateCreation, demande.date, maintenant)) continue;
    if (!(await transitionnerRendezVous(prisma, demande.id, "expirer"))) continue;

    expirees += 1;

    try {
      await creerNotification(
        demande.patient.userId,
        "rendez_vous_expire",
        `Votre demande de rendez-vous à ${demande.etablissement.nom} n'a pas reçu de réponse à temps et a expiré. Vous pouvez en faire une nouvelle depuis votre espace.`,
        "/app/patient/rendez-vous"
      );
    } catch (erreur) {
      console.error("[rendez-vous] notification d'expiration non envoyee", erreur);
    }
  }

  return expirees;
}

declare global {
  // eslint-disable-next-line no-var
  var __expirationDemandesDemarree: boolean | undefined;
}

async function executerAvecJournal(): Promise<void> {
  try {
    await suivreExecution("expiration_demandes_rendez_vous", async () => {
      const nombre = await expirerDemandesSansReponse();
      if (nombre > 0) {
        console.log(`[rendez-vous] ${nombre} demande(s) expiree(s) (RG-RDV-20)`);
      }
      return nombre;
    });
  } catch (erreur) {
    console.error("[rendez-vous] echec de l'expiration des demandes", erreur);
  }
}

/** Demarre l'expiration planifiee des demandes. Idempotent (drapeau global, comme marquage-absences.ts). */
export function demarrerExpirationDemandes(): void {
  if (globalThis.__expirationDemandesDemarree) {
    return;
  }
  globalThis.__expirationDemandesDemarree = true;

  setInterval(() => {
    void executerAvecJournal();
  }, INTERVALLE_VERIFICATION_MS);

  console.log("[rendez-vous] expiration planifiee des demandes demarree (toutes les 15 minutes, RG-RDV-20)");
}
