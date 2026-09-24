"use server";

/**
 * Server Actions du module patient : dossier patient et consentement.
 * Contrat d'integration Phase 3, consomme par les ecrans
 * src/app/app/patient/** (autre agent).
 *
 * Principe applique de bout en bout (voir src/modules/identity/actions.ts et
 * src/security/README.md) : Zero Trust. Le patient courant est toujours
 * derive de getSession().userId, jamais d'un id de patient transmis par le
 * client dans un formulaire. Toute lecture ou modification d'une ressource
 * identifiee par un id transmis (ex : consentementId) verifie explicitement
 * que cette ressource appartient bien au patient connecte avant d'agir.
 * Toute modification du dossier ou evenement de consentement est trace dans
 * JournalAudit.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { ContactUrgence, GroupeSanguin, TypeAccesConsentement } from "@/types";

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface PatientActionState {
  error: string | null;
  success: boolean;
}

/** Resume du dossier du patient connecte, pret a afficher cote ecran. */
export interface DossierPatientResume {
  identifiantSante: string;
  dateNaissance: string; // ISO
  sexe: "M" | "F";
  groupeSanguin: string;
  allergies: string[];
  antecedents: string[];
  maladiesChroniques: string[];
  contactsUrgence: { nom: string; telephone: string; lienParente: string }[];
}

/** Consentement du patient connecte, enrichi du nom et de la specialite de l'acteur autorise. */
export interface ConsentementAvecActeur {
  id: string;
  acteurAutoriseId: string;
  acteurNomComplet: string; // "Dr. Prenom Nom" ou "Prenom Nom"
  acteurSpecialite: string | null; // specialite si ProfessionnelSante, sinon null
  typeAcces: string;
  statut: string;
  dateDebut: string; // ISO
  dateFin: string | null; // ISO
}

/** Professionnel de sante pouvant se voir accorder un acces au dossier du patient connecte. */
export interface ProfessionnelDisponible {
  userId: string;
  nomComplet: string;
  specialite: string;
  etablissementNom: string;
}

const GROUPES_SANGUINS_CONNUS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "inconnu",
] as const satisfies readonly GroupeSanguin[];

const TYPES_ACCES_CONNUS = [
  "dossier_complet",
  "consultations",
  "prescriptions",
  "examens",
  "documents",
] as const satisfies readonly TypeAccesConsentement[];

const schemaMiseAJourDossier = z
  .object({
    groupeSanguin: z.enum(GROUPES_SANGUINS_CONNUS, { message: "Groupe sanguin invalide." }),
    allergies: z.string().optional().default(""),
    antecedents: z.string().optional().default(""),
    maladiesChroniques: z.string().optional().default(""),
    contactUrgenceNom: z.string().optional().default(""),
    contactUrgenceTelephone: z.string().optional().default(""),
    contactUrgenceLien: z.string().optional().default(""),
  })
  .refine(
    (donnees) => {
      const nomRempli = donnees.contactUrgenceNom.trim().length > 0;
      const telephoneRempli = donnees.contactUrgenceTelephone.trim().length > 0;
      return nomRempli === telephoneRempli;
    },
    {
      message:
        "Le nom et le telephone du contact d'urgence sont obligatoires ensemble (renseignez les deux, ou aucun des deux).",
      path: ["contactUrgenceNom"],
    }
  );

const schemaOctroiConsentement = z.object({
  acteurAutoriseId: z.string().trim().min(1, "Le professionnel de sante est obligatoire."),
  typeAcces: z.enum(TYPES_ACCES_CONNUS, { message: "Type d'acces invalide." }),
});

const schemaRetraitConsentement = z.object({
  consentementId: z.string().trim().min(1, "Le consentement est obligatoire."),
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

/** Convertit une chaine JSON de tableau (telle que stockee en base) en tableau de chaines. */
function parseListeJSON(valeur: string): string[] {
  try {
    const donnees: unknown = JSON.parse(valeur);
    return Array.isArray(donnees) ? donnees.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Convertit une chaine JSON de contacts d'urgence en tableau typé. */
function parseContactsUrgence(valeur: string): ContactUrgence[] {
  try {
    const donnees: unknown = JSON.parse(valeur);

    if (!Array.isArray(donnees)) {
      return [];
    }

    return donnees
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        nom: typeof item.nom === "string" ? item.nom : "",
        telephone: typeof item.telephone === "string" ? item.telephone : "",
        lienParente: typeof item.lienParente === "string" ? item.lienParente : "",
      }));
  } catch {
    return [];
  }
}

/** Decoupe un champ "une entree par ligne" en tableau de chaines non vides, nettoyees. */
function parseListeLignes(valeur: string): string[] {
  return valeur
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.length > 0);
}

