"use server";

/**
 * Server Actions du module prescription : ordonnances electroniques.
 * Contrat d'integration Phase 5, consomme par les ecrans
 * src/app/app/patient/** et src/app/app/medecin/** (autres agents).
 *
 * Meme principe applique de bout en bout que src/modules/clinical/actions.ts
 * et src/modules/patient/actions.ts : Zero Trust. Le patient ou le
 * professionnel courant est toujours derive de getSession(), jamais d'un id
 * transmis par le client dans un formulaire. Une prescription est toujours
 * rattachee a une Consultation deja existante, et cette consultation doit
 * appartenir au professionnel connecte (verifie en base avant toute
 * ecriture, jamais suppose). Toute creation de prescription est tracee a la
 * fois dans EvenementPrescription (historique metier du cycle de vie de la
 * prescription) et dans JournalAudit (trace transverse obligatoire).
 *
 * Perimetre de cette phase (voir README.md pour le detail) : le medecin cree
 * directement une prescription au statut "validee" (il vient d'examiner le
 * patient) ; il n'y a pas de flux de validation separee, et la delivrance en
 * pharmacie (statuts "delivree"/"delivree_partiellement") releve d'un module
 * pharmacie a construire plus tard.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface PrescriptionActionState {
  error: string | null;
  success: boolean;
}

/** Medicament du catalogue, tel que propose dans un selecteur de creation de prescription. */
export interface MedicamentOption {
  id: string;
  nom: string;
  principeActif: string;
  dosage: string;
  forme: string;
}

/** Detail d'une ligne de prescription, enrichi des informations du medicament. */
export interface LignePrescriptionDetail {
  medicamentId: string;
  medicamentNom: string;
  principeActif: string;
  dosage: string;
  forme: string;
  posologie: string;
  quantite: number;
  dureeTraitementJours: number;
}

/** Resume d'une prescription, pret a afficher cote ecran patient ou professionnel. */
export interface PrescriptionResume {
  id: string;
  date: string; // ISO
  statut: string;
  instructions: string;
  lignes: LignePrescriptionDetail[];
  medecinNomComplet: string | null; // rempli cote patient
  patientNomComplet: string | null; // rempli cote professionnel
  patientIdentifiantSante: string | null; // rempli cote professionnel
  consultationMotif: string;
}

/** Ligne soumise depuis le formulaire de creation, avant validation zod. */
const schemaLigneSoumise = z.object({
  medicamentId: z.string().trim().min(1, "Le medicament est obligatoire."),
  posologie: z.string().trim().min(1, "La posologie est obligatoire."),
  quantite: z.coerce
    .number({ message: "La quantite doit etre un nombre." })
    .int("La quantite doit etre un nombre entier.")
    .positive("La quantite doit etre strictement positive."),
  dureeTraitementJours: z.coerce
    .number({ message: "La duree de traitement doit etre un nombre." })
    .int("La duree de traitement doit etre un nombre entier.")
    .positive("La duree de traitement doit etre strictement positive."),
});

const schemaCreationPrescription = z.object({
  consultationId: z.string().trim().min(1, "La consultation est obligatoire."),
  instructions: z.string().trim().optional().default(""),
  lignes: z
    .array(schemaLigneSoumise)
    .min(1, "Au moins un medicament est obligatoire dans la prescription."),
});

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    const adresse =
      listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? null;
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

/** Nom complet d'un utilisateur, sans prefixe. */
function nomComplet(utilisateur: { nom: string; prenom: string }): string {
  return `${utilisateur.prenom} ${utilisateur.nom}`;
}

/** Nom complet d'un professionnel de sante, prefixe de "Dr." (meme convention que les autres modules). */
function nomCompletProfessionnel(utilisateur: { nom: string; prenom: string }): string {
  return `Dr. ${utilisateur.prenom} ${utilisateur.nom}`;
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/** Recupere le profil Patient du titulaire de la session courante, ou null si absent. */
async function patientDeLaSessionCourante() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  return prisma.patient.findUnique({ where: { userId: session.userId } });
}

/** Recupere le profil ProfessionnelSante du titulaire de la session courante, ou null si absent. */
async function professionnelDeLaSessionCourante() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  return prisma.professionnelSante.findUnique({ where: { userId: session.userId } });
}

