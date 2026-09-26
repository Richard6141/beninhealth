"use server";

/**
 * Server Actions du module reference : references de patients vers un autre
 * etablissement (F-CLI-14 du pack, "non developpe dans le MVP" a l'origine,
 * implemente ici a la demande explicite de l'utilisateur).
 *
 * Meme principe Zero Trust que les autres modules : le medecin referent est
 * toujours derive de getSession(), jamais d'un id transmis par le client. La
 * creation exige que la consultation d'origine appartienne bien au
 * professionnel connecte (verifie en base, jamais suppose).
 *
 * Version implementee, volontairement plus etroite que la fiche complete du
 * pack :
 * - Pas de parcours QR/jeton separe (RG-PRE-40 a 42 du pack, deja hors
 *   perimetre ailleurs dans ce depot, voir F-PHA-02).
 * - "Etablissement de niveau superieur dans la pyramide" est approxime par
 *   "etablissement de type hopital" : ce depot n'a pas de champ de niveau
 *   pyramidal sur EtablissementSanitaire (voir docs/audit-cote-medecin.md).
 * - La base d'acces temporaire de 30 jours (dateFinAcces) est portee par la
 *   ligne ReferencePatient elle-meme plutot que par une table ASSIGNMENT
 *   separee du pack : plus simple, meme effet, verifiee dans
 *   src/modules/clinical/actions.ts (accesPatientAutorise). Volontairement
 *   limitee a la lecture (resume, historique) : une reference ne donne
 *   jamais le droit de creer une nouvelle Consultation pour ce patient (voir
 *   le commentaire d'accesPatientAutorise), qui reste soumise a un
 *   Consentement explicite du patient, comme l'acces d'urgence.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { creerNotification } from "@/modules/notification/creer";

const DUREE_ACCES_REFERENCE_JOURS = 30;

const NIVEAUX_URGENCE = ["urgente", "programmee"] as const;
export type NiveauUrgenceReference = (typeof NIVEAUX_URGENCE)[number];

const LONGUEUR_MIN_RESUME_CLINIQUE = 20;

/** Etat renvoye par creerReferenceAction, consomme via useActionState. */
export interface ReferenceActionState {
  error: string | null;
  success: boolean;
  referenceId?: string;
}

/** Etablissement proposable comme destination d'une reference. */
export interface EtablissementDestinationOption {
  id: string;
  nom: string;
  localisation: string;
}

/** Resume d'une reference, pret a afficher dans une liste (envoyees ou recues). */
export interface ReferenceResume {
  id: string;
  patientNomComplet: string;
  patientIdentifiantSante: string;
  medecinReferentNomComplet: string;
  etablissementOrigineNom: string;
  etablissementDestinationNom: string;
  motif: string;
  niveauUrgence: NiveauUrgenceReference;
  statut: "ouverte" | "cloturee";
  dateCreation: string; // ISO
  dateFinAcces: string; // ISO
}

/** Detail complet d'une reference, pour l'ecran de consultation/reponse. */
export interface ReferenceDetail extends ReferenceResume {
  resumeClinique: string;
  consultationMotif: string;
  patientAge: number;
  patientSexe: string;
  patientAllergies: string[];
  // true si le professionnel connecte peut rediger la contre-reference
  // (medecin de l'etablissement destinataire, reference encore ouverte).
  peutRepondre: boolean;
  contreReferenceTexte: string | null;
  contreReferenceAuteurNomComplet: string | null;
  dateContreReference: string | null;
}

function nomComplet(utilisateur: { nom: string; prenom: string }): string {
  return `${utilisateur.prenom} ${utilisateur.nom}`;
}

function nomCompletProfessionnel(utilisateur: { nom: string; prenom: string }): string {
  return `Dr. ${utilisateur.prenom} ${utilisateur.nom}`;
}

function ageAnnees(dateNaissance: Date, dateReference: Date): number {
  let age = dateReference.getFullYear() - dateNaissance.getFullYear();
  const anniversairePasse =
    dateReference.getMonth() > dateNaissance.getMonth() ||
    (dateReference.getMonth() === dateNaissance.getMonth() && dateReference.getDate() >= dateNaissance.getDate());
  if (!anniversairePasse) age -= 1;
  return age;
}