/** Nom complet d'un acteur, prefixe de "Dr." s'il s'agit d'un professionnel de sante. */
function nomCompletActeur(
  utilisateur: { nom: string; prenom: string },
  estProfessionnel: boolean
): string {
  const nomComplet = `${utilisateur.prenom} ${utilisateur.nom}`;
  return estProfessionnel ? `Dr. ${nomComplet}` : nomComplet;
}

/** Recupere le profil Patient du titulaire de la session courante, ou null si absent. */
async function patientDeLaSessionCourante() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  return prisma.patient.findUnique({ where: { userId: session.userId } });
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/**
 * Recupere le dossier du patient connecte (derive de getSession(), jamais
 * d'id en parametre). Retourne null si la session est absente ou si
 * l'utilisateur connecte n'a pas de profil Patient.
 */
export async function getMonDossierPatient(): Promise<DossierPatientResume | null> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return null;
  }

  return {
    identifiantSante: patient.identifiantSante,
    dateNaissance: patient.dateNaissance.toISOString(),
    sexe: patient.sexe === "F" ? "F" : "M",
    groupeSanguin: patient.groupeSanguin,
    allergies: parseListeJSON(patient.allergies),
    antecedents: parseListeJSON(patient.antecedents),
    maladiesChroniques: parseListeJSON(patient.maladiesChroniques),
    contactsUrgence: parseContactsUrgence(patient.contactsUrgence),
  };
}

/**
 * Recupere les consentements du patient connecte, avec le nom et la
 * specialite de chaque acteur autorise, du plus recent au plus ancien.
 */
export async function getMesConsentements(): Promise<ConsentementAvecActeur[]> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return [];
  }

  const consentements = await prisma.consentement.findMany({
    where: { patientId: patient.id },
    include: { acteurAutorise: { include: { professionnel: true } } },
    orderBy: { dateDebut: "desc" },
  });

  return consentements.map((consentement) => ({
    id: consentement.id,
    acteurAutoriseId: consentement.acteurAutoriseId,
    acteurNomComplet: nomCompletActeur(
      consentement.acteurAutorise,
      consentement.acteurAutorise.professionnel !== null
    ),
    acteurSpecialite: consentement.acteurAutorise.professionnel?.specialite ?? null,
    typeAcces: consentement.typeAcces,
    statut: consentement.statut,
    dateDebut: consentement.dateDebut.toISOString(),
    dateFin: consentement.dateFin ? consentement.dateFin.toISOString() : null,
  }));
}

/**
 * Liste les professionnels de sante valides, pour peupler le selecteur
 * "a qui accorder l'acces" cote ecran. Exclut les professionnels deja
 * autorises avec un consentement actif pour le patient connecte.
 */
export async function listProfessionnelsDisponibles(): Promise<ProfessionnelDisponible[]> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return [];
  }

  const [professionnels, consentementsActifs] = await Promise.all([
    prisma.professionnelSante.findMany({
      where: { statutValidation: "valide" },
      include: { user: true, etablissement: true },
    }),
    prisma.consentement.findMany({
      where: { patientId: patient.id, statut: "actif" },
      select: { acteurAutoriseId: true },
    }),
  ]);

  const idsDejaAutorises = new Set(consentementsActifs.map((c) => c.acteurAutoriseId));

  return professionnels
    .filter((professionnel) => !idsDejaAutorises.has(professionnel.userId))
    .map((professionnel) => ({
      userId: professionnel.userId,
      nomComplet: nomCompletActeur(professionnel.user, true),
      specialite: professionnel.specialite,
      etablissementNom: professionnel.etablissement.nom,
    }));
}

/**
 * Met a jour le dossier du patient connecte (groupe sanguin, allergies,
 * antecedents, maladies chroniques, contact d'urgence). Ne redirige pas :
 * l'ecran reste sur la meme page et affiche le resultat via l'etat retourne.
 */
