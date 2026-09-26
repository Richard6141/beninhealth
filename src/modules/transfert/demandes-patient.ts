"use server";

/**
 * Cote patient de l'acces par NPI ou telephone : voir les demandes en attente
 * et les autoriser ou les refuser depuis son espace, sans dicter aucun code.
 * Meilleure voie pour un patient qui utilise l'application : la confirmation
 * porte sur une demande lisible (qui, quel etablissement, pour quoi, combien
 * de temps) et ne se transmet pas a un tiers, contrairement a un code (le
 * Kenya a supprime son OTP en aout 2025 parce que des codes etaient partages).
 * Le code par WhatsApp ou SMS reste la voie des patients sans smartphone.
 */

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { can } from "@/security/permissions";
import { MOTIFS_ACCES, estMotifAcces, libelleDuree } from "./code-acces";
import { accorderAcces } from "./octroi";

export interface DemandeAccesRecue {
  id: string;
  demandeurNomComplet: string;
  titre: string;
  etablissementNom: string;
  motif: string;
  duree: string;
  dateCreation: string; // ISO
  expireLe: string; // ISO
}

export interface ReponseDemandeAccesState {
  error: string | null;
  success: boolean;
  decision?: "accepter" | "refuser";
}

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

async function patientDeLaSession() {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "demande_acces_recue"))) {
    return null;
  }

  const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });
  return patient ? { session, patient } : null;
}

/** Demandes d'acces en attente et non expirees pour le patient connecte. */
export async function getDemandesAccesRecues(): Promise<DemandeAccesRecue[]> {
  const contexte = await patientDeLaSession();

  if (!contexte) {
    return [];
  }

  const demandes = await prisma.demandeAccesDossier.findMany({
    where: { patientId: contexte.patient.id, statut: "en_attente", expireLe: { gt: new Date() } },
    include: { demandeur: { include: { roles: true } }, etablissement: true },
    orderBy: { dateCreation: "desc" },
  });

  return demandes.map((demande) => ({
    id: demande.id,
    demandeurNomComplet: `${demande.demandeur.prenom} ${demande.demandeur.nom}`,
    titre: demande.demandeur.roles.some((role) => role.nom === "medecin") ? "Médecin" : "Infirmier(ère)",
    etablissementNom: demande.etablissement.nom,
    motif: estMotifAcces(demande.motif) ? MOTIFS_ACCES[demande.motif] : demande.motif,
    duree: libelleDuree(demande.dureeAccesHeures),
    dateCreation: demande.dateCreation.toISOString(),
    expireLe: demande.expireLe.toISOString(),
  }));
}

/** Autorise ou refuse une demande d'acces recue. Seul son destinataire peut y repondre. */
export async function repondreDemandeAccesAction(
  _prevState: ReponseDemandeAccesState,
  formData: FormData
): Promise<ReponseDemandeAccesState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expirée. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "update", "demande_acces_recue"))) {
    return { error: "Action réservée aux patients.", success: false };
  }

  const demandeId = String(formData.get("demandeId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  const indisponible: ReponseDemandeAccesState = { error: "Cette demande n'est plus valable.", success: false };

  if (demandeId.length === 0 || (decision !== "accepter" && decision !== "refuser")) {
    return indisponible;
  }

  try {
    const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

    if (!patient) {
      return { error: "Aucun dossier patient associé à ce compte.", success: false };
    }

    const demande = await prisma.demandeAccesDossier.findFirst({
      where: { id: demandeId, patientId: patient.id, statut: "en_attente", expireLe: { gt: new Date() } },
    });

    if (!demande) {
      return indisponible;
    }

    const adresseTechnique = await adresseTechniqueCourante();

    if (decision === "refuser") {
      const refus = await prisma.demandeAccesDossier.updateMany({
        where: { id: demande.id, statut: "en_attente" },
        data: { statut: "refusee" },
      });

      if (refus.count === 0) {
        return indisponible;
      }

      await journaliser({
        utilisateurId: session.userId,
        action: "acces_dossier_refuse",
        donneeConcernee: `demande_acces:${demande.id}`,
        adresseTechnique,
        justification: `Demande d'acces refusee par le patient (motif ${demande.motif}, ${libelleDuree(demande.dureeAccesHeures)}).`,
      });

      return { error: null, success: true, decision: "refuser" };
    }

    const accorde = await prisma.$transaction((tx) =>
      accorderAcces(tx, {
        demande: { ...demande, patientId: patient.id },
        professionnelUserId: demande.demandeurId,
        adresseTechnique,
        voie: "application",
      })
    );

    if (!accorde) {
      return indisponible;
    }

    return { error: null, success: true, decision: "accepter" };
  } catch (erreur) {
    console.error("Erreur lors de la reponse a une demande d'acces :", erreur instanceof Error ? erreur.name : "erreur");
    return { error: "Une erreur est survenue. Veuillez réessayer.", success: false };
  }
}