function parseListeJSON(valeur: string): string[] {
  try {
    const donnees: unknown = JSON.parse(valeur);
    return Array.isArray(donnees) ? donnees.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
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

/** Lit un champ texte d'un FormData, jamais null (chaine vide si absent). */
function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/** Recupere le profil ProfessionnelSante du titulaire de la session courante, ou null si absent. */
async function professionnelDeLaSessionCourante() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  return prisma.professionnelSante.findUnique({ where: { userId: session.userId } });
}

/**
 * Etablissements de type "hopital" pouvant recevoir une reference,
 * l'etablissement d'origine du professionnel connecte exclu (on ne se
 * refere pas a soi-meme).
 */
export async function listEtablissementsDestinationReference(): Promise<EtablissementDestinationOption[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  const etablissements = await prisma.etablissementSanitaire.findMany({
    where: {
      type: "hopital",
      ...(professionnel ? { id: { not: professionnel.etablissementId } } : {}),
    },
    orderBy: { nom: "asc" },
  });

  return etablissements.map((etablissement) => ({
    id: etablissement.id,
    nom: etablissement.nom,
    localisation: etablissement.localisation,
  }));
}

/**
 * Resout le patient et le motif d'une consultation pour pre-remplir l'ecran
 * "Creer une reference" quand on y arrive depuis le lien d'une consultation
 * (Zero Trust : verifie que la consultation appartient bien au professionnel
 * connecte, jamais suppose valide).
 */
export async function getConsultationPourReference(
  consultationId: string
): Promise<{ patientId: string; patientNomComplet: string; motif: string } | null> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return null;
  }

  const identifiantNettoye = consultationId.trim();

  if (identifiantNettoye.length === 0) {
    return null;
  }

  const consultation = await prisma.consultation.findUnique({
    where: { id: identifiantNettoye },
    include: { patient: { include: { user: true } } },
  });

  if (!consultation || consultation.professionnelId !== professionnel.id) {
    return null;
  }

  return {
    patientId: consultation.patientId,
    patientNomComplet: nomComplet(consultation.patient.user),
    motif: consultation.motif,
  };
}

const schemaCreationReference = z.object({
  consultationId: z.string().trim().min(1, "La consultation est obligatoire."),
  etablissementDestinationId: z.string().trim().min(1, "L'etablissement de destination est obligatoire."),
  niveauUrgence: z.enum(NIVEAUX_URGENCE, { message: "Le niveau d'urgence est invalide." }),
  motif: z.string().trim().min(1, "Le motif est obligatoire."),
  resumeClinique: z
    .string()
    .trim()
    .min(
      LONGUEUR_MIN_RESUME_CLINIQUE,
      `Le resume clinique doit comporter au moins ${LONGUEUR_MIN_RESUME_CLINIQUE} caracteres.`
    ),
});

/**
 * Cree une reference vers un autre etablissement (F-CLI-14), a l'initiative
 * du medecin referent, rattachee a une consultation dont il est bien
 * l'auteur (Zero Trust). Ouvre une base d'acces temporaire de 30 jours pour
 * l'etablissement destinataire (voir dateFinAcces) et notifie chaque medecin
 * de cet etablissement.
 */
