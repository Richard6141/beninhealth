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
import { journaliser } from "@/modules/audit/journaliser";
import { publierEvenementPilotage } from "@/modules/pilotage/file-taches";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { MESSAGE_MODULE_INACTIF } from "@/modules/administration/modules-actifs";
import {
  controlerAgeVaccination,
  libelleVoie,
  LIEUX_VACCINATION,
  LONGUEUR_MIN_MOTIF_RETRAIT,
  VOIES_ADMINISTRATION_VALEURS,
  type LieuVaccination,
} from "./referentiel";

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface VaccinationActionState {
  error: string | null;
  success: boolean;
  // Rempli par enregistrerVaccinationAction quand la meme dose du meme
  // vaccin est deja enregistree pour ce patient : simple avertissement (pas
  // un blocage dur), le formulaire doit alors proposer la case de
  // confirmation avant de resoumettre.
  avertissementDoublon?: boolean;
  // Meme principe qu'avertissementDoublon, pour un age ou un intervalle en
  // dessous du minimum habituel du calendrier PEV (F-CLI-11, voir
  // controlerAgeVaccination dans referentiel.ts).
  avertissementAge?: boolean;
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
  lieu: string;
  nomCampagne: string | null;
  professionnelNomComplet: string;
  etablissementNom: string;
  saisieParErreur: boolean;
  motifRetrait: string | null;
}

/**
 * Resume d'une vaccination communautaire (F-COM-04), sur une fiche
 * PersonneCommunautaire plutot qu'un dossier Patient (voir la docstring du
 * modele Vaccination, prisma/schema.prisma). Interface distincte de
 * VaccinationResume ci-dessus : aucun champ propre au patient (identifiant
 * sante, etc.), qui n'existe pas pour cette population.
 */
export interface VaccinationCommunautaireResume {
  id: string;
  personneCommunautaireId: string;
  beneficiaireNomComplet: string;
  vaccin: string;
  numeroDose: number;
  dateAdministration: string; // ISO
  numeroLot: string;
  siteInjection: string;
  voie: string;
  voieLibelle: string;
  lieu: string;
  nomCampagne: string | null;
  agentNomComplet: string;
  saisieParErreur: boolean;
  motifRetrait: string | null;
}

const REGEX_DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Types de consentement qui autorisent a ECRIRE dans le carnet de vaccination (meme regle que la creation d'une consultation). */
const TYPES_ACCES_ECRITURE_VACCINATION = ["dossier_complet", "consultations"] as const;

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
  lieu: z.preprocess(
    (valeur) => (valeur === "" ? undefined : valeur),
    z.enum(LIEUX_VACCINATION, { message: "Le lieu est invalide." }).optional().default("etablissement")
  ),
  nomCampagne: z.string().trim().max(150, "150 caracteres maximum.").optional().default(""),
  confirmerDoublon: z.coerce.boolean().optional().default(false),
  confirmerAge: z.coerce.boolean().optional().default(false),
});

/** Nom de campagne obligatoire (5 caracteres au moins) uniquement quand lieu = "campagne" ; jamais conserve sinon. */
function motifCampagneValide(lieu: LieuVaccination, nomCampagne: string): { ok: true; nomCampagne: string | null } | { ok: false; error: string } {
  if (lieu !== "campagne") {
    return { ok: true, nomCampagne: null };
  }

  const nettoye = nomCampagne.trim().replace(/\s+/g, " ");
  if (nettoye.length < 3) {
    return { ok: false, error: "Le nom de la campagne est obligatoire (3 caracteres au moins)." };
  }

  return { ok: true, nomCampagne: nettoye };
}

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

