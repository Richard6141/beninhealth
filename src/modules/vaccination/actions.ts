"use server";

/**
 * Server Actions du module vaccination (F-CLI-11 du pack) : enregistrement
 * d'une vaccination administree en etablissement, reserve aux roles medecin
 * et infirmier.
 *
 * Meme principe applique de bout en bout que src/modules/clinical/actions.ts
 * et src/modules/laboratoire/actions.ts : Zero Trust. Le professionnel
 * courant est toujours derive de getSession(), jamais d'un id transmis par
 * le client dans un formulaire. Regle metier centrale : un professionnel ne
 * peut enregistrer une vaccination pour un patient que si ce patient lui a
 * accorde un Consentement actif, verifie ici en base avant toute ecriture,
 * jamais suppose. RG-CLI-100 : une vaccination est immuable une fois
 * enregistree ; une erreur de saisie se corrige par un retrait motive,
 * jamais par une modification ou suppression des champs d'origine. Toute
 * creation ou retrait est trace dans JournalAudit.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { libelleVoie, LONGUEUR_MIN_MOTIF_RETRAIT, VOIES_ADMINISTRATION_VALEURS } from "./referentiel";

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface VaccinationActionState {
  error: string | null;
  success: boolean;
  // Rempli par enregistrerVaccinationAction quand la meme dose du meme
  // vaccin est deja enregistree pour ce patient : simple avertissement (pas
  // un blocage dur), le formulaire doit alors proposer la case de
  // confirmation avant de resoumettre.
  avertissementDoublon?: boolean;
}

/** Resume d'une vaccination, pret a afficher dans l'historique du patient. */
export interface VaccinationResume {
  id: string;
  patientId: string;
  vaccin: string;
  numeroDose: number;
  dateAdministration: string; // ISO
  numeroLot: string;
  siteInjection: string;
  voie: string;
  voieLibelle: string;
  professionnelNomComplet: string;
  etablissementNom: string;
  saisieParErreur: boolean;
  motifRetrait: string | null;
}

const REGEX_DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

const schemaEnregistrementVaccination = z.object({
  patientId: z.string().trim().min(1, "Le patient est obligatoire."),
  vaccin: z.string().trim().min(1, "Le vaccin est obligatoire.").max(100, "100 caracteres maximum."),
  numeroDose: z.coerce
    .number({ message: "Le numero de dose doit etre un nombre." })
    .int("Le numero de dose doit etre un nombre entier.")
    .positive("Le numero de dose doit etre strictement positif."),
  dateAdministration: z
    .string()
    .trim()
    .regex(REGEX_DATE_ISO, "La date d'administration est invalide."),
  numeroLot: z.string().trim().min(1, "Le numero de lot est obligatoire."),
  siteInjection: z.string().trim().min(1, "Le site d'injection est obligatoire."),
  voie: z.enum(VOIES_ADMINISTRATION_VALEURS, { message: "La voie d'administration est invalide." }),
  confirmerDoublon: z.coerce.boolean().optional().default(false),
});