export async function creerReferenceAction(
  prevState: ReferenceActionState,
  formData: FormData
): Promise<ReferenceActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "reference_patient"))) {
    return { error: "Action reservee aux medecins.", success: false };
  }

  const validation = schemaCreationReference.safeParse({
    consultationId: texte(formData, "consultationId"),
    etablissementDestinationId: texte(formData, "etablissementDestinationId"),
    niveauUrgence: texte(formData, "niveauUrgence"),
    motif: texte(formData, "motif"),
    resumeClinique: texte(formData, "resumeClinique"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de reference invalides."),
      success: false,
    };
  }

  const { consultationId, etablissementDestinationId, niveauUrgence, motif, resumeClinique } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation || consultation.professionnelId !== professionnel.id) {
      return { error: "Cette consultation est introuvable.", success: false };
    }

    if (etablissementDestinationId === professionnel.etablissementId) {
      return {
        error: "L'etablissement de destination doit etre different de votre etablissement.",
        success: false,
      };
    }

    const etablissementDestination = await prisma.etablissementSanitaire.findUnique({
      where: { id: etablissementDestinationId },
    });

    if (!etablissementDestination) {
      return { error: "Etablissement de destination introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const dateCreation = new Date();
    const dateFinAcces = new Date(dateCreation.getTime() + DUREE_ACCES_REFERENCE_JOURS * 24 * 60 * 60 * 1000);

    const reference = await prisma.$transaction(async (tx) => {
      const referenceCreee = await tx.referencePatient.create({
        data: {
          patientId: consultation.patientId,
          consultationId: consultation.id,
          medecinReferentId: professionnel.id,
          etablissementOrigineId: professionnel.etablissementId,
          etablissementDestinationId,
          motif,
          niveauUrgence,
          resumeClinique,
          dateCreation,
          dateFinAcces,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_reference_patient",
          donneeConcernee: `reference_patient:${referenceCreee.id}`,
          adresseTechnique,
          justification: `Reference creee vers l'etablissement ${etablissementDestination.nom} pour le patient ${consultation.patientId} (${niveauUrgence}) : ${motif}`,
        },
        tx
      );

      return referenceCreee;
    });

    const medecinsDestination = await prisma.professionnelSante.findMany({
      where: {
        etablissementId: etablissementDestinationId,
        user: { roles: { some: { nom: "medecin" } } },
      },
      select: { userId: true },
    });

    await Promise.all(
      medecinsDestination.map((medecin) =>
        creerNotification(
          medecin.userId,
          "reference_patient_recue",
          niveauUrgence === "urgente"
            ? "Une référence urgente a été adressée à votre établissement."
            : "Une référence a été adressée à votre établissement.",
          "/app/medecin/references"
        )
      )
    );

    return { error: null, success: true, referenceId: reference.id };
  } catch (erreur) {
    console.error("Erreur lors de la creation de la reference :", erreur);
    return {
      error: "Une erreur est survenue lors de la creation de la reference. Veuillez reessayer.",
      success: false,
    };
  }
}

function versReferenceResume(reference: {
  id: string;
  patient: { identifiantSante: string; user: { nom: string; prenom: string } };
  medecinReferent: { user: { nom: string; prenom: string } };
  etablissementOrigine: { nom: string };
  etablissementDestination: { nom: string };
  motif: string;
  niveauUrgence: string;
  statut: string;
  dateCreation: Date;
  dateFinAcces: Date;
}): ReferenceResume {
  return {
    id: reference.id,
    patientNomComplet: nomComplet(reference.patient.user),
    patientIdentifiantSante: reference.patient.identifiantSante,
    medecinReferentNomComplet: nomCompletProfessionnel(reference.medecinReferent.user),
    etablissementOrigineNom: reference.etablissementOrigine.nom,
    etablissementDestinationNom: reference.etablissementDestination.nom,
    motif: reference.motif,
    niveauUrgence: reference.niveauUrgence as NiveauUrgenceReference,
    statut: reference.statut as "ouverte" | "cloturee",
    dateCreation: reference.dateCreation.toISOString(),
    dateFinAcces: reference.dateFinAcces.toISOString(),
  };
}

const INCLUDE_RESUME_REFERENCE = {
  patient: { include: { user: true } },
  medecinReferent: { include: { user: true } },
  etablissementOrigine: true,
  etablissementDestination: true,
} as const;

/** References envoyees par le medecin connecte, les plus recentes en premier. */
export async function getReferencesEnvoyees(): Promise<ReferenceResume[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const references = await prisma.referencePatient.findMany({
    where: { medecinReferentId: professionnel.id },
    include: INCLUDE_RESUME_REFERENCE,
    orderBy: { dateCreation: "desc" },
  });

  return references.map(versReferenceResume);
}

/**
 * References adressees a l'etablissement du medecin connecte : n'importe
 * quel medecin de cet etablissement peut les voir et y repondre, le
 * destinataire precis n'etant jamais connu a l'avance (meme principe que
 * getPrescriptionsADelivrer pour un pharmacien).
 */
export async function getReferencesRecues(): Promise<ReferenceResume[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const references = await prisma.referencePatient.findMany({
    where: { etablissementDestinationId: professionnel.etablissementId },
    include: INCLUDE_RESUME_REFERENCE,
    orderBy: { dateCreation: "desc" },
  });

  return references.map(versReferenceResume);
}

/**
 * Detail d'une reference (F-CLI-14), accessible au medecin referent ou a
 * tout medecin de l'etablissement destinataire (Zero Trust : jamais a un
 * tiers). RG-CLI-14x du pack ("jamais le diagnostic ni les autres
 * ordonnances du patient") : ce detail expose uniquement le motif et le
 * resume clinique ecrits par le referent pour cette reference precise,
 * jamais le contenu de la consultation d'origine.
 */
export async function getDetailReference(referenceId: string): Promise<ReferenceDetail | null> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return null;
  }

  const identifiantNettoye = referenceId.trim();

  if (identifiantNettoye.length === 0) {
    return null;
  }

  const reference = await prisma.referencePatient.findUnique({
    where: { id: identifiantNettoye },
    include: {
      ...INCLUDE_RESUME_REFERENCE,
      consultation: true,
      contreReferenceAuteur: { include: { user: true } },
    },
  });

  if (!reference) {
    return null;
  }

  const estReferent = reference.medecinReferentId === professionnel.id;
  const estEtablissementDestinataire = reference.etablissementDestinationId === professionnel.etablissementId;

  if (!estReferent && !estEtablissementDestinataire) {
    return null;
  }

  return {
    ...versReferenceResume(reference),
    resumeClinique: reference.resumeClinique,
    consultationMotif: reference.consultation.motif,
    patientAge: ageAnnees(reference.patient.dateNaissance, new Date()),
    patientSexe: reference.patient.sexe,
    patientAllergies: parseListeJSON(reference.patient.allergies),
    peutRepondre: estEtablissementDestinataire && reference.statut === "ouverte",
    contreReferenceTexte: reference.contreReferenceTexte,
    contreReferenceAuteurNomComplet: reference.contreReferenceAuteur
      ? nomCompletProfessionnel(reference.contreReferenceAuteur.user)
      : null,
    dateContreReference: reference.dateContreReference?.toISOString() ?? null,
  };
}

