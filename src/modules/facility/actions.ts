"use server";

/**
 * Server Actions du module facility : etablissements sanitaires et rendez-vous.
 * Contrat d'integration Phase 4, consomme par les ecrans
 * src/app/app/patient/** et src/app/app/medecin/** (autres agents).
 *
 * Meme principe applique de bout en bout que src/modules/patient/actions.ts :
 * Zero Trust. Le patient ou le professionnel courant est toujours derive de
 * getSession(), jamais d'un id transmis par le client dans un formulaire.
 * Toute lecture ou modification d'un rendez-vous identifie par un id transmis
 * (rendezVousId) verifie explicitement que ce rendez-vous appartient bien a
 * l'utilisateur connecte avant d'agir. Toute creation ou modification de
 * rendez-vous est tracee dans JournalAudit.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { dateDepuisChaineLocaleBenin } from "@/lib/fuseau-horaire";
import { dateDansUnCreneauDisponible } from "./creneau-disponible";
import { creerNotification } from "@/modules/notification/creer";
import {
  STATUTS_QUI_LIBERENT_LE_CRENEAU,
  estConflitDeCreneau,
  MESSAGE_CRENEAU_PRIS,
  TRANSITIONS,
  transitionnerRendezVous,
} from "./rendez-vous-etats";
import {
  MAX_DEPLACEMENTS,
  MESSAGE_DEPLACEMENTS_EPUISES,
  MESSAGE_ETABLISSEMENT_INACTIF,
  MOTIFS_REFUS_RENDEZ_VOUS,
  annulationPatientPossible,
  deplacementPossible,
  messageAnnulationTardive,
} from "./regles-rendez-vous";
import { verifierReglesReservation } from "./regles-reservation";

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface FacilityActionState {
  error: string | null;
  success: boolean;
}

/** Etablissement sanitaire, pret a peupler un selecteur cote ecran. */
export interface EtablissementOption {
  id: string;
  nom: string;
  type: string;
  localisation: string;
}

/** Professionnel de sante valide, rattache a un etablissement donne. */
export interface ProfessionnelOption {
  id: string;
  nomComplet: string;
  specialite: string;
  etablissementId: string;
}

/** Resume d'un rendez-vous, pret a afficher cote ecran patient ou professionnel. */
export interface RendezVousResume {
  id: string;
  date: string; // ISO
  motif: string;
  statut: string;
  etablissementNom: string;
  /** Pour l'invitation a appeler l'etablissement apres le delai d'annulation (RG-RDV-10). */
  etablissementTelephone: string | null;
  professionnelNomComplet: string | null;
  professionnelSpecialite: string | null;
  professionnelAvatarUrl: string | null;
  patientNomComplet: string | null; // rempli seulement pour les fonctions cote professionnel, null cote patient
  patientAvatarUrl: string | null; // idem
  patientId: string;
  /** Motif transmis au patient quand l'etablissement a refuse la demande (statut "refuse"). */
  motifRefus: string | null;
  /** RG-RDV-11 : nombre de deplacements deja effectues (2 au maximum). */
  nombreDeplacements: number;
}

const schemaCreationRendezVous = z.object({
  etablissementId: z.string().trim().min(1, "L'etablissement est obligatoire."),
  professionnelId: z.string().trim().optional().default(""),
  date: z
    .string()
    .trim()
    .min(1, "La date est obligatoire.")
    // Interpretee comme une heure LOCALE Africa/Porto-Novo (RG-ETA-43), jamais
    // le fuseau du serveur : voir src/lib/fuseau-horaire.ts.
    .refine((valeur) => !Number.isNaN(dateDepuisChaineLocaleBenin(valeur).getTime()), "Date invalide.")
    .refine(
      (valeur) => dateDepuisChaineLocaleBenin(valeur).getTime() > Date.now(),
      "La date du rendez-vous doit etre dans le futur."
    ),
  motif: z.string().trim().min(1, "Le motif est obligatoire."),
});

const schemaIdRendezVous = z.object({
  rendezVousId: z.string().trim().min(1, "Le rendez-vous est obligatoire."),
});