/** F-COM-04 : meme forme que schemaEnregistrementVaccination, sur une PersonneCommunautaire plutot qu'un patientId. */
const schemaEnregistrementVaccinationCommunautaire = z.object({
  personneId: z.string().trim().min(1, "La personne est obligatoire."),
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
  // Defaut "campagne" (contrairement au parcours etablissement ci-dessus) :
  // le terrain est le cas d'usage habituel d'un agent communautaire (F-COM-04).
  lieu: z.preprocess(
    (valeur) => (valeur === "" ? undefined : valeur),
    z.enum(LIEUX_VACCINATION, { message: "Le lieu est invalide." }).optional().default("campagne")
  ),
  nomCampagne: z.string().trim().max(150, "150 caracteres maximum.").optional().default(""),
  confirmerDoublon: z.coerce.boolean().optional().default(false),
  confirmerAge: z.coerce.boolean().optional().default(false),
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
 * statut actif et date de fin non depassee (ou absente). Sans
 * typesAcceptes, tout type d'acces convient (lecture) ; pour une ECRITURE
 * (enregistrer ou retirer une vaccination), l'appelant passe
 * TYPES_ACCES_ECRITURE_VACCINATION : un consentement "urgence" ou limite a
 * un autre domaine (examens, documents...) ne donne pas le droit d'ecrire
 * dans le carnet de vaccination.
 */
async function consentementActifPour(
  patientId: string,
  acteurAutoriseId: string,
  typesAcceptes?: readonly string[]
): Promise<boolean> {
  const consentement = await prisma.consentement.findUnique({
    where: { patientId_acteurAutoriseId: { patientId, acteurAutoriseId } },
  });

  return (
    consentement !== null &&
    consentement.statut === "actif" &&
    (consentement.dateFin === null || consentement.dateFin > new Date()) &&
    (typesAcceptes === undefined || typesAcceptes.includes(consentement.typeAcces))
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
    lieu: texte(formData, "lieu"),
    nomCampagne: texte(formData, "nomCampagne"),
    confirmerDoublon: texte(formData, "confirmerDoublon"),
    confirmerAge: texte(formData, "confirmerAge"),
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
    lieu,
    confirmerDoublon,
    confirmerAge,
  } = validation.data;

  const aujourdHuiISO = new Date().toISOString().slice(0, 10);
  if (dateAdministration > aujourdHuiISO) {
    return { error: "La date d'administration ne peut pas etre dans le futur.", success: false };
  }

  const campagne = motifCampagneValide(lieu, validation.data.nomCampagne);
  if (!campagne.ok) {
    return { error: campagne.error, success: false };
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

    const consentementValide = await consentementActifPour(
      patientId,
      session.userId,
      TYPES_ACCES_ECRITURE_VACCINATION
    );

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

    const doseAnterieure =
      numeroDose > 1
        ? await prisma.vaccination.findFirst({
            where: { patientId, vaccin, numeroDose: numeroDose - 1, saisieParErreur: false },
            orderBy: { dateAdministration: "desc" },
          })
        : null;

    const controleAge = controlerAgeVaccination({
      vaccin,
      numeroDose,
      dateNaissance: patient.dateNaissance,
      dateAdministration: new Date(dateAdministration),
      dateDerniereDoseMemeVaccin: doseAnterieure?.dateAdministration ?? null,
    });

    if (!controleAge.conforme && !confirmerAge) {
      return {
        error: `${controleAge.message} Cochez la confirmation ci-dessous pour l'enregistrer quand meme.`,
        success: false,
        avertissementAge: true,
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
          lieu,
          nomCampagne: campagne.nomCampagne,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_vaccination",
          donneeConcernee: `vaccination:${vaccinationCreee.id}`,
          adresseTechnique,
          justification: `Vaccination enregistree (${vaccin}, dose ${numeroDose}) pour le patient ${patientId}`,
        },
        tx
      );

      // F-PIL-07 : publie l'evenement qui declenchera le recalcul de IND-10
      // (vaccinations) du jour et de l'etablissement concernes.
      await publierEvenementPilotage(tx, {
        type: "vaccination",
        date: vaccinationCreee.dateAdministration,
        etablissementId: vaccinationCreee.etablissementId,
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

    // F-COM-04 : une vaccination communautaire (personneCommunautaireId, jamais de
    // Consentement pour une fiche sans compte) ne passe pas par ce controle ;
    // vaccination.professionnelId === professionnel.id ci-dessus suffit deja
    // (meme garde d'auteur que src/modules/communautaire/actions.ts).
    if (vaccination.patientId !== null) {
      const consentementValide = await consentementActifPour(
        vaccination.patientId,
        session.userId,
        TYPES_ACCES_ECRITURE_VACCINATION
      );

      if (!consentementValide) {
        return {
          error:
            "Aucun consentement actif pour ce patient. Le patient doit d'abord vous autoriser depuis son espace.",
          success: false,
        };
      }
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.vaccination.update({
        where: { id: vaccination.id },
        data: { saisieParErreur: true, motifRetrait: motif },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "retrait_vaccination",
          donneeConcernee: `vaccination:${vaccination.id}`,
          adresseTechnique,
          justification: `Vaccination retiree (saisie par erreur), motif : ${motif}`,
        },
        tx
      );
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

/** Meme forme de resume construite par getVaccinationsDuPatient et getMesVaccinations ci-dessous. */
function versVaccinationResume(vaccination: {
  id: string;
  patientId: string | null;
  vaccin: string;
  numeroDose: number;
  dateAdministration: Date;
  numeroLot: string;
  siteInjection: string;
  voie: string;
  lieu: string;
  nomCampagne: string | null;
  saisieParErreur: boolean;
  motifRetrait: string | null;
  professionnel: { user: { nom: string; prenom: string } };
  etablissement: { nom: string };
}): VaccinationResume {
  return {
    id: vaccination.id,
    // Non nul par construction : les deux appelantes filtrent where: { patientId }.
    patientId: vaccination.patientId as string,
    vaccin: vaccination.vaccin,
    numeroDose: vaccination.numeroDose,
    dateAdministration: vaccination.dateAdministration.toISOString(),
    numeroLot: vaccination.numeroLot,
    siteInjection: vaccination.siteInjection,
    voie: vaccination.voie,
    voieLibelle: libelleVoie(vaccination.voie),
    lieu: vaccination.lieu,
    nomCampagne: vaccination.nomCampagne,
    professionnelNomComplet: nomCompletProfessionnel(vaccination.professionnel.user),
    etablissementNom: vaccination.etablissement.nom,
    saisieParErreur: vaccination.saisieParErreur,
    motifRetrait: vaccination.motifRetrait,
  };
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

  return vaccinations.map(versVaccinationResume);
}

/**
 * Recupere l'historique des vaccinations du patient connecte, pour son
 * propre dossier (F-CIT-13 : export de mes donnees). Contrairement a
 * getVaccinationsDuPatient, aucun controle de consentement ici : un patient
 * a toujours acces a ses propres donnees.
 */
export async function getMesVaccinations(): Promise<VaccinationResume[]> {
  const session = await getSession();

  if (!session) {
    return [];
  }

  const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

  if (!patient) {
    return [];
  }

  const vaccinations = await prisma.vaccination.findMany({
    where: { patientId: patient.id },
    include: { professionnel: { include: { user: true } }, etablissement: true },
    orderBy: { dateAdministration: "desc" },
  });

  return vaccinations.map(versVaccinationResume);
}

/**
 * Enregistre une vaccination administree en campagne / strategie avancee par
 * un agent communautaire (F-COM-04 du pack), sur une fiche
 * PersonneCommunautaire : jamais un dossier Patient (agent_communautaire n'a
 * aucune permission read:patient, voir src/security/permissions.ts). Reserve
 * au role agent_communautaire specifiquement : create:vaccination est aussi
 * accorde a medecin/infirmier, mais pour l'action ci-dessus
 * (enregistrerVaccinationAction), pas celle-ci. Meme mecanique de controles
 * que le parcours etablissement (doublon, age du calendrier PEV,
 * avertissements confirmables), sans controle de consentement (une fiche
 * communautaire n'en a pas, l'agent qui l'a enregistree ou tout agent du
 * meme etablissement peut y ecrire, meme regle que
 * src/modules/communautaire/actions.ts).
 */
export async function enregistrerVaccinationCommunautaireAction(
  prevState: VaccinationActionState,
  formData: FormData
): Promise<VaccinationActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.includes("agent_communautaire")) {
    return { error: "Action reservee aux agents communautaires.", success: false };
  }

  if (!(await estFonctionnaliteActive("community.module"))) {
    return { error: MESSAGE_MODULE_INACTIF, success: false };
  }

  const validation = schemaEnregistrementVaccinationCommunautaire.safeParse({
    personneId: texte(formData, "personneId"),
    vaccin: texte(formData, "vaccin"),
    numeroDose: texte(formData, "numeroDose"),
    dateAdministration: texte(formData, "dateAdministration"),
    numeroLot: texte(formData, "numeroLot"),
    siteInjection: texte(formData, "siteInjection"),
    voie: texte(formData, "voie"),
    lieu: texte(formData, "lieu"),
    nomCampagne: texte(formData, "nomCampagne"),
    confirmerDoublon: texte(formData, "confirmerDoublon"),
    confirmerAge: texte(formData, "confirmerAge"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de vaccination invalides."),
      success: false,
    };
  }

  const {
    personneId,
    vaccin,
    numeroDose,
    dateAdministration,
    numeroLot,
    siteInjection,
    voie,
    lieu,
    confirmerDoublon,
    confirmerAge,
  } = validation.data;

  const aujourdHuiISO = new Date().toISOString().slice(0, 10);
  if (dateAdministration > aujourdHuiISO) {
    return { error: "La date d'administration ne peut pas etre dans le futur.", success: false };
  }

  const campagne = motifCampagneValide(lieu, validation.data.nomCampagne);
  if (!campagne.ok) {
    return { error: campagne.error, success: false };
  }

  try {
    const agent = await professionnelDeLaSessionCourante();

    if (!agent) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const personne = await prisma.personneCommunautaire.findUnique({ where: { id: personneId } });

    if (!personne || personne.etablissementId !== agent.etablissementId) {
      return { error: "Personne introuvable.", success: false };
    }

    const doublon = await prisma.vaccination.findFirst({
      where: { personneCommunautaireId: personne.id, vaccin, numeroDose, saisieParErreur: false },
    });

    if (doublon && !confirmerDoublon) {
      return {
        error: `La dose ${numeroDose} du vaccin ${vaccin} est deja enregistree pour cette personne. Cochez la confirmation ci-dessous pour l'enregistrer quand meme.`,
        success: false,
        avertissementDoublon: true,
      };
    }

    const doseAnterieure =
      numeroDose > 1
        ? await prisma.vaccination.findFirst({
            where: { personneCommunautaireId: personne.id, vaccin, numeroDose: numeroDose - 1, saisieParErreur: false },
            orderBy: { dateAdministration: "desc" },
          })
        : null;

    const controleAge = controlerAgeVaccination({
      vaccin,
      numeroDose,
      dateNaissance: personne.dateNaissance,
      dateAdministration: new Date(dateAdministration),
      dateDerniereDoseMemeVaccin: doseAnterieure?.dateAdministration ?? null,
    });

    if (!controleAge.conforme && !confirmerAge) {
      return {
        error: `${controleAge.message} Cochez la confirmation ci-dessous pour l'enregistrer quand meme.`,
        success: false,
        avertissementAge: true,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const beneficiaireNomComplet = `${personne.prenom} ${personne.nom}`;

    await prisma.$transaction(async (tx) => {
      const vaccinationCreee = await tx.vaccination.create({
        data: {
          personneCommunautaireId: personne.id,
          professionnelId: agent.id,
          etablissementId: agent.etablissementId,
          vaccin,
          numeroDose,
          dateAdministration: new Date(dateAdministration),
          numeroLot,
          siteInjection,
          voie,
          lieu,
          nomCampagne: campagne.nomCampagne,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_vaccination_communautaire",
          donneeConcernee: `vaccination:${vaccinationCreee.id}`,
          adresseTechnique,
          justification: `Vaccination communautaire enregistree (${vaccin}, dose ${numeroDose}) pour ${beneficiaireNomComplet}`,
        },
        tx
      );

      // F-PIL-07 : IND-10 compte deja les vaccinations communautaires
      // (F-COM-04), qui doivent donc publier le meme evenement que la
      // vaccination en etablissement pour declencher leur recalcul.
      await publierEvenementPilotage(tx, {
        type: "vaccination",
        date: vaccinationCreee.dateAdministration,
        etablissementId: vaccinationCreee.etablissementId,
      });
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'enregistrement de la vaccination communautaire :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Historique des vaccinations communautaires d'une personne enregistree
 * (F-COM-04), pour l'agent connecte : verifie que la personne appartient au
 * meme etablissement (meme regle que creerSuiviCommunautaireAction), jamais
 * suppose depuis le seul role.
 */
export async function getVaccinationsDeLaPersonneCommunautaire(
  personneId: string
): Promise<VaccinationCommunautaireResume[]> {
  const session = await getSession();

  if (!session || !session.roles.includes("agent_communautaire")) {
    return [];
  }

  const agent = await professionnelDeLaSessionCourante();

  if (!agent) {
    return [];
  }

  const personne = await prisma.personneCommunautaire.findUnique({ where: { id: personneId } });

  if (!personne || personne.etablissementId !== agent.etablissementId) {
    return [];
  }

  const vaccinations = await prisma.vaccination.findMany({
    where: { personneCommunautaireId: personneId },
    include: { professionnel: { include: { user: true } } },
    orderBy: { dateAdministration: "desc" },
  });

  return vaccinations.map((vaccination) => ({
    id: vaccination.id,
    personneCommunautaireId: personneId,
    beneficiaireNomComplet: `${personne.prenom} ${personne.nom}`,
    vaccin: vaccination.vaccin,
    numeroDose: vaccination.numeroDose,
    dateAdministration: vaccination.dateAdministration.toISOString(),
    numeroLot: vaccination.numeroLot,
    siteInjection: vaccination.siteInjection,
    voie: vaccination.voie,
    voieLibelle: libelleVoie(vaccination.voie),
    lieu: vaccination.lieu,
    nomCampagne: vaccination.nomCampagne,
    agentNomComplet: nomCompletProfessionnel(vaccination.professionnel.user),
    saisieParErreur: vaccination.saisieParErreur,
    motifRetrait: vaccination.motifRetrait,
  }));
}
