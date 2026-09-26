"use server";

/**
 * Fusion de dossiers patient en doublon (F-ADM-06 du pack). Reserve a
 * admin_national : un doublon peut avoir ete cree dans deux etablissements
 * differents (creerPatientParProfessionnelAction ne detecte que les doublons
 * DANS le meme etablissement au moment de la creation, voir
 * src/modules/identity/actions.ts), donc la resolution a posteriori doit
 * rester une vue plateforme, jamais visible d'un seul admin_etablissement
 * (RG-CLI-3b : jamais le dossier complet d'un patient hors de son propre
 * perimetre pour un role qui n'y a pas normalement acces).
 *
 * Principe non negociable : une fusion ne supprime JAMAIS de donnee.
 * Toutes les ressources rattachees au dossier doublon (consultations,
 * prescriptions, examens, rendez-vous, vaccinations, documents, prises en
 * charge infirmieres, references, consentements) sont reassignees au dossier
 * conserve, dans une seule transaction. Le compte User du doublon passe au
 * statut "fusionne" (jamais supprime, meme principe que "sans_compte" et
 * "ferme" ailleurs dans ce depot) : plus jamais utilisable pour se connecter,
 * mais entierement tracable. Le detail exact de ce qui a ete deplace (nombre
 * de lignes par table) est journalise en clair dans JournalAudit, pour
 * pouvoir reconstituer une fusion a tout moment si necessaire.
 */

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";

const LONGUEUR_MIN_JUSTIFICATION_FUSION = 20;
const ROUNDS_BCRYPT = 12;

/** Identite minimale d'un cote d'un candidat doublon, jamais le dossier complet. */
export interface CoteDoublon {
  patientId: string;
  nomComplet: string;
  identifiantSante: string;
  dateNaissance: string; // ISO
  sexe: string;
  dateCreationCompte: string; // ISO
  nombreConsultations: number;
  nombrePrescriptions: number;
  nombreRendezVous: number;
}

/** Paire de dossiers patient candidate a une fusion (memes nom/prenom/date de naissance normalises). */
export interface CandidatDoublon {
  a: CoteDoublon;
  b: CoteDoublon;
}

