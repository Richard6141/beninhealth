/**
 * Marquage automatique des absences (RG-RDV-40). Module serveur SANS
 * "use server" : `marquerAbsencesDues(date)` passerait sinon pour un point
 * d'entree atteignable par POST, qui permettrait a n'importe qui de declarer
 * "absents" tous les rendez-vous confirmes avant une date de son choix.
 */

import { prisma } from "@/lib/prisma";
import { transitionnerRendezVousEnMasse } from "./rendez-vous-etats";

const DELAI_ABSENCE_MS = 60 * 60 * 1000; // 1h (RG-RDV-33/40)
const INTERVALLE_VERIFICATION_MS = 60 * 60 * 1000; // horaire (RG-RDV-40)

/**
 * RG-RDV-40 : marque "absent" les rendez-vous "confirme" dont l'heure est
 * depassee de plus d'1h sans arrivee. Bornee a une fenetre de recherche de
 * quelques jours (comme rappels-rendez-vous.ts) pour ne jamais reparcourir
 * tout l'historique a chaque passage.
 */
export async function marquerAbsencesDues(maintenant: Date = new Date()): Promise<number> {
  const borneBasse = new Date(maintenant.getTime() - 3 * 24 * 60 * 60 * 1000);

  return transitionnerRendezVousEnMasse(prisma, "marquer_absent", {
    conditions: {
      heureArrivee: null,
      date: { gte: borneBasse, lt: new Date(maintenant.getTime() - DELAI_ABSENCE_MS) },
    },
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __absencesRendezVousDemarrees: boolean | undefined;
}

async function executerAvecJournal(): Promise<void> {
  try {
    const nombre = await marquerAbsencesDues();
    if (nombre > 0) {
      console.log(`[rendez-vous] ${nombre} rendez-vous marque(s) absent (RG-RDV-40)`);
    }
  } catch (erreur) {
    console.error("[rendez-vous] echec du marquage automatique des absences", erreur);
  }
}

/**
 * Demarre le marquage planifie des absences. Idempotent (drapeau global,
 * meme technique que demarrerRappelsRendezVous/demarrerPurgeNotifications).
 */
export function demarrerMarquageAbsences(): void {
  if (globalThis.__absencesRendezVousDemarrees) {
    return;
  }
  globalThis.__absencesRendezVousDemarrees = true;

  setInterval(() => {
    void executerAvecJournal();
  }, INTERVALLE_VERIFICATION_MS);

  console.log("[rendez-vous] marquage planifie des absences demarre (horaire, RG-RDV-40)");
}
