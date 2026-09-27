/**
 * Escalade automatique des demandes de rectification (F-CIT-13 du pack,
 * type 2) sans reponse du professionnel destinataire sous 30 jours. Module
 * pur (pas de "use server") : aucune de ces fonctions n'est un point
 * d'entree, appelees uniquement par src/instrumentation.ts (tache planifiee)
 * et par les tests, meme principe que src/modules/audit/detection-anomalies.ts
 * (purge.ts, relances.ts).
 *
 * Role "AUDITOR" du pack absent de ce depot (deja route vers admin_national
 * ailleurs dans ce module, voir droits-donnees.ts) : une demande escaladee
 * recoit une entree JournalAudit dediee plutot qu'un nouveau modele de
 * notification, meme principe que le reste de ce fichier.
 *
 * Ne concerne que les demandes DEJA routees vers un professionnel
 * (professionnelDestinataireId non nul) : une demande generale (sans
 * element precis) n'a jamais de delai de reponse a surveiller, elle reste
 * une simple entree JournalAudit consultable a tout moment par
 * admin_national.
 */

import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { suivreExecution } from "@/modules/administration/executions-taches";

const DELAI_ESCALADE_JOURS = 30;
const INTERVALLE_VERIFICATION_MS = 60 * 60 * 1000; // verifie chaque heure, comme detection-anomalies.ts

declare global {
  var __escaladeRectificationDemarree: boolean | undefined;
}

/**
 * Escalade les demandes en_attente, routees vers un professionnel, dont la
 * date de creation depasse le delai de 30 jours. Retourne le nombre de
 * demandes escaladees.
 */
export async function escaladerDemandesRectificationEnRetard(maintenant: Date = new Date()): Promise<number> {
  const seuil = new Date(maintenant.getTime() - DELAI_ESCALADE_JOURS * 24 * 60 * 60 * 1000);

  const enRetard = await prisma.demandeRectification.findMany({
    where: {
      statut: "en_attente",
      professionnelDestinataireId: { not: null },
      dateCreation: { lt: seuil },
    },
    include: { patient: true },
  });

  for (const demande of enRetard) {
    await prisma.$transaction(async (tx) => {
      await tx.demandeRectification.update({
        where: { id: demande.id },
        data: { statut: "escaladee", dateEscalade: maintenant },
      });

      await journaliser(
        {
          utilisateurId: demande.patient.userId,
          action: "escalade_demande_rectification",
          donneeConcernee: `demande_rectification:${demande.id}`,
          adresseTechnique: "tache_planifiee",
          justification: `Demande de rectification sans reponse du professionnel sous ${DELAI_ESCALADE_JOURS} jours (F-CIT-13).`,
        },
        tx
      );
    });
  }

  return enRetard.length;
}

async function executerEscaladeAvecJournal(): Promise<void> {
  try {
    await suivreExecution("escalade_demandes_rectification", async () => {
      const nombreEscaladees = await escaladerDemandesRectificationEnRetard();
      if (nombreEscaladees > 0) {
        console.log(`[patient] escalade de rectification : ${nombreEscaladees} demande(s) escaladee(s)`);
      }
      return nombreEscaladees;
    });
  } catch (erreur) {
    console.error("[patient] echec de l'escalade planifiee des demandes de rectification", erreur);
  }
}

/** Demarre la tache planifiee (idempotent : un seul demarrage par process, meme sous Fast Refresh). */
export function demarrerEscaladeRectification(): void {
  if (globalThis.__escaladeRectificationDemarree) {
    return;
  }
  globalThis.__escaladeRectificationDemarree = true;

  setInterval(() => {
    void executerEscaladeAvecJournal();
  }, INTERVALLE_VERIFICATION_MS);

  console.log("[patient] escalade planifiee des demandes de rectification demarree (toutes les heures)");
}
