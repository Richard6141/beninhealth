/**
 * Octroi de l'acces une fois la demande confirmee, quelle que soit la voie :
 * code dicte par le patient, ou confirmation dans son espace patient. Une seule
 * implementation pour que les deux voies produisent exactement le meme
 * Consentement, la meme trace et les memes garanties (voir actions.ts).
 */

import type { Prisma } from "@prisma/client";
import { journaliser } from "@/modules/audit/journaliser";

const UNE_HEURE_MS = 60 * 60 * 1000;

export type VoieConfirmation = "code" | "application";

export interface DemandeAConfirmer {
  id: string;
  patientId: string;
  modeRecherche: string;
  motif: string;
  dureeAccesHeures: number;
}

/**
 * Passe la demande de "en_attente" a "valide" et cree ou met a jour le
 * Consentement. Renvoie null (sans rien ecrire) si la demande n'est plus en
 * attente, par exemple parce qu'une autre voie l'a deja confirmee.
 */
export async function accorderAcces(
  tx: Prisma.TransactionClient,
  params: {
    demande: DemandeAConfirmer;
    professionnelUserId: string;
    adresseTechnique: string;
    voie: VoieConfirmation;
  }
): Promise<{ typeAcces: string; dateFin: Date | null } | null> {
  const { demande, professionnelUserId, adresseTechnique, voie } = params;
  const maintenant = new Date();
  const finDemandee = new Date(maintenant.getTime() + demande.dureeAccesHeures * UNE_HEURE_MS);

  const validation = await tx.demandeAccesDossier.updateMany({
    where: { id: demande.id, statut: "en_attente", expireLe: { gt: maintenant } },
    data: { statut: "valide", valideLe: maintenant },
  });

  if (validation.count === 0) {
    return null;
  }

  // Jamais de retrogradation : un acces plus large ou plus long deja accorde
  // par le patient lui-meme reste tel quel.
  const existant = await tx.consentement.findUnique({
    where: { patientId_acteurAutoriseId: { patientId: demande.patientId, acteurAutoriseId: professionnelUserId } },
  });
  const existantActif =
    existant !== null && existant.statut === "actif" && (existant.dateFin === null || existant.dateFin > maintenant);
  const typeAcces = existantActif && existant.typeAcces === "dossier_complet" ? "dossier_complet" : "consultations";
  const dateFin =
    existantActif && (existant.dateFin === null || existant.dateFin > finDemandee) ? existant.dateFin : finDemandee;

  await tx.consentement.upsert({
    where: { patientId_acteurAutoriseId: { patientId: demande.patientId, acteurAutoriseId: professionnelUserId } },
    create: { patientId: demande.patientId, acteurAutoriseId: professionnelUserId, typeAcces, dateFin, statut: "actif" },
    update: { typeAcces, dateFin, statut: "actif" },
  });

  await journaliser(
    {
      utilisateurId: professionnelUserId,
      action: voie === "code" ? "acces_dossier_code_reussi" : "acces_dossier_confirme_par_patient",
      donneeConcernee: `patient:${demande.patientId}`,
      adresseTechnique,
      justification: `Acces "${typeAcces}" accorde (${voie === "code" ? "code de confirmation" : "confirmation dans l'espace patient"}, mode ${demande.modeRecherche}, motif ${demande.motif}), jusqu'au ${dateFin ? dateFin.toISOString() : "retrait par le patient"}.`,
    },
    tx
  );

  return { typeAcces, dateFin };
}