const schemaDeplacementRendezVous = z.object({
  rendezVousId: z.string().trim().min(1, "Le rendez-vous est obligatoire."),
  date: z
    .string()
    .trim()
    .min(1, "La date est obligatoire.")
    .refine((valeur) => !Number.isNaN(dateDepuisChaineLocaleBenin(valeur).getTime()), "Date invalide."),
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

/** Recupere le profil ProfessionnelSante (avec son utilisateur) du titulaire de la session courante, ou null si absent. */
async function professionnelDeLaSessionCourante() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  return prisma.professionnelSante.findUnique({
    where: { userId: session.userId },
    include: { user: true },
  });
}

/** Liste tous les etablissements sanitaires, pour peupler le selecteur de prise de rendez-vous. */
export async function listEtablissements(): Promise<EtablissementOption[]> {
  const etablissements = await prisma.etablissementSanitaire.findMany({
    orderBy: { nom: "asc" },
  });

  return etablissements.map((etablissement) => ({
    id: etablissement.id,
    nom: etablissement.nom,
    type: etablissement.type,
    localisation: etablissement.localisation,
  }));
}

/**
 * Liste les professionnels de sante valides rattaches a un etablissement.
 * Filtre statutValidation "valide" uniquement.
 */
export async function listProfessionnelsParEtablissement(
  etablissementId: string
): Promise<ProfessionnelOption[]> {
  const professionnels = await prisma.professionnelSante.findMany({
    where: { etablissementId, statutValidation: "valide" },
    include: { user: true },
    orderBy: { user: { nom: "asc" } },
  });

  return professionnels.map((professionnel) => ({
    id: professionnel.id,
    nomComplet: nomCompletProfessionnel(professionnel.user),
    specialite: professionnel.specialite,
    etablissementId: professionnel.etablissementId,
  }));
}

/**
 * Recupere tous les rendez-vous du patient connecte (derive de getSession(),
 * jamais d'id en parametre), tries par date croissante.
 */
export async function getMesRendezVous(): Promise<RendezVousResume[]> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return [];
  }

  const rendezVous = await prisma.rendezVous.findMany({
    where: { patientId: patient.id },
    include: { etablissement: true, professionnel: { include: { user: true } } },
    orderBy: { date: "asc" },
  });

  return rendezVous.map((rdv) => versResume(rdv, null));
}

/**
 * Cree une demande de rendez-vous pour le patient connecte. Valide les
 * donnees avec zod, verifie que l'etablissement (et, s'il est precise, le
 * professionnel) existent reellement avant creation (Zero Trust : un id
 * transmis par le client n'est jamais suppose valide). Statut initial :
 * "demande". Trace la creation dans JournalAudit.
 */
