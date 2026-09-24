"use server";

/**
 * Server Actions du module clinical : consultations et contenu clinique.
 * Contrat d'integration Phase 4, consomme par les ecrans
 * src/app/app/patient/** et src/app/app/medecin/** (autres agents).
 *
 * Meme principe applique de bout en bout que src/modules/patient/actions.ts :
 * Zero Trust. Le patient ou le professionnel courant est toujours derive de
 * getSession(), jamais d'un id transmis par le client dans un formulaire.
 * Regle metier centrale de ce module : un professionnel ne peut creer une
 * consultation pour un patient que si ce patient lui a accorde un
 * Consentement actif ("dossier_complet" ou "consultations"), verifie ici en
 * base avant toute ecriture, jamais suppose. Toute creation de consultation
 * est tracee dans JournalAudit.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface ClinicalActionState {
  error: string | null;
  success: boolean;
}

/** Resume d'une consultation, pret a afficher cote ecran patient ou professionnel. */
export interface ConsultationResume {
  id: string;
  date: string;
  motif: string;
  symptomes: string[];
  constantes: string;
  observations: string;
  conclusion: string;
  statut: string;
  professionnelNomComplet: string | null; // rempli cote patient
  patientNomComplet: string | null; // rempli cote professionnel
  patientIdentifiantSante: string | null; // rempli cote professionnel
}

/** Types d'acces de consentement autorisant un professionnel a creer une consultation. */
const TYPES_ACCES_CONSULTATION = ["dossier_complet", "consultations"] as const;

const schemaCreationConsultation = z.object({
  patientId: z.string().trim().min(1, "Le patient est obligatoire."),
  rendezVousId: z.string().trim().optional().default(""),
  motif: z.string().trim().min(1, "Le motif est obligatoire."),
  symptomes: z.string().trim().optional().default(""),
  constantes: z.string().trim().optional().default(""),
  observations: z.string().trim().optional().default(""),
  conclusion: z.string().trim().optional().default(""),
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

/** Nom complet d'un professionnel de sante, prefixe de "Dr." (meme convention que le module patient). */
function nomCompletProfessionnel(utilisateur: { nom: string; prenom: string }): string {
  return `Dr. ${utilisateur.prenom} ${utilisateur.nom}`;
}

/** Decoupe un champ "une entree par ligne" en tableau de chaines non vides, nettoyees. */
function parseListeLignes(valeur: string): string[] {
  return valeur
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.length > 0);
}

/** Convertit une chaine JSON de tableau (telle que stockee en base) en tableau de chaines. */
function parseListeJSON(valeur: string): string[] {
  try {
    const donnees: unknown = JSON.parse(valeur);
    return Array.isArray(donnees)
      ? donnees.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
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

/**
 * Recupere l'historique des consultations du patient connecte (derive de
 * getSession(), jamais d'id en parametre), du plus recent au plus ancien.
 */
export async function getMesConsultations(): Promise<ConsultationResume[]> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return [];
  }

  const consultations = await prisma.consultation.findMany({
    where: { patientId: patient.id },
    include: { professionnel: { include: { user: true } } },
    orderBy: { date: "desc" },
  });

  return consultations.map((consultation) => ({
    id: consultation.id,
    date: consultation.date.toISOString(),
    motif: consultation.motif,
    symptomes: parseListeJSON(consultation.symptomes),
    constantes: consultation.constantes,
    observations: consultation.observations,
    conclusion: consultation.conclusion,
    statut: consultation.statut,
    professionnelNomComplet: nomCompletProfessionnel(consultation.professionnel.user),
    patientNomComplet: null,
    patientIdentifiantSante: null,
  }));
}

/**
 * Liste les patients ayant accorde un Consentement actif (dossier_complet ou
 * consultations) au professionnel connecte, pour peupler le selecteur de
 * patient cote ecran de creation de consultation.
 */
export async function getPatientsAvecConsentement(): Promise<
  { patientId: string; nomComplet: string; identifiantSante: string }[]
> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const consentements = await prisma.consentement.findMany({
    where: {
      acteurAutoriseId: professionnel.userId,
      statut: "actif",
      typeAcces: { in: [...TYPES_ACCES_CONSULTATION] },
    },
    include: { patient: { include: { user: true } } },
  });

  return consentements.map((consentement) => ({
    patientId: consentement.patientId,
    nomComplet: nomComplet(consentement.patient.user),
    identifiantSante: consentement.patient.identifiantSante,
  }));
}