const schemaContreReference = z.object({
  referenceId: z.string().trim().min(1, "La reference est obligatoire."),
  contreReferenceTexte: z
    .string()
    .trim()
    .min(LONGUEUR_MIN_RESUME_CLINIQUE, `La contre-reference doit comporter au moins ${LONGUEUR_MIN_RESUME_CLINIQUE} caracteres.`),
});

/**
 * Enregistre la contre-reference (compte-rendu du specialiste) et cloture la
 * reference, reserve a un medecin de l'etablissement destinataire tant
 * qu'elle est encore ouverte (une reference deja cloturee ne peut pas etre
 * re-repondue). Notifie le medecin referent d'origine.
 */
export async function enregistrerContreReferenceAction(
  prevState: ReferenceActionState,
  formData: FormData
): Promise<ReferenceActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "update", "reference_patient"))) {
    return { error: "Action reservee aux medecins.", success: false };
  }

  const validation = schemaContreReference.safeParse({
    referenceId: texte(formData, "referenceId"),
    contreReferenceTexte: texte(formData, "contreReferenceTexte"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Contre-reference invalide."),
      success: false,
    };
  }

  const { referenceId, contreReferenceTexte } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const reference = await prisma.referencePatient.findUnique({
      where: { id: referenceId },
      include: { medecinReferent: true },
    });

    if (!reference || reference.etablissementDestinationId !== professionnel.etablissementId) {
      return { error: "Cette reference est introuvable.", success: false };
    }

    if (reference.statut !== "ouverte") {
      return { error: "Cette reference a deja ete cloturee.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const dateContreReference = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.referencePatient.update({
        where: { id: referenceId },
        data: {
          contreReferenceTexte,
          contreReferenceAuteurId: professionnel.id,
          dateContreReference,
          statut: "cloturee",
          dateCloture: dateContreReference,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "contre_reference_patient",
          donneeConcernee: `reference_patient:${referenceId}`,
          adresseTechnique,
          justification: "Contre-reference redigee, reference cloturee.",
        },
        tx
      );
    });

    await creerNotification(
      reference.medecinReferent.userId,
      "contre_reference_recue",
      "Une contre-référence a été rédigée pour un patient que vous avez référé.",
      `/app/medecin/references/${referenceId}`
    );

    return { error: null, success: true, referenceId };
  } catch (erreur) {
    console.error("Erreur lors de l'enregistrement de la contre-reference :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}