export async function updatePatientProfileAction(
  prevState: PatientActionState,
  formData: FormData
): Promise<PatientActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaMiseAJourDossier.safeParse({
    groupeSanguin: formData.get("groupeSanguin"),
    allergies: formData.get("allergies"),
    antecedents: formData.get("antecedents"),
    maladiesChroniques: formData.get("maladiesChroniques"),
    contactUrgenceNom: formData.get("contactUrgenceNom"),
    contactUrgenceTelephone: formData.get("contactUrgenceTelephone"),
    contactUrgenceLien: formData.get("contactUrgenceLien"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de dossier invalides."),
      success: false,
    };
  }

  try {
    const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

    if (!patient) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const donnees = validation.data;
    const nomContact = donnees.contactUrgenceNom.trim();
    const telephoneContact = donnees.contactUrgenceTelephone.trim();
    const lienContact = donnees.contactUrgenceLien.trim();

    const contactsUrgence: ContactUrgence[] =
      nomContact.length > 0 && telephoneContact.length > 0
        ? [{ nom: nomContact, telephone: telephoneContact, lienParente: lienContact }]
        : [];

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.patient.update({
        where: { id: patient.id },
        data: {
          groupeSanguin: donnees.groupeSanguin,
          allergies: JSON.stringify(parseListeLignes(donnees.allergies)),
          antecedents: JSON.stringify(parseListeLignes(donnees.antecedents)),
          maladiesChroniques: JSON.stringify(parseListeLignes(donnees.maladiesChroniques)),
          contactsUrgence: JSON.stringify(contactsUrgence),
        },
      }),
      prisma.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "modification",
          donneeConcernee: `patient:${patient.id}`,
          adresseTechnique,
          justification: "Mise a jour du dossier patient par le patient lui-meme",
        },
      }),
    ]);

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la mise a jour du dossier patient :", erreur);
    return {
      error: "Une erreur est survenue lors de la mise a jour du dossier. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Accorde (ou reactive) un consentement du patient connecte vers un acteur
 * autorise. Verifie que l'acteur cible est bien un professionnel de sante
 * valide avant d'accorder l'acces (Zero Trust : l'id transmis par le client
 * n'est jamais suppose fiable).
 */
export async function grantConsentAction(
  prevState: PatientActionState,
  formData: FormData
): Promise<PatientActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaOctroiConsentement.safeParse({
    acteurAutoriseId: formData.get("acteurAutoriseId"),
    typeAcces: formData.get("typeAcces"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de consentement invalides."),
      success: false,
    };
  }

  const { acteurAutoriseId, typeAcces } = validation.data;

  try {
    const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

    if (!patient) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const professionnelCible = await prisma.professionnelSante.findUnique({
      where: { userId: acteurAutoriseId },
    });

    if (!professionnelCible || professionnelCible.statutValidation !== "valide") {
      return {
        error: "Ce professionnel de sante n'est pas disponible pour recevoir un acces.",
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const maintenant = new Date();

    const consentement = await prisma.consentement.upsert({
      where: {
        patientId_acteurAutoriseId: {
          patientId: patient.id,
          acteurAutoriseId,
        },
      },
      create: {
        patientId: patient.id,
        acteurAutoriseId,
        typeAcces,
        statut: "actif",
        dateDebut: maintenant,
        dateFin: null,
      },
      update: {
        typeAcces,
        statut: "actif",
        dateDebut: maintenant,
        dateFin: null,
      },
    });

    await prisma.journalAudit.create({
      data: {
        utilisateurId: session.userId,
        action: "consentement_accorde",
        donneeConcernee: `consentement:${consentement.id}`,
        adresseTechnique,
        justification: `Consentement accorde (${typeAcces}) a l'acteur ${acteurAutoriseId}`,
      },
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'octroi du consentement :", erreur);
    return {
      error: "Une erreur est survenue lors de l'octroi du consentement. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Retire un consentement du patient connecte. Verifie d'abord que le
 * consentement transmis appartient bien au patient connecte (Zero Trust :
 * ne jamais faire confiance a l'id transmis sans verification de propriete)
 * avant de le modifier.
 */
export async function revokeConsentAction(
  prevState: PatientActionState,
  formData: FormData
): Promise<PatientActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaRetraitConsentement.safeParse({
    consentementId: formData.get("consentementId"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Consentement invalide."),
      success: false,
    };
  }

  const { consentementId } = validation.data;

  try {
    const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

    if (!patient) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const consentement = await prisma.consentement.findUnique({
      where: { id: consentementId },
    });

    if (!consentement || consentement.patientId !== patient.id) {
      return { error: "Ce consentement est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.consentement.update({
        where: { id: consentement.id },
        data: { statut: "retire", dateFin: new Date() },
      }),
      prisma.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "consentement_retire",
          donneeConcernee: `consentement:${consentement.id}`,
          adresseTechnique,
          justification: `Consentement retire vers l'acteur ${consentement.acteurAutoriseId}`,
        },
      }),
    ]);

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du retrait du consentement :", erreur);
    return {
      error: "Une erreur est survenue lors du retrait du consentement. Veuillez reessayer.",
      success: false,
    };
  }
}