/**
 * Recupere les consultations creees par le professionnel connecte (derive de
 * getSession() -> ProfessionnelSante lie), de la plus recente a la plus
 * ancienne.
 */
export async function getConsultationsDuProfessionnel(): Promise<ConsultationResume[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const consultations = await prisma.consultation.findMany({
    where: { professionnelId: professionnel.id },
    include: { patient: { include: { user: true } } },
    orderBy: { date: "desc" },
  });

  return consultations.map((consultation) => ({
    id: consultation.id,
    date: consultation.date.toISOString(),
    motif: consultation.motif,
    symptomes: parseListeJSON(consultation.symptomes),
    constantes: consultation.constantes,
    observations: consultation.observations,
    conclusion: consultation.conclusion,
    statut: consultation.statut,
    professionnelNomComplet: null,
    patientNomComplet: nomComplet(consultation.patient.user),
    patientIdentifiantSante: consultation.patient.identifiantSante,
  }));
}

/**
 * Cree une consultation a l'initiative du professionnel connecte, pour un
 * patient identifie par patientId (Zero Trust : verifie systematiquement,
 * jamais suppose valide). Verification obligatoire avant toute ecriture :
 * un Consentement actif (dossier_complet ou consultations) doit exister pour
 * (patientId, acteurAutoriseId = professionnel connecte). Si un rendezVousId
 * est fourni, verifie qu'il appartient bien a ce patient et a ce
 * professionnel, puis passe son statut a "termine" dans la meme transaction
 * que la creation de la consultation. Trace la creation dans JournalAudit.
 */
export async function creerConsultationAction(
  prevState: ClinicalActionState,
  formData: FormData
): Promise<ClinicalActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaCreationConsultation.safeParse({
    patientId: texte(formData, "patientId"),
    rendezVousId: texte(formData, "rendezVousId"),
    motif: texte(formData, "motif"),
    symptomes: texte(formData, "symptomes"),
    constantes: texte(formData, "constantes"),
    observations: texte(formData, "observations"),
    conclusion: texte(formData, "conclusion"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de consultation invalides."),
      success: false,
    };
  }

  const { patientId, rendezVousId, motif, symptomes, constantes, observations, conclusion } =
    validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const consentement = await prisma.consentement.findUnique({
      where: {
        patientId_acteurAutoriseId: {
          patientId,
          acteurAutoriseId: session.userId,
        },
      },
    });

    const consentementValide =
      consentement !== null &&
      consentement.statut === "actif" &&
      (TYPES_ACCES_CONSULTATION as readonly string[]).includes(consentement.typeAcces);

    if (!consentementValide) {
      return {
        error:
          "Aucun consentement actif pour ce patient. Le patient doit d'abord vous autoriser depuis son espace.",
        success: false,
      };
    }

    const rendezVousIdNettoye = rendezVousId.trim();
    let rendezVousIdValide: string | null = null;

    if (rendezVousIdNettoye.length > 0) {
      const rendezVous = await prisma.rendezVous.findUnique({
        where: { id: rendezVousIdNettoye },
      });

      if (
        !rendezVous ||
        rendezVous.patientId !== patientId ||
        rendezVous.professionnelId !== professionnel.id
      ) {
        return { error: "Ce rendez-vous est introuvable.", success: false };
      }

      rendezVousIdValide = rendezVous.id;
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      const consultationCreee = await tx.consultation.create({
        data: {
          patientId,
          professionnelId: professionnel.id,
          etablissementId: professionnel.etablissementId,
          rendezVousId: rendezVousIdValide,
          motif,
          symptomes: JSON.stringify(parseListeLignes(symptomes)),
          constantes,
          observations,
          conclusion,
          statut: "terminee",
        },
      });

      if (rendezVousIdValide) {
        await tx.rendezVous.update({
          where: { id: rendezVousIdValide },
          data: { statut: "termine" },
        });
      }

      await tx.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "creation",
          donneeConcernee: `consultation:${consultationCreee.id}`,
          adresseTechnique,
          justification: `Consultation creee pour le patient ${patientId}`,
        },
      });
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la creation de la consultation :", erreur);
    return {
      error: "Une erreur est survenue lors de la creation de la consultation. Veuillez reessayer.",
      success: false,
    };
  }
}