/** Met en forme une prescription (avec ses lignes et medicaments) en PrescriptionResume. */
function versPrescriptionResume(
  prescription: {
    id: string;
    date: Date;
    statut: string;
    instructions: string;
    consultation: { motif: string };
    lignes: {
      medicamentId: string;
      posologie: string;
      quantite: number;
      dureeTraitementJours: number;
      medicament: { nom: string; principeActif: string; dosage: string; forme: string };
    }[];
  },
  options: {
    medecinNomComplet: string | null;
    patientNomComplet: string | null;
    patientIdentifiantSante: string | null;
  }
): PrescriptionResume {
  return {
    id: prescription.id,
    date: prescription.date.toISOString(),
    statut: prescription.statut,
    instructions: prescription.instructions,
    consultationMotif: prescription.consultation.motif,
    lignes: prescription.lignes.map((ligne) => ({
      medicamentId: ligne.medicamentId,
      medicamentNom: ligne.medicament.nom,
      principeActif: ligne.medicament.principeActif,
      dosage: ligne.medicament.dosage,
      forme: ligne.medicament.forme,
      posologie: ligne.posologie,
      quantite: ligne.quantite,
      dureeTraitementJours: ligne.dureeTraitementJours,
    })),
    medecinNomComplet: options.medecinNomComplet,
    patientNomComplet: options.patientNomComplet,
    patientIdentifiantSante: options.patientIdentifiantSante,
  };
}

/** Liste tout le catalogue de medicaments, trie par nom. */
export async function listMedicaments(): Promise<MedicamentOption[]> {
  const medicaments = await prisma.medicament.findMany({
    orderBy: { nom: "asc" },
  });

  return medicaments.map((medicament) => ({
    id: medicament.id,
    nom: medicament.nom,
    principeActif: medicament.principeActif,
    dosage: medicament.dosage,
    forme: medicament.forme,
  }));
}

/**
 * Recupere l'historique des prescriptions du patient connecte (derive de
 * getSession(), jamais d'id en parametre), du plus recent au plus ancien.
 */
export async function getMesPrescriptions(): Promise<PrescriptionResume[]> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return [];
  }

  const prescriptions = await prisma.prescription.findMany({
    where: { patientId: patient.id },
    include: {
      consultation: true,
      medecinPrescripteur: { include: { user: true } },
      lignes: { include: { medicament: true } },
    },
    orderBy: { date: "desc" },
  });

  return prescriptions.map((prescription) =>
    versPrescriptionResume(prescription, {
      medecinNomComplet: nomCompletProfessionnel(prescription.medecinPrescripteur.user),
      patientNomComplet: null,
      patientIdentifiantSante: null,
    })
  );
}

/**
 * Verifie que la consultation identifiee appartient bien au professionnel
 * connecte (Zero Trust), et indique si une prescription existe deja pour
 * cette consultation (evite les doublons par erreur). Retourne null si la
 * consultation est introuvable ou n'appartient pas au professionnel connecte.
 */
export async function getConsultationPourPrescription(consultationId: string): Promise<{
  id: string;
  motif: string;
  patientNomComplet: string;
  dejaPrescription: boolean;
} | null> {
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
    include: {
      patient: { include: { user: true } },
      prescriptions: { select: { id: true } },
    },
  });

  if (!consultation || consultation.professionnelId !== professionnel.id) {
    return null;
  }

  return {
    id: consultation.id,
    motif: consultation.motif,
    patientNomComplet: nomComplet(consultation.patient.user),
    dejaPrescription: consultation.prescriptions.length > 0,
  };
}

/**
 * Cree une prescription a l'initiative du professionnel connecte, rattachee
 * a une consultation identifiee par consultationId (Zero Trust : verifie
 * systematiquement que cette consultation appartient bien au professionnel
 * connecte, jamais suppose valide). Valide chaque ligne (medicament existant
 * au catalogue, posologie non vide, quantite et duree de traitement entieres
 * strictement positives), puis applique la regle d'interaction simplifiee :
 * refuse la prescription si deux lignes partagent le meme principe actif.
 * Cree la Prescription (statut "validee") et ses LignePrescription dans une
 * transaction, ecrit un EvenementPrescription (type "creation") et trace la
 * creation dans JournalAudit.
 */