function normaliserPourComparaison(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function nomComplet(utilisateur: { nom: string; prenom: string }): string {
  return `${utilisateur.prenom} ${utilisateur.nom}`;
}

async function estAdminNationalConnecte(): Promise<boolean> {
  const session = await getSession();
  return session !== null && session.roles.some((role) => can(role, "read", "doublon_patient"));
}

/**
 * Detecte les paires de dossiers patient dont nom, prenom et date de
 * naissance normalises correspondent exactement (meme regle que le doublon
 * detecte a la creation, voir normaliserPourComparaison dans
 * src/modules/identity/actions.ts), en excluant tout dossier deja fusionne.
 * Cout en O(n) sur le nombre de patients : suffisant pour le volume de ce
 * MVP, a revisiter avec un index dedie si le nombre de patients grandit
 * beaucoup (voir aussi le meme choix assume dans calculerRepartitionParEtablissement,
 * src/modules/analytics/actions.ts).
 */
export async function detecterDoublonsPatients(): Promise<CandidatDoublon[]> {
  if (!(await estAdminNationalConnecte())) {
    return [];
  }

  const patients = await prisma.patient.findMany({
    where: { user: { statut: { not: "fusionne" } } },
    include: {
      user: true,
      _count: {
        select: { consultations: true, prescriptions: true, rendezVous: true },
      },
    },
    orderBy: { user: { dateCreation: "asc" } },
  });

  const groupes = new Map<string, typeof patients>();

  for (const patient of patients) {
    const cle = [
      normaliserPourComparaison(patient.user.nom),
      normaliserPourComparaison(patient.user.prenom),
      patient.dateNaissance.toISOString().slice(0, 10),
    ].join("|");

    const groupe = groupes.get(cle) ?? [];
    groupe.push(patient);
    groupes.set(cle, groupe);
  }

  const candidats: CandidatDoublon[] = [];

  for (const groupe of groupes.values()) {
    if (groupe.length < 2) continue;

    // Plus de deux dossiers identiques : signale chaque paire successive
    // (0-1, 1-2, ...) plutot que toutes les combinaisons, pour ne pas noyer
    // l'ecran d'un cas rare avec un nombre de paires qui explose.
    for (let i = 0; i < groupe.length - 1; i += 1) {
      const a = groupe[i];
      const b = groupe[i + 1];

      candidats.push({
        a: {
          patientId: a.id,
          nomComplet: nomComplet(a.user),
          identifiantSante: a.identifiantSante,
          dateNaissance: a.dateNaissance.toISOString(),
          sexe: a.sexe,
          dateCreationCompte: a.user.dateCreation.toISOString(),
          nombreConsultations: a._count.consultations,
          nombrePrescriptions: a._count.prescriptions,
          nombreRendezVous: a._count.rendezVous,
        },
        b: {
          patientId: b.id,
          nomComplet: nomComplet(b.user),
          identifiantSante: b.identifiantSante,
          dateNaissance: b.dateNaissance.toISOString(),
          sexe: b.sexe,
          dateCreationCompte: b.user.dateCreation.toISOString(),
          nombreConsultations: b._count.consultations,
          nombrePrescriptions: b._count.prescriptions,
          nombreRendezVous: b._count.rendezVous,
        },
      });
    }
  }

  return candidats;
}

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    const adresse = listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? null;
    return adresse ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/** Etat renvoye par fusionnerPatientsAction, consomme via useActionState. */
export interface FusionActionState {
  error: string | null;
  success: boolean;
}

const schemaFusion = z.object({
  patientConserveId: z.string().trim().min(1, "Le dossier a conserver est obligatoire."),
  patientDoublonId: z.string().trim().min(1, "Le dossier doublon est obligatoire."),
  justification: z
    .string()
    .trim()
    .min(
      LONGUEUR_MIN_JUSTIFICATION_FUSION,
      `La justification doit comporter au moins ${LONGUEUR_MIN_JUSTIFICATION_FUSION} caracteres.`
    ),
});

/**
 * Fusionne deux dossiers patient : reassigne dans une seule transaction
 * toutes les ressources du dossier doublon vers le dossier conserve, puis
 * neutralise le compte du doublon (statut "fusionne", mot de passe
 * aleatoire jamais communique - meme technique que le compte "sans_compte"
 * de creerPatientParProfessionnelAction - identifiantSante et donnees
 * propres au dossier doublon jamais modifies ni supprimes). Journalise le
 * nombre exact de lignes deplacees par table.
 */
export async function fusionnerPatientsAction(
  prevState: FusionActionState,
  formData: FormData
): Promise<FusionActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "doublon_patient"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaFusion.safeParse({
    patientConserveId: formData.get("patientConserveId"),
    patientDoublonId: formData.get("patientDoublonId"),
    justification: formData.get("justification"),
  });

  if (!validation.success) {
    return { error: premierMessageErreur(validation.error, "Donnees de fusion invalides."), success: false };
  }

  const { patientConserveId, patientDoublonId, justification } = validation.data;

  if (patientConserveId === patientDoublonId) {
    return { error: "Les deux dossiers doivent etre differents.", success: false };
  }

  try {
    const [patientConserve, patientDoublon] = await Promise.all([
      prisma.patient.findUnique({ where: { id: patientConserveId }, include: { user: true } }),
      prisma.patient.findUnique({ where: { id: patientDoublonId }, include: { user: true } }),
    ]);

    if (!patientConserve || !patientDoublon) {
      return { error: "Un des deux dossiers est introuvable.", success: false };
    }

    if (patientDoublon.user.statut === "fusionne") {
      return { error: "Ce dossier a deja ete fusionne ailleurs.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const motDePasseAleatoire = randomUUID() + randomUUID();
    const motDePasseHash = await bcrypt.hash(motDePasseAleatoire, ROUNDS_BCRYPT);

    const compteurs = await prisma.$transaction(async (tx) => {
      const resultats = {
        consentements: (await tx.consentement.updateMany({ where: { patientId: patientDoublonId }, data: { patientId: patientConserveId } })).count,
        rendezVous: (await tx.rendezVous.updateMany({ where: { patientId: patientDoublonId }, data: { patientId: patientConserveId } })).count,
        consultations: (await tx.consultation.updateMany({ where: { patientId: patientDoublonId }, data: { patientId: patientConserveId } })).count,
        prescriptions: (await tx.prescription.updateMany({ where: { patientId: patientDoublonId }, data: { patientId: patientConserveId } })).count,
        examensMedicaux: (await tx.examenMedical.updateMany({ where: { patientId: patientDoublonId }, data: { patientId: patientConserveId } })).count,
        suivisCommunautaires: (await tx.suiviCommunautaire.updateMany({ where: { patientId: patientDoublonId }, data: { patientId: patientConserveId } })).count,
        vaccinations: (await tx.vaccination.updateMany({ where: { patientId: patientDoublonId }, data: { patientId: patientConserveId } })).count,
        documentsMedicaux: (await tx.documentMedical.updateMany({ where: { patientId: patientDoublonId }, data: { patientId: patientConserveId } })).count,
        prisesEnChargeInfirmieres: (await tx.priseEnChargeInfirmiere.updateMany({ where: { patientId: patientDoublonId }, data: { patientId: patientConserveId } })).count,
        references: (await tx.referencePatient.updateMany({ where: { patientId: patientDoublonId }, data: { patientId: patientConserveId } })).count,
      };

      await tx.user.update({
        where: { id: patientDoublon.userId },
        data: { statut: "fusionne", motDePasseHash },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "fusion_dossiers_patient",
          donneeConcernee: `patient:${patientConserveId}<-patient:${patientDoublonId}`,
          adresseTechnique,
          justification: `Fusion vers ${patientConserve.identifiantSante} depuis ${patientDoublon.identifiantSante} : ${justification}. Deplace : ${JSON.stringify(resultats)}.`,
        },
        tx
      );

      return resultats;
    });

    void compteurs;
    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la fusion de dossiers patient :", erreur);
    return { error: "Une erreur est survenue lors de la fusion. Veuillez reessayer.", success: false };
  }
}