const schemaRetraitVaccination = z.object({
  vaccinationId: z.string().trim().min(1, "La vaccination est obligatoire."),
  motif: z
    .string()
    .trim()
    .min(
      LONGUEUR_MIN_MOTIF_RETRAIT,
      `Le motif du retrait doit contenir au moins ${LONGUEUR_MIN_MOTIF_RETRAIT} caracteres.`
    ),
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

/** Nom complet d'un professionnel de sante, prefixe de "Dr." (meme convention que les autres modules). */
function nomCompletProfessionnel(utilisateur: { nom: string; prenom: string }): string {
  return `Dr. ${utilisateur.prenom} ${utilisateur.nom}`;
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
 * Verifie qu'un Consentement actif existe pour (patientId, session.userId),
 * meme controle que getResumePatient (src/modules/clinical/actions.ts) :
 * statut actif et date de fin non depassee (ou absente). Jamais de
 * restriction par typeAcces ici (ce depot n'a qu'un seul niveau d'acces
 * reel pour ce module).
 */
async function consentementActifPour(patientId: string, acteurAutoriseId: string): Promise<boolean> {
  const consentement = await prisma.consentement.findUnique({
    where: { patientId_acteurAutoriseId: { patientId, acteurAutoriseId } },
  });

  return (
    consentement !== null &&
    consentement.statut === "actif" &&
    (consentement.dateFin === null || consentement.dateFin > new Date())
  );
}

/**
 * Enregistre une vaccination administree en etablissement (F-CLI-11 du
 * pack), pour le patient et le professionnel connecte (jamais un id de
 * professionnel transmis par le client). Rejette toute date d'administration
 * dans le futur (blocage dur). Si la meme dose du meme vaccin est deja
 * enregistree pour ce patient (et non retiree), renvoie un avertissement
 * plutot qu'une erreur bloquante : le formulaire doit alors cocher
 * confirmerDoublon pour forcer l'enregistrement. RG-CLI-100 : une fois
 * creee, une vaccination n'est plus jamais modifiee ; seul un retrait motive
 * (retirerVaccinationAction) peut corriger une erreur de saisie.
 */
export async function enregistrerVaccinationAction(
  prevState: VaccinationActionState,
  formData: FormData
): Promise<VaccinationActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  // RBAC (voir src/security/permissions.ts) : enregistrer une vaccination
  // est reserve aux roles medecin et infirmier.
  if (!session.roles.some((role) => can(role, "create", "vaccination"))) {
    return { error: "Action reservee aux medecins et infirmiers.", success: false };
  }

  const validation = schemaEnregistrementVaccination.safeParse({
    patientId: texte(formData, "patientId"),
    vaccin: texte(formData, "vaccin"),
    numeroDose: texte(formData, "numeroDose"),
    dateAdministration: texte(formData, "dateAdministration"),
    numeroLot: texte(formData, "numeroLot"),
    siteInjection: texte(formData, "siteInjection"),
    voie: texte(formData, "voie"),
    confirmerDoublon: texte(formData, "confirmerDoublon"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de vaccination invalides."),
      success: false,
    };
  }

  const {
    patientId,
    vaccin,
    numeroDose,
    dateAdministration,
    numeroLot,
    siteInjection,
    voie,
    confirmerDoublon,
  } = validation.data;

  const aujourdHuiISO = new Date().toISOString().slice(0, 10);
  if (dateAdministration > aujourdHuiISO) {
    return { error: "La date d'administration ne peut pas etre dans le futur.", success: false };
  }

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });

    if (!patient) {
      return { error: "Ce patient est introuvable.", success: false };
    }

    const consentementValide = await consentementActifPour(patientId, session.userId);

    if (!consentementValide) {
      return {
        error:
          "Aucun consentement actif pour ce patient. Le patient doit d'abord vous autoriser depuis son espace.",
        success: false,
      };
    }

    const doublon = await prisma.vaccination.findFirst({
      where: { patientId, vaccin, numeroDose, saisieParErreur: false },
    });

    if (doublon && !confirmerDoublon) {
      return {
        error: `La dose ${numeroDose} du vaccin ${vaccin} est deja enregistree pour ce patient. Cochez la confirmation ci-dessous pour l'enregistrer quand meme.`,
        success: false,
        avertissementDoublon: true,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      const vaccinationCreee = await tx.vaccination.create({
        data: {
          patientId,
          professionnelId: professionnel.id,
          etablissementId: professionnel.etablissementId,
          vaccin,
          numeroDose,
          dateAdministration: new Date(dateAdministration),
          numeroLot,
          siteInjection,
          voie,
        },
      });

      await tx.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "creation_vaccination",
          donneeConcernee: `vaccination:${vaccinationCreee.id}`,
          adresseTechnique,
          justification: `Vaccination enregistree (${vaccin}, dose ${numeroDose}) pour le patient ${patientId}`,
        },
      });
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'enregistrement de la vaccination :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Retire une vaccination saisie par erreur (RG-CLI-100 du pack) : jamais une
 * modification ni une suppression, seulement un marquage motive
 * (saisieParErreur + motifRetrait). Reserve a l'auteur de la vaccination
 * (Zero Trust : verifie en base, jamais suppose depuis le role seul), et
 * requiert que le consentement du patient pour ce professionnel soit
 * toujours actif au moment du retrait.
 */
export async function retirerVaccinationAction(
  prevState: VaccinationActionState,
  formData: FormData
): Promise<VaccinationActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "vaccination"))) {
    return { error: "Action reservee aux medecins et infirmiers.", success: false };
  }

  const validation = schemaRetraitVaccination.safeParse({
    vaccinationId: texte(formData, "vaccinationId"),
    motif: texte(formData, "motif"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de retrait invalides."),
      success: false,
    };
  }

  const { vaccinationId, motif } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const vaccination = await prisma.vaccination.findUnique({ where: { id: vaccinationId } });

    if (!vaccination || vaccination.professionnelId !== professionnel.id) {
      return { error: "Cette vaccination est introuvable.", success: false };
    }

    if (vaccination.saisieParErreur) {
      return { error: "Cette vaccination a deja ete retiree.", success: false };
    }

    const consentementValide = await consentementActifPour(vaccination.patientId, session.userId);

    if (!consentementValide) {
      return {
        error:
          "Aucun consentement actif pour ce patient. Le patient doit d'abord vous autoriser depuis son espace.",
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.vaccination.update({
        where: { id: vaccination.id },
        data: { saisieParErreur: true, motifRetrait: motif },
      });

      await tx.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "retrait_vaccination",
          donneeConcernee: `vaccination:${vaccination.id}`,
          adresseTechnique,
          justification: `Vaccination retiree (saisie par erreur), motif : ${motif}`,
        },
      });
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du retrait de la vaccination :", erreur);
    return {
      error: "Une erreur est survenue lors du retrait de la vaccination. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Recupere l'historique des vaccinations d'un patient, du plus recent au
 * plus ancien. Zero Trust : verifie systematiquement qu'un Consentement
 * actif existe pour (patientId, professionnel connecte), jamais suppose
 * valide depuis un id transmis par le client ; retourne un tableau vide
 * plutot qu'une donnee partielle en cas de refus.
 */
export async function getVaccinationsDuPatient(patientId: string): Promise<VaccinationResume[]> {
  const session = await getSession();

  if (!session) {
    return [];
  }

  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const consentementValide = await consentementActifPour(patientId, session.userId);

  if (!consentementValide) {
    return [];
  }

  const vaccinations = await prisma.vaccination.findMany({
    where: { patientId },
    include: { professionnel: { include: { user: true } }, etablissement: true },
    orderBy: { dateAdministration: "desc" },
  });

  return vaccinations.map((vaccination) => ({
    id: vaccination.id,
    patientId: vaccination.patientId,
    vaccin: vaccination.vaccin,
    numeroDose: vaccination.numeroDose,
    dateAdministration: vaccination.dateAdministration.toISOString(),
    numeroLot: vaccination.numeroLot,
    siteInjection: vaccination.siteInjection,
    voie: vaccination.voie,
    voieLibelle: libelleVoie(vaccination.voie),
    professionnelNomComplet: nomCompletProfessionnel(vaccination.professionnel.user),
    etablissementNom: vaccination.etablissement.nom,
    saisieParErreur: vaccination.saisieParErreur,
    motifRetrait: vaccination.motifRetrait,
  }));
}
