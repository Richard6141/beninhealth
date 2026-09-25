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
import { getSession } from "@/lib/session";

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
  professionnelNomComplet: string | null;
  professionnelSpecialite: string | null;
  professionnelAvatarUrl: string | null;
  patientNomComplet: string | null; // rempli seulement pour les fonctions cote professionnel, null cote patient
  patientAvatarUrl: string | null; // idem
  patientId: string;
}

const schemaCreationRendezVous = z.object({
  etablissementId: z.string().trim().min(1, "L'etablissement est obligatoire."),
  professionnelId: z.string().trim().optional().default(""),
  date: z
    .string()
    .trim()
    .min(1, "La date est obligatoire.")
    .refine((valeur) => !Number.isNaN(Date.parse(valeur)), "Date invalide.")
    .refine(
      (valeur) => new Date(valeur).getTime() > Date.now(),
      "La date du rendez-vous doit etre dans le futur."
    ),
  motif: z.string().trim().min(1, "Le motif est obligatoire."),
});

const schemaIdRendezVous = z.object({
  rendezVousId: z.string().trim().min(1, "Le rendez-vous est obligatoire."),
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

  return rendezVous.map((rdv) => ({
    id: rdv.id,
    date: rdv.date.toISOString(),
    motif: rdv.motif,
    statut: rdv.statut,
    etablissementNom: rdv.etablissement.nom,
    professionnelNomComplet: rdv.professionnel ? nomCompletProfessionnel(rdv.professionnel.user) : null,
    professionnelSpecialite: rdv.professionnel?.specialite ?? null,
    professionnelAvatarUrl: rdv.professionnel?.user.avatarUrl ?? null,
    patientNomComplet: null,
    patientAvatarUrl: null,
    patientId: rdv.patientId,
  }));
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
    }

    const adresseTechnique = await adresseTechniqueCourante();

    const rendezVous = await prisma.rendezVous.create({
      data: {
        patientId: patient.id,
        etablissementId,
        professionnelId: professionnelIdNettoye.length > 0 ? professionnelIdNettoye : null,
        date: new Date(date),
        motif,
        statut: "demande",
      },
    });

    await prisma.journalAudit.create({
      data: {
        utilisateurId: session.userId,
        action: "creation",
        donneeConcernee: `rendez_vous:${rendezVous.id}`,
        adresseTechnique,
        justification: `Demande de rendez-vous creee aupres de l'etablissement ${etablissementId}`,
      },
    });

    return { error: null, success: true };
  } catch (erreur) {
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
 * toute modification. Trace la modification dans JournalAudit.
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

    const rendezVous = await prisma.rendezVous.findUnique({ where: { id: rendezVousId } });

    if (!rendezVous || rendezVous.patientId !== patient.id) {
      return { error: "Ce rendez-vous est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.rendezVous.update({ where: { id: rendezVous.id }, data: { statut: "annule" } }),
      prisma.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "modification",
          donneeConcernee: `rendez_vous:${rendezVous.id}`,
          adresseTechnique,
          justification: "Rendez-vous annule par le patient",
        },
      }),
    ]);

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
    include: { etablissement: true, patient: { include: { user: true } } },
    orderBy: { date: "asc" },
  });

  const nomProfessionnelConnecte = nomCompletProfessionnel(professionnel.user);

  return rendezVous.map((rdv) => ({
    id: rdv.id,
    date: rdv.date.toISOString(),
    motif: rdv.motif,
    statut: rdv.statut,
    etablissementNom: rdv.etablissement.nom,
    professionnelNomComplet: nomProfessionnelConnecte,
    professionnelSpecialite: professionnel.specialite,
    professionnelAvatarUrl: professionnel.user.avatarUrl,
    patientNomComplet: nomComplet(rdv.patient.user),
    patientAvatarUrl: rdv.patient.user.avatarUrl,
    patientId: rdv.patientId,
  }));
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

  return rendezVous.map((rdv) => ({
    id: rdv.id,
    date: rdv.date.toISOString(),
    motif: rdv.motif,
    statut: rdv.statut,
    etablissementNom: rdv.etablissement.nom,
    professionnelNomComplet: rdv.professionnel ? nomCompletProfessionnel(rdv.professionnel.user) : null,
    professionnelSpecialite: rdv.professionnel?.specialite ?? null,
    professionnelAvatarUrl: rdv.professionnel?.user.avatarUrl ?? null,
    patientNomComplet: nomComplet(rdv.patient.user),
    patientAvatarUrl: rdv.patient.user.avatarUrl,
    patientId: rdv.patientId,
  }));
}

/**
 * Confirme un rendez-vous a l'initiative du professionnel connecte. Verifie
 * d'abord que ce rendez-vous appartient bien au professionnel connecte
 * (Zero Trust) avant toute modification. Trace la modification dans
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

  const { rendezVousId } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const rendezVous = await prisma.rendezVous.findUnique({
      where: { id: rendezVousId },
      include: { patient: true },
    });

    if (!rendezVous || rendezVous.professionnelId !== professionnel.id) {
      return { error: "Ce rendez-vous est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.rendezVous.update({ where: { id: rendezVous.id }, data: { statut: "confirme" } }),
      prisma.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "modification",
          donneeConcernee: `rendez_vous:${rendezVous.id}`,
          adresseTechnique,
          justification: "Rendez-vous confirme par le professionnel de sante",
        },
      }),
    ]);

    // Notification interne (Phase 10) : hors de la transaction ci-dessus,
    // une notification manquee ne doit jamais faire echouer la confirmation
    // du rendez-vous elle-meme (deja actee en base a ce stade).
    const { creerNotification } = await import("@/modules/notification/actions");
    const dateLisible = rendezVous.date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    await creerNotification(
      rendezVous.patient.userId,
      "rendez_vous_confirme",
      `Votre rendez-vous du ${dateLisible} a ete confirme.`,
      "/app/patient/rendez-vous"
    );

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la confirmation du rendez-vous :", erreur);
    return {
      error: "Une erreur est survenue lors de la confirmation du rendez-vous. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Annule un rendez-vous a l'initiative du professionnel connecte. Meme
 * verification d'appartenance que confirmerRendezVousAction. Trace la
 * modification dans JournalAudit.
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

  const { rendezVousId } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const rendezVous = await prisma.rendezVous.findUnique({ where: { id: rendezVousId } });

    if (!rendezVous || rendezVous.professionnelId !== professionnel.id) {
      return { error: "Ce rendez-vous est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.rendezVous.update({ where: { id: rendezVous.id }, data: { statut: "annule" } }),
      prisma.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "modification",
          donneeConcernee: `rendez_vous:${rendezVous.id}`,
          adresseTechnique,
          justification: "Rendez-vous annule par le professionnel de sante",
        },
      }),
    ]);

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'annulation du rendez-vous :", erreur);
    return {
      error: "Une erreur est survenue lors de l'annulation du rendez-vous. Veuillez reessayer.",
      success: false,
    };
  }
}
