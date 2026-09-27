"use server";

/**
 * Demandes de rendez-vous a traiter par l'accueil (F-RDV-03 du pack :
 * "Liste des rendez-vous REQUESTED tries par date de rendez-vous. Pour chacun :
 * patient (nom, age), service, date, motif simple, nombre d'absences
 * recentes"). Role RECEPTIONIST absent de ce depot : route vers
 * admin_etablissement, comme la file du jour et le guichet.
 *
 * L'accueil ne voit jamais de donnee clinique (RG-RDV-32) : nom, age, date,
 * motif de rendez-vous et compteur d'absences seulement. Les decisions
 * (confirmer, refuser avec motif) passent par confirmerRendezVousAction et
 * refuserRendezVousAction (actions.ts), qui reverifient l'etablissement.
 */

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ageAnnees } from "@/modules/clinical/controles-constantes";
import { dateExpirationDemande } from "./regles-rendez-vous";

export interface DemandeRendezVousAccueil {
  id: string;
  date: string; // ISO
  dateCreation: string; // ISO
  /** Instant d'expiration (RG-RDV-20), ISO. */
  expireLe: string;
  motif: string;
  patientNomComplet: string;
  patientAge: number;
  professionnelNomComplet: string | null;
  /** Absences (statut "absent") du patient sur les 90 derniers jours, tous etablissements (RG-RDV-05). */
  absencesRecentes: number;
}

const JOURS_ABSENCES_RECENTES = 90;

/** Demandes en attente de l'etablissement de l'administrateur connecte, ou null si l'appelant n'est pas un accueil. */
export async function getDemandesRendezVousAccueil(): Promise<DemandeRendezVousAccueil[] | null> {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_etablissement")) {
    return null;
  }

  const professionnel = await prisma.professionnelSante.findUnique({ where: { userId: session.userId } });

  if (!professionnel) {
    return null;
  }

  const maintenant = new Date();

  const demandes = await prisma.rendezVous.findMany({
    where: { etablissementId: professionnel.etablissementId, statut: "demande", date: { gt: maintenant } },
    include: {
      patient: { include: { user: { select: { nom: true, prenom: true } } } },
      professionnel: { include: { user: { select: { nom: true, prenom: true } } } },
    },
    orderBy: { date: "asc" },
  });

  const idsPatients = [...new Set(demandes.map((demande) => demande.patientId))];
  const absences =
    idsPatients.length === 0
      ? []
      : await prisma.rendezVous.groupBy({
          by: ["patientId"],
          where: {
            patientId: { in: idsPatients },
            statut: "absent",
            date: { gte: new Date(maintenant.getTime() - JOURS_ABSENCES_RECENTES * 24 * 60 * 60 * 1000) },
          },
          _count: { _all: true },
        });
  const absencesParPatient = new Map(absences.map((ligne) => [ligne.patientId, ligne._count._all]));

  return demandes.map((demande) => ({
    id: demande.id,
    date: demande.date.toISOString(),
    dateCreation: demande.dateCreation.toISOString(),
    expireLe: dateExpirationDemande(demande.dateCreation, demande.date).toISOString(),
    motif: demande.motif,
    patientNomComplet: `${demande.patient.user.prenom} ${demande.patient.user.nom}`,
    patientAge: ageAnnees(demande.patient.dateNaissance, maintenant),
    professionnelNomComplet: demande.professionnel
      ? `Dr. ${demande.professionnel.user.prenom} ${demande.professionnel.user.nom}`
      : null,
    absencesRecentes: absencesParPatient.get(demande.patientId) ?? 0,
  }));
}