export async function creerPrescriptionAction(
  prevState: PrescriptionActionState,
  formData: FormData
): Promise<PrescriptionActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const lignesJSON = texte(formData, "lignesJSON");
  let lignesBrutes: unknown;

  try {
    lignesBrutes = lignesJSON.trim().length > 0 ? JSON.parse(lignesJSON) : [];
  } catch {
    return { error: "Les lignes de prescription sont mal formees.", success: false };
  }

  const validation = schemaCreationPrescription.safeParse({
    consultationId: texte(formData, "consultationId"),
    instructions: texte(formData, "instructions"),
    lignes: lignesBrutes,
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de prescription invalides."),
      success: false,
    };
  }

  const { consultationId, instructions, lignes } = validation.data;

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

    const idsMedicaments = [...new Set(lignes.map((ligne) => ligne.medicamentId))];
    const medicamentsTrouves = await prisma.medicament.findMany({
      where: { id: { in: idsMedicaments } },
    });

    if (medicamentsTrouves.length !== idsMedicaments.length) {
      return { error: "Un des medicaments selectionnes est introuvable au catalogue.", success: false };
    }

    const medicamentParId = new Map(medicamentsTrouves.map((medicament) => [medicament.id, medicament]));

    const principesActifsVus = new Map<string, string>();

    for (const ligne of lignes) {
      const medicament = medicamentParId.get(ligne.medicamentId);

      if (!medicament) {
        return { error: "Un des medicaments selectionnes est introuvable au catalogue.", success: false };
      }

      const principeActifExistant = principesActifsVus.get(medicament.principeActif);

      if (principeActifExistant !== undefined) {
        return {
          error: `Deux medicaments de cette prescription partagent le meme principe actif (${medicament.principeActif}) : verifiez qu'il n'y a pas de doublon ou de risque d'interaction avant de valider.`,
          success: false,
        };
      }

      principesActifsVus.set(medicament.principeActif, medicament.id);
    }

    const adresseTechnique = await adresseTechniqueCourante();

    const prescriptionCreeeId = await prisma.$transaction(async (tx) => {
      const prescriptionCreee = await tx.prescription.create({
        data: {
          consultationId: consultation.id,
          medecinPrescripteurId: professionnel.id,
          patientId: consultation.patientId,
          statut: "validee",
          instructions,
          lignes: {
            create: lignes.map((ligne) => ({
              medicamentId: ligne.medicamentId,
              posologie: ligne.posologie,
              quantite: ligne.quantite,
              dureeTraitementJours: ligne.dureeTraitementJours,
            })),
          },
        },
      });

      await tx.evenementPrescription.create({
        data: {
          prescriptionId: prescriptionCreee.id,
          type: "creation",
          utilisateurId: session.userId,
          commentaire: null,
        },
      });

      await tx.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "creation",
          donneeConcernee: `prescription:${prescriptionCreee.id}`,
          adresseTechnique,
          justification: `Prescription creee pour le patient ${consultation.patientId} suite a la consultation ${consultation.id}`,
        },
      });

      return prescriptionCreee.id;
    });

    void prescriptionCreeeId;

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la creation de la prescription :", erreur);
    return {
      error: "Une erreur est survenue lors de la creation de la prescription. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Recupere les prescriptions creees par le professionnel connecte (derive de
 * getSession() -> ProfessionnelSante lie), de la plus recente a la plus
 * ancienne.
 */
export async function getPrescriptionsDuProfessionnel(): Promise<PrescriptionResume[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const prescriptions = await prisma.prescription.findMany({
    where: { medecinPrescripteurId: professionnel.id },
    include: {
      consultation: true,
      patient: { include: { user: true } },
      lignes: { include: { medicament: true } },
    },
    orderBy: { date: "desc" },
  });

  return prescriptions.map((prescription) =>
    versPrescriptionResume(prescription, {
      medecinNomComplet: null,
      patientNomComplet: nomComplet(prescription.patient.user),
      patientIdentifiantSante: prescription.patient.identifiantSante,
    })
  );
}