export async function creerRendezVousAction(
  prevState: FacilityActionState,
  formData: FormData
): Promise<FacilityActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaCreationRendezVous.safeParse({
    etablissementId: texte(formData, "etablissementId"),
    professionnelId: texte(formData, "professionnelId"),
    date: texte(formData, "date"),
    motif: texte(formData, "motif"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de rendez-vous invalides."),
      success: false,
    };
  }

  const { etablissementId, professionnelId, date, motif } = validation.data;
  // Instant UTC reel du rendez-vous, calcule une seule fois ici et reutilise
  // partout ci-dessous (disponibilite, doublon, creation) : voir
  // src/lib/fuseau-horaire.ts, la chaine soumise est une heure LOCALE
  // Africa/Porto-Novo, jamais le fuseau du serveur.
  const dateRendezVous = dateDepuisChaineLocaleBenin(date);

  try {
    const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

    if (!patient) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const etablissement = await prisma.etablissementSanitaire.findUnique({
      where: { id: etablissementId },
    });

    if (!etablissement) {
      return { error: "Cet etablissement est introuvable.", success: false };
    }

    if (etablissement.statut !== "actif") {
      return { error: MESSAGE_ETABLISSEMENT_INACTIF, success: false };
    }

    // RG-RDV-01 (1 h a 30 jours), RG-RDV-02 (3 rendez-vous futurs), un seul
    // rendez-vous par jour et par etablissement.
    const refusRegles = await verifierReglesReservation({
      patientId: patient.id,
      etablissementId,
      date: dateRendezVous,
    });

    if (refusRegles) {
      return { error: refusRegles, success: false };
    }

    const professionnelIdNettoye = professionnelId.trim();

    if (professionnelIdNettoye.length > 0) {
      const professionnel = await prisma.professionnelSante.findUnique({
        where: { id: professionnelIdNettoye },
      });

      if (
        !professionnel ||
        professionnel.etablissementId !== etablissementId ||
        professionnel.statutValidation !== "valide"
      ) {
        return {
          error: "Ce professionnel de sante n'est pas disponible dans cet etablissement.",
          success: false,
        };
      }

      // F-ETA-05 (RG-ETA-43) : hors des creneaux qu'il a definis, si il en a
      // defini au moins un (voir la limite assumee documentee dans
      // src/modules/facility/disponibilites.ts pour un professionnel sans
      // aucun creneau configure).
      const disponible = await dateDansUnCreneauDisponible(professionnelIdNettoye, dateRendezVous);
      if (!disponible) {
        return {
          error: "Ce professionnel n'est pas disponible à cette heure. Merci de choisir un autre créneau.",
          success: false,
        };
      }

      // Empeche un double rendez-vous au meme professionnel et au meme
      // instant (capacite 1, perimetre reduit F-ETA-05 : pas de gestion de
      // plusieurs patients en parallele sur un meme creneau).
      const dejaPris = await prisma.rendezVous.findFirst({
        where: {
          professionnelId: professionnelIdNettoye,
          date: dateRendezVous,
          statut: { notIn: [...STATUTS_QUI_LIBERENT_LE_CRENEAU] },
        },
      });
      if (dejaPris) {
        return { error: MESSAGE_CRENEAU_PRIS, success: false };
      }
    }

    const adresseTechnique = await adresseTechniqueCourante();

    // Creation et journal dans la meme transaction : pas de rendez-vous sans trace d'audit.
    await prisma.$transaction(async (tx) => {
      const rendezVous = await tx.rendezVous.create({
        data: {
          patientId: patient.id,
          etablissementId,
          professionnelId: professionnelIdNettoye.length > 0 ? professionnelIdNettoye : null,
          date: dateRendezVous,
          motif,
          statut: "demande",
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation",
          donneeConcernee: `rendez_vous:${rendezVous.id}`,
          adresseTechnique,
          justification: `Demande de rendez-vous creee aupres de l'etablissement ${etablissementId}`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    // RG-RDV-03 : le controle ci-dessus est une courtoisie ; c'est l'index
    // unique partiel de la base qui garantit l'absence de double reservation
    // quand deux demandes arrivent en meme temps.
    if (estConflitDeCreneau(erreur)) {
      return { error: MESSAGE_CRENEAU_PRIS, success: false };
    }
    console.error("Erreur lors de la creation du rendez-vous :", erreur);
    return {
      error: "Une erreur est survenue lors de la creation du rendez-vous. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Annule un rendez-vous a l'initiative du patient connecte. Verifie d'abord
 * que ce rendez-vous appartient bien au patient connecte (Zero Trust) avant
 * toute modification. RG-RDV-10 : possible jusqu'a 2 heures avant le
 * rendez-vous, ensuite le patient est invite a appeler l'etablissement.
 * Trace la modification dans JournalAudit.
 */
export async function annulerRendezVousAction(
  prevState: FacilityActionState,
  formData: FormData
): Promise<FacilityActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaIdRendezVous.safeParse({
    rendezVousId: texte(formData, "rendezVousId"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Rendez-vous invalide."),
      success: false,
    };
  }

  const { rendezVousId } = validation.data;

  try {
    const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

    if (!patient) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const rendezVous = await prisma.rendezVous.findUnique({
      where: { id: rendezVousId },
      include: { etablissement: true },
    });

    if (!rendezVous || rendezVous.patientId !== patient.id) {
      return { error: "Ce rendez-vous est introuvable.", success: false };
    }

    if (!annulationPatientPossible(rendezVous.date, new Date())) {
      return { error: messageAnnulationTardive(rendezVous.etablissement.telephoneEtablissement), success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    const annule = await prisma.$transaction(async (tx) => {
      if (!(await transitionnerRendezVous(tx, rendezVous.id, "annuler"))) return false;
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "modification",
          donneeConcernee: `rendez_vous:${rendezVous.id}`,
          adresseTechnique,
          justification: "Rendez-vous annule par le patient",
        },
        tx
      );
      return true;
    });

    if (!annule) {
      return { error: TRANSITIONS.annuler.refus, success: false };
    }

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'annulation du rendez-vous :", erreur);
    return {
      error: "Une erreur est survenue lors de l'annulation du rendez-vous. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Deplace un rendez-vous du patient connecte (F-RDV-02, RG-RDV-11) : le
 * nouveau rendez-vous est cree AVANT l'annulation de l'ancien, dans la meme
 * transaction (si le nouveau echoue, l'ancien est conserve). Deux deplacements
 * au plus ; les memes regles de fenetre, de plafond, de jour et de creneau que
 * pour une prise de rendez-vous s'appliquent, le rendez-vous remplace n'etant
 * pas compte. Limite assumee : le nouveau rendez-vous repart au statut
 * "demande" (l'etablissement doit le confirmer de nouveau).
 */
export async function deplacerRendezVousAction(
  prevState: FacilityActionState,
  formData: FormData
): Promise<FacilityActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaDeplacementRendezVous.safeParse({
    rendezVousId: texte(formData, "rendezVousId"),
    date: texte(formData, "date"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de deplacement invalides."),
      success: false,
    };
  }

  const { rendezVousId, date } = validation.data;
  const nouvelleDate = dateDepuisChaineLocaleBenin(date);

  try {
    const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

    if (!patient) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const ancien = await prisma.rendezVous.findUnique({
      where: { id: rendezVousId },
      include: { etablissement: true },
    });

    if (!ancien || ancien.patientId !== patient.id) {
      return { error: "Ce rendez-vous est introuvable.", success: false };
    }

    if (!(TRANSITIONS.annuler.depuis as readonly string[]).includes(ancien.statut)) {
      return { error: "Ce rendez-vous ne peut plus être déplacé.", success: false };
    }

    const maintenant = new Date();

    if (!annulationPatientPossible(ancien.date, maintenant)) {
      return { error: messageAnnulationTardive(ancien.etablissement.telephoneEtablissement), success: false };
    }

    if (!deplacementPossible(ancien.nombreDeplacements)) {
      return { error: MESSAGE_DEPLACEMENTS_EPUISES, success: false };
    }

    if (ancien.etablissement.statut !== "actif") {
      return { error: MESSAGE_ETABLISSEMENT_INACTIF, success: false };
    }

    const refusRegles = await verifierReglesReservation({
      patientId: patient.id,
      etablissementId: ancien.etablissementId,
      date: nouvelleDate,
      rendezVousRemplaceId: ancien.id,
      maintenant,
    });

    if (refusRegles) {
      return { error: refusRegles, success: false };
    }

    if (ancien.professionnelId) {
      if (!(await dateDansUnCreneauDisponible(ancien.professionnelId, nouvelleDate))) {
        return {
          error: "Ce professionnel n'est pas disponible à cette heure. Merci de choisir un autre créneau.",
          success: false,
        };
      }

      const dejaPris = await prisma.rendezVous.findFirst({
        where: {
          professionnelId: ancien.professionnelId,
          date: nouvelleDate,
          statut: { notIn: [...STATUTS_QUI_LIBERENT_LE_CRENEAU] },
        },
      });
      if (dejaPris) {
        return { error: MESSAGE_CRENEAU_PRIS, success: false };
      }
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      const nouveau = await tx.rendezVous.create({
        data: {
          patientId: patient.id,
          etablissementId: ancien.etablissementId,
          professionnelId: ancien.professionnelId,
          date: nouvelleDate,
          motif: ancien.motif,
          statut: "demande",
          nombreDeplacements: ancien.nombreDeplacements + 1,
        },
      });

      if (!(await transitionnerRendezVous(tx, ancien.id, "annuler"))) {
        throw new Error("DEPLACEMENT_ANCIEN_NON_ANNULABLE");
      }

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "deplacement_rendez_vous",
          donneeConcernee: `rendez_vous:${nouveau.id}`,
          adresseTechnique,
          justification: `Rendez-vous ${ancien.id} deplace (deplacement ${ancien.nombreDeplacements + 1} sur ${MAX_DEPLACEMENTS}) : nouveau rendez-vous ${nouveau.id}`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    if (estConflitDeCreneau(erreur)) {
      return { error: MESSAGE_CRENEAU_PRIS, success: false };
    }
    if (erreur instanceof Error && erreur.message === "DEPLACEMENT_ANCIEN_NON_ANNULABLE") {
      return { error: TRANSITIONS.annuler.refus, success: false };
    }
    console.error("Erreur lors du deplacement du rendez-vous :", erreur);
    return {
      error: "Une erreur est survenue lors du déplacement du rendez-vous. Veuillez réessayer.",
      success: false,
    };
  }
}

/** Resume affichable d'un rendez-vous charge avec son etablissement et, si present, son professionnel. */
interface RendezVousCharge {
  id: string;
  date: Date;
  motif: string;
  statut: string;
  patientId: string;
  motifRefus: string | null;
  nombreDeplacements: number;
  etablissement: { nom: string; telephoneEtablissement: string | null };
  professionnel: { specialite: string; user: { nom: string; prenom: string; avatarUrl: string | null } } | null;
}

function versResume(
  rdv: RendezVousCharge,
  patientUser: { nom: string; prenom: string; avatarUrl: string | null } | null
): RendezVousResume {
  return {
    id: rdv.id,
    date: rdv.date.toISOString(),
    motif: rdv.motif,
    statut: rdv.statut,
    etablissementNom: rdv.etablissement.nom,
    etablissementTelephone: rdv.etablissement.telephoneEtablissement,
    professionnelNomComplet: rdv.professionnel ? nomCompletProfessionnel(rdv.professionnel.user) : null,
    professionnelSpecialite: rdv.professionnel?.specialite ?? null,
    professionnelAvatarUrl: rdv.professionnel?.user.avatarUrl ?? null,
    patientNomComplet: patientUser ? nomComplet(patientUser) : null,
    patientAvatarUrl: patientUser?.avatarUrl ?? null,
    patientId: rdv.patientId,
    motifRefus: rdv.motifRefus,
    nombreDeplacements: rdv.nombreDeplacements,
  };
}

/**
 * Recupere tous les rendez-vous du professionnel connecte (derive de
 * getSession() -> ProfessionnelSante lie), tries par date croissante.
 * patientNomComplet est rempli (nom et prenom du User lie au Patient).
 */
export async function getRendezVousDuProfessionnel(): Promise<RendezVousResume[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const rendezVous = await prisma.rendezVous.findMany({
    where: { professionnelId: professionnel.id },
    include: {
      etablissement: true,
      patient: { include: { user: true } },
      professionnel: { include: { user: true } },
    },
    orderBy: { date: "asc" },
  });

  return rendezVous.map((rdv) => versResume(rdv, rdv.patient.user));
}

/**
 * Recupere les rendez-vous confirmes ou en attente de tout l'etablissement du
 * professionnel connecte (derive de getSession() -> ProfessionnelSante lie),
 * tries par date croissante. A la difference de getRendezVousDuProfessionnel
 * (filtre sur professionnelId = moi), cette fonction repose sur
 * l'etablissement : necessaire pour un role qui n'est jamais lui-meme titulaire
 * d'un rendez-vous (RendezVous.professionnelId designe toujours le medecin
 * choisi par le patient), comme l'infirmier (F-CLI-12 du pack : prise en
 * charge infirmiere avant la consultation, peu importe quel medecin de
 * l'etablissement recevra ensuite le patient).
 */
export async function getRendezVousDeLEtablissementDuProfessionnel(): Promise<RendezVousResume[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const rendezVous = await prisma.rendezVous.findMany({
    where: {
      etablissementId: professionnel.etablissementId,
      statut: { in: ["demande", "confirme"] },
    },
    include: {
      etablissement: true,
      patient: { include: { user: true } },
      professionnel: { include: { user: true } },
    },
    orderBy: { date: "asc" },
  });

  return rendezVous.map((rdv) => versResume(rdv, rdv.patient.user));
}

/**
 * Rendez-vous que le professionnel connecte peut traiter (F-RDV-03) : le
 * sien, ou n'importe lequel de son etablissement pour un administrateur
 * d'etablissement, qui tient ici le role d'accueil (RECEPTIONIST absent de ce
 * depot) et peut donc traiter aussi un rendez-vous sans praticien choisi.
 */
async function rendezVousTraitable(session: { userId: string; roles: string[] }, rendezVousId: string) {
  const professionnel = await prisma.professionnelSante.findUnique({ where: { userId: session.userId } });

  if (!professionnel) {
    return { erreur: "Aucun profil professionnel associe a ce compte.", professionnel: null, rendezVous: null } as const;
  }

  const rendezVous = await prisma.rendezVous.findUnique({
    where: { id: rendezVousId },
    include: { patient: true },
  });

  const estAccueil =
    session.roles.includes("admin_etablissement") && rendezVous?.etablissementId === professionnel.etablissementId;

  if (!rendezVous || (rendezVous.professionnelId !== professionnel.id && !estAccueil)) {
    return { erreur: "Ce rendez-vous est introuvable.", professionnel: null, rendezVous: null } as const;
  }

  return { erreur: null, professionnel, rendezVous } as const;
}

/** Une notification manquee ne doit jamais faire echouer une decision deja actee en base. */
async function prevenirPatient(userId: string, type: string, message: string): Promise<void> {
  try {
    await creerNotification(userId, type, message, "/app/patient/rendez-vous");
  } catch (erreur) {
    console.error("Erreur lors de la notification du patient :", erreur);
  }
}

function dateLisible(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Porto-Novo",
  });
}

/**
 * Confirme un rendez-vous a l'initiative du professionnel assigne ou de
 * l'accueil de l'etablissement. Verifie d'abord que ce rendez-vous lui
 * revient (Zero Trust) avant toute modification. Trace la modification dans
 * JournalAudit.
 */
export async function confirmerRendezVousAction(
  prevState: FacilityActionState,
  formData: FormData
): Promise<FacilityActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaIdRendezVous.safeParse({
    rendezVousId: texte(formData, "rendezVousId"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Rendez-vous invalide."),
      success: false,
    };
  }

  try {
    const cible = await rendezVousTraitable(session, validation.data.rendezVousId);

    if (cible.erreur) {
      return { error: cible.erreur, success: false };
    }

    const { rendezVous } = cible;
    const adresseTechnique = await adresseTechniqueCourante();

    const confirme = await prisma.$transaction(async (tx) => {
      if (!(await transitionnerRendezVous(tx, rendezVous.id, "confirmer"))) return false;
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "modification",
          donneeConcernee: `rendez_vous:${rendezVous.id}`,
          adresseTechnique,
          justification: "Rendez-vous confirme par le professionnel de sante ou l'accueil",
        },
        tx
      );
      return true;
    });

    if (!confirme) {
      return { error: TRANSITIONS.confirmer.refus, success: false };
    }

    await prevenirPatient(rendezVous.patient.userId, "rendez_vous_confirme", `Votre rendez-vous du ${dateLisible(rendezVous.date)} a été confirmé.`);

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la confirmation du rendez-vous :", erreur);
    return {
      error: "Une erreur est survenue lors de la confirmation du rendez-vous. Veuillez reessayer.",
      success: false,
    };
  }
}

const schemaRefusRendezVous = z
  .object({
    rendezVousId: z.string().trim().min(1, "Le rendez-vous est obligatoire."),
    motif: z.enum(MOTIFS_REFUS_RENDEZ_VOUS.map((m) => m.code) as [string, ...string[]], { message: "Choisissez un motif de refus." }),
    precision: z.string().trim().max(200, "200 caractères maximum."),
  })
  .refine((donnees) => donnees.motif !== "autre" || donnees.precision.length >= 5, {
    message: "Pour « Autre motif », précisez au moins 5 caractères.",
    path: ["precision"],
  });

/**
 * Refuse une demande de rendez-vous en attente (F-RDV-03), motif obligatoire
 * transmis au patient. Le creneau est libere (statut "refuse").
 */
export async function refuserRendezVousAction(
  prevState: FacilityActionState,
  formData: FormData
): Promise<FacilityActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaRefusRendezVous.safeParse({
    rendezVousId: texte(formData, "rendezVousId"),
    motif: texte(formData, "motif"),
    precision: texte(formData, "precision"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de refus invalides."),
      success: false,
    };
  }

  try {
    const cible = await rendezVousTraitable(session, validation.data.rendezVousId);

    if (cible.erreur) {
      return { error: cible.erreur, success: false };
    }

    const { rendezVous } = cible;
    const libelle = MOTIFS_REFUS_RENDEZ_VOUS.find((m) => m.code === validation.data.motif)?.libelle ?? validation.data.motif;
    const motifRefus = validation.data.precision ? `${libelle} : ${validation.data.precision}` : libelle;
    const adresseTechnique = await adresseTechniqueCourante();

    const refuse = await prisma.$transaction(async (tx) => {
      if (!(await transitionnerRendezVous(tx, rendezVous.id, "refuser", { donnees: { motifRefus } }))) return false;
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "refus_rendez_vous",
          donneeConcernee: `rendez_vous:${rendezVous.id}`,
          adresseTechnique,
          justification: `Demande de rendez-vous refusee : ${motifRefus}`,
        },
        tx
      );
      return true;
    });

    if (!refuse) {
      return { error: TRANSITIONS.refuser.refus, success: false };
    }

    await prevenirPatient(
      rendezVous.patient.userId,
      "rendez_vous_refuse",
      `Votre demande de rendez-vous du ${dateLisible(rendezVous.date)} a été refusée. Motif : ${motifRefus}`
    );

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du refus du rendez-vous :", erreur);
    return {
      error: "Une erreur est survenue lors du refus du rendez-vous. Veuillez réessayer.",
      success: false,
    };
  }
}

/**
 * Annule un rendez-vous a l'initiative du professionnel assigne ou de
 * l'accueil. Meme verification d'appartenance que confirmerRendezVousAction.
 * Le patient est prevenu (F-RDV-03). Trace la modification dans JournalAudit.
 */
export async function annulerRendezVousProfessionnelAction(
  prevState: FacilityActionState,
  formData: FormData
): Promise<FacilityActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaIdRendezVous.safeParse({
    rendezVousId: texte(formData, "rendezVousId"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Rendez-vous invalide."),
      success: false,
    };
  }

  try {
    const cible = await rendezVousTraitable(session, validation.data.rendezVousId);

    if (cible.erreur) {
      return { error: cible.erreur, success: false };
    }

    const { rendezVous } = cible;
    const adresseTechnique = await adresseTechniqueCourante();

    const annule = await prisma.$transaction(async (tx) => {
      if (!(await transitionnerRendezVous(tx, rendezVous.id, "annuler"))) return false;
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "modification",
          donneeConcernee: `rendez_vous:${rendezVous.id}`,
          adresseTechnique,
          justification: "Rendez-vous annule par le professionnel de sante ou l'accueil",
        },
        tx
      );
      return true;
    });

    if (!annule) {
      return { error: TRANSITIONS.annuler.refus, success: false };
    }

    await prevenirPatient(
      rendezVous.patient.userId,
      "rendez_vous_annule_par_etablissement",
      `Votre rendez-vous du ${dateLisible(rendezVous.date)} a été annulé par l'établissement. Vous pouvez en reprendre un depuis votre espace.`
    );

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'annulation du rendez-vous :", erreur);
    return {
      error: "Une erreur est survenue lors de l'annulation du rendez-vous. Veuillez reessayer.",
      success: false,
    };
  }
}
