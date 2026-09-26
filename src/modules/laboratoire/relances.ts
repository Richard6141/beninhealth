import { prisma } from "@/lib/prisma";
import { creerNotification } from "@/modules/notification/creer";

/**
 * Relances planifiees du laboratoire (F-LAB-05 du pack), en process comme la
 * purge des notifications (src/modules/notification/purge.ts) :
 *
 * - RG-LAB-21 / N-LAB-CRITICAL-ESCALATION : une notification de resultat
 *   critique restee non lue plus de 2 h est escaladee aux responsables
 *   d'etablissement du prescripteur.
 * - N-LAB-ANNOUNCE-OVERDUE : le resultat VALIDE d'un examen sensible qui n'a
 *   pas ete annonce au patient sous 30 jours declenche un rappel au
 *   prescripteur. Le pack cite aussi l'auditeur : ce role n'existe pas dans ce
 *   depot, seul le prescripteur est prevenu.
 *
 * Module pur (pas de "use server") : aucune de ces fonctions n'est un point
 * d'entree. Chaque relance est reclamee par une mise a jour conditionnelle
 * (jamais deux fois, meme avec deux instances). Aucun message ne nomme un
 * patient, un examen ou une valeur.
 */

const DELAI_ESCALADE_MS = 2 * 60 * 60 * 1000;
const JOURS_AVANT_RAPPEL_ANNONCE = 30;
const INTERVALLE_VERIFICATION_MS = 15 * 60 * 1000;

declare global {
  var __relancesLaboratoireDemarrees: boolean | undefined;
}

/** Escalade les notifications de resultat critique non lues depuis plus de 2 h. Retourne le nombre escalade. */
export async function escaladerResultatsCritiquesNonLus(maintenant: Date = new Date()): Promise<number> {
  const echues = await prisma.notification.findMany({
    where: {
      type: "resultat_examen_critique",
      lu: false,
      escaladeLe: null,
      date: { lte: new Date(maintenant.getTime() - DELAI_ESCALADE_MS) },
    },
    select: { id: true, utilisateurId: true },
  });

  let escalades = 0;
  for (const notification of echues) {
    const prescripteur = await prisma.professionnelSante.findUnique({
      where: { userId: notification.utilisateurId },
      select: { etablissementId: true },
    });
    if (!prescripteur) continue;

    const responsables = await prisma.professionnelSante.findMany({
      where: {
        etablissementId: prescripteur.etablissementId,
        user: { roles: { some: { nom: "admin_etablissement" } } },
      },
      select: { userId: true },
    });
    // Sans responsable, on ne reclame pas : la relance repart au prochain tour.
    if (responsables.length === 0) continue;

    const reclamation = await prisma.notification.updateMany({
      where: { id: notification.id, lu: false, escaladeLe: null },
      data: { escaladeLe: maintenant },
    });
    if (reclamation.count !== 1) continue;

    await Promise.all(
      responsables.map((responsable) =>
        creerNotification(
          responsable.userId,
          "resultat_critique_escalade",
          "Un resultat critique transmis a un prescripteur de votre etablissement n'a pas ete lu depuis plus de 2 heures.",
          "/app/etablissement",
          { codeCatalogue: "N-LAB-CRITICAL-ESCALATION" }
        )
      )
    );
    escalades += 1;
  }

  return escalades;
}

/** Rappelle au prescripteur les resultats sensibles valides depuis plus de 30 jours et non annonces. Retourne le nombre de rappels. */
export async function relancerAnnoncesEnRetard(maintenant: Date = new Date()): Promise<number> {
  const seuil = new Date(maintenant.getTime() - JOURS_AVANT_RAPPEL_ANNONCE * 24 * 60 * 60 * 1000);

  const enRetard = await prisma.examenMedical.findMany({
    where: {
      sensible: true,
      statut: "termine",
      resultatAnnonceAuPatient: false,
      relanceAnnonceLe: null,
      dateValidation: { lte: seuil },
    },
    select: { id: true, demandeur: { select: { userId: true } } },
  });

  let rappels = 0;
  for (const examen of enRetard) {
    const reclamation = await prisma.examenMedical.updateMany({
      where: { id: examen.id, statut: "termine", resultatAnnonceAuPatient: false, relanceAnnonceLe: null },
      data: { relanceAnnonceLe: maintenant },
    });
    if (reclamation.count !== 1) continue;

    await creerNotification(
      examen.demandeur.userId,
      "resultat_annonce_en_retard",
      "Un resultat sensible valide depuis plus de 30 jours n'a pas encore ete annonce a votre patient.",
      "/app/medecin/examens",
      { codeCatalogue: "N-LAB-ANNOUNCE-OVERDUE" }
    );
    rappels += 1;
  }

  return rappels;
}

async function executerRelancesAvecJournal(): Promise<void> {
  try {
    const escalades = await escaladerResultatsCritiquesNonLus();
    const rappels = await relancerAnnoncesEnRetard();
    if (escalades > 0 || rappels > 0) {
      console.log(`[laboratoire] relances : ${escalades} escalade(s) de resultat critique, ${rappels} rappel(s) d'annonce`);
    }
  } catch (erreur) {
    console.error("[laboratoire] echec des relances planifiees", erreur);
  }
}

/** Demarre les relances planifiees. Idempotent (drapeau global), comme demarrerPurgeNotifications. */
export function demarrerRelancesLaboratoire(): void {
  if (globalThis.__relancesLaboratoireDemarrees) {
    return;
  }
  globalThis.__relancesLaboratoireDemarrees = true;

  setInterval(() => {
    void executerRelancesAvecJournal();
  }, INTERVALLE_VERIFICATION_MS);

  console.log("[laboratoire] relances planifiees demarrees (toutes les 15 minutes)");
}
