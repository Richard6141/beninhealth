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
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";

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

  // RBAC (voir src/security/permissions.ts) : creer une prescription est
  // reserve au role medecin. Posseder un profil ProfessionnelSante ne suffit
  // pas, le role precis doit etre verifie.
  if (!session.roles.some((role) => can(role, "create", "prescription"))) {
    return { error: "Action reservee aux medecins.", success: false };
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

/**
 * Module pharmacie (Phase 9) : delivrance des prescriptions en officine.
 * Reprend le meme cycle de vie que la creation (statut Prescription,
 * EvenementPrescription, JournalAudit), sans nouveau modele Prisma : la
 * delivrance est une transition de statut sur une Prescription existante,
 * pas une ressource a part. Reserve au role "pharmacien", verifie
 * explicitement dans chaque fonction (Zero Trust : le role RBAC
 * "update:prescription" est aussi accorde au medecin, il ne suffit donc pas
 * a lui seul a distinguer "delivrer en pharmacie" de "modifier sa propre
 * prescription").
 */

const STATUTS_EN_ATTENTE_DE_DELIVRANCE = ["validee", "delivree_partiellement"] as const;

const schemaDelivrance = z.object({
  prescriptionId: z.string().trim().min(1, "La prescription est obligatoire."),
  statutLivraison: z.enum(["delivree", "delivree_partiellement"], {
    message: "Statut de delivrance invalide.",
  }),
  commentaire: z.string().trim().optional().default(""),
});

/**
 * Prescriptions en attente de delivrance (statut "validee" ou
 * "delivree_partiellement"), tous patients confondus : un pharmacien sert
 * n'importe quel patient qui se presente au comptoir avec une prescription,
 * pas seulement "ses" patients. `recherche` filtre par nom/prenom du patient
 * ou identifiant sante (comparaison insensible a la casse faite cote
 * application : SQLite ne supporte pas `mode: "insensitive"` cote Prisma).
 * Retourne un tableau vide si l'utilisateur connecte n'est pas pharmacien.
 */
export async function getPrescriptionsADelivrer(recherche?: string): Promise<PrescriptionResume[]> {
  const session = await getSession();

  if (!session || !session.roles.includes("pharmacien")) {
    return [];
  }

  const prescriptions = await prisma.prescription.findMany({
    where: { statut: { in: [...STATUTS_EN_ATTENTE_DE_DELIVRANCE] } },
    include: {
      consultation: true,
      patient: { include: { user: true } },
      lignes: { include: { medicament: true } },
    },
    orderBy: { date: "asc" },
  });

  const termeRecherche = recherche?.trim().toLowerCase();

  const prescriptionsFiltrees = termeRecherche
    ? prescriptions.filter((prescription) => {
        const patient = prescription.patient;
        const nomComplet = `${patient.user.prenom} ${patient.user.nom}`.toLowerCase();
        return (
          nomComplet.includes(termeRecherche) ||
          patient.identifiantSante.toLowerCase().includes(termeRecherche)
        );
      })
    : prescriptions;

  return prescriptionsFiltrees.map((prescription) =>
    versPrescriptionResume(prescription, {
      medecinNomComplet: null,
      patientNomComplet: nomComplet(prescription.patient.user),
      patientIdentifiantSante: prescription.patient.identifiantSante,
    })
  );
}

/**
 * Marque une prescription comme delivree (totalement ou partiellement) par
 * le pharmacien connecte. Refuse toute prescription qui n'est pas
 * actuellement "validee" ou "delivree_partiellement" (deja entierement
 * delivree, ou annulee), sans rien ecrire en base dans ce cas.
 */
export async function delivrerPrescriptionAction(
  prevState: PrescriptionActionState,
  formData: FormData
): Promise<PrescriptionActionState> {
  const session = await getSession();

  if (!session || !session.roles.includes("pharmacien")) {
    return { error: "Action reservee au role pharmacien.", success: false };
  }

  const validation = schemaDelivrance.safeParse({
    prescriptionId: texte(formData, "prescriptionId"),
    statutLivraison: texte(formData, "statutLivraison"),
    commentaire: texte(formData, "commentaire"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de delivrance invalides."),
      success: false,
    };
  }

  const { prescriptionId, statutLivraison, commentaire } = validation.data;

  try {
    const prescription = await prisma.prescription.findUnique({ where: { id: prescriptionId } });

    if (!prescription) {
      return { error: "Cette prescription est introuvable.", success: false };
    }

    if (!STATUTS_EN_ATTENTE_DE_DELIVRANCE.includes(prescription.statut as "validee" | "delivree_partiellement")) {
      return {
        error:
          prescription.statut === "delivree"
            ? "Cette prescription a deja ete entierement delivree."
            : "Cette prescription est annulee et ne peut pas etre delivree.",
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.prescription.update({
        where: { id: prescriptionId },
        data: { statut: statutLivraison },
      }),
      prisma.evenementPrescription.create({
        data: {
          prescriptionId,
          type: statutLivraison === "delivree" ? "delivrance" : "delivrance_partielle",
          utilisateurId: session.userId,
          commentaire: commentaire.length > 0 ? commentaire : null,
        },
      }),
      prisma.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "delivrance",
          donneeConcernee: `prescription:${prescriptionId}`,
          adresseTechnique,
          justification:
            statutLivraison === "delivree"
              ? "Prescription entierement delivree en pharmacie"
              : "Prescription partiellement delivree en pharmacie",
        },
      }),
    ]);
  } catch (erreur) {
    console.error("Erreur lors de la delivrance de la prescription :", erreur);
    return {
      error: "Une erreur est survenue lors de la delivrance. Veuillez reessayer.",
      success: false,
    };
  }

  revalidatePath("/app/medecin/pharmacie");
  return { error: null, success: true };
}
