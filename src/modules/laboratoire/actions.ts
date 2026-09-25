"use server";

/**
 * Server Actions du module laboratoire : demande et resultat d'examens
 * medicaux. Contrat d'integration Phase 8, consomme par les ecrans
 * src/app/app/patient/**, src/app/app/medecin/** et src/app/app/laboratoire/**
 * (autres agents).
 *
 * Meme principe applique de bout en bout que src/modules/clinical/actions.ts
 * et src/modules/prescription/actions.ts : Zero Trust. Le patient ou le
 * professionnel courant est toujours derive de getSession(), jamais d'un id
 * transmis par le client dans un formulaire. Regle metier centrale de ce
 * module : un professionnel ne peut demander un examen medical pour un
 * patient que si ce patient lui a accorde un Consentement actif
 * ("dossier_complet" ou "examens"), verifie ici en base avant toute
 * ecriture, jamais suppose. Cote laboratoire, un professionnel ne peut saisir
 * un resultat que pour un examen assigne a l'etablissement auquel il est
 * rattache (meme verification de propriete/rattachement, jamais confiance en
 * l'id transmis). Toute creation ou modification d'examen est tracee dans
 * JournalAudit.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface LaboratoireActionState {
  error: string | null;
  success: boolean;
}

/** Etablissement de type laboratoire, tel que propose dans un selecteur de demande d'examen. */
export interface LaboratoireOption {
  id: string;
  nom: string;
  localisation: string;
}

/** Resume d'un examen medical, pret a afficher cote ecran patient, medecin ou laboratoire. */
export interface ExamenResume {
  id: string;
  typeExamen: string;
  date: string; // ISO
  statut: string;
  resultat: string | null;
  dateResultat: string | null; // ISO ou null
  patientNomComplet: string | null; // rempli cote medecin/laboratoire
  patientIdentifiantSante: string | null; // rempli cote medecin/laboratoire
  demandeurNomComplet: string | null; // rempli cote patient/laboratoire ("Dr. Prenom Nom")
  laboratoireNom: string; // toujours rempli
}

/** Types d'acces de consentement autorisant un professionnel a demander un examen. */
const TYPES_ACCES_EXAMEN = ["dossier_complet", "examens"] as const;

/** Statuts consideres comme "en attente de traitement" cote laboratoire, prioritaires dans la file. */
const STATUTS_EN_ATTENTE_LABORATOIRE = ["demande", "en_cours"] as const;

const schemaDemandeExamen = z.object({
  patientId: z.string().trim().min(1, "Le patient est obligatoire."),
  consultationId: z.string().trim().optional().default(""),
  laboratoireId: z.string().trim().min(1, "Le laboratoire est obligatoire."),
  typeExamen: z.string().trim().min(1, "Le type d'examen est obligatoire."),
});

const schemaSaisieResultat = z.object({
  examenId: z.string().trim().min(1, "L'examen est obligatoire."),
  resultat: z.string().trim().min(1, "Le resultat est obligatoire."),
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

/** Met en forme un examen medical (avec patient/demandeur/laboratoire selon besoin) en ExamenResume. */
function versExamenResume(
  examen: {
    id: string;
    typeExamen: string;
    date: Date;
    statut: string;
    resultat: string | null;
    dateResultat: Date | null;
    laboratoire: { nom: string };
  },
  options: {
    patientNomComplet: string | null;
    patientIdentifiantSante: string | null;
    demandeurNomComplet: string | null;
  }
): ExamenResume {
  return {
    id: examen.id,
    typeExamen: examen.typeExamen,
    date: examen.date.toISOString(),
    statut: examen.statut,
    resultat: examen.resultat,
    dateResultat: examen.dateResultat ? examen.dateResultat.toISOString() : null,
    patientNomComplet: options.patientNomComplet,
    patientIdentifiantSante: options.patientIdentifiantSante,
    demandeurNomComplet: options.demandeurNomComplet,
    laboratoireNom: examen.laboratoire.nom,
  };
}

/** Liste tous les etablissements sanitaires de type "laboratoire", tries par nom. */
export async function listLaboratoires(): Promise<LaboratoireOption[]> {
  const laboratoires = await prisma.etablissementSanitaire.findMany({
    where: { type: "laboratoire" },
    orderBy: { nom: "asc" },
  });

  return laboratoires.map((laboratoire) => ({
    id: laboratoire.id,
    nom: laboratoire.nom,
    localisation: laboratoire.localisation,
  }));
}

/**
 * Demande un examen medical a l'initiative du professionnel connecte
 * (derive de getSession(), jamais d'un id transmis par le client), pour un
 * patient identifie par patientId (Zero Trust : verifie systematiquement,
 * jamais suppose valide). Verification obligatoire avant toute ecriture : un
 * Consentement actif (dossier_complet ou examens) doit exister pour
 * (patientId, acteurAutoriseId = professionnel connecte). Verifie egalement
 * que le laboratoire cible existe et est bien de type "laboratoire". Si un
 * consultationId est fourni, verifie qu'il appartient bien a ce patient et a
 * ce professionnel. Cree l'ExamenMedical (statut "demande") et trace la
 * creation dans JournalAudit.
 */
export async function demanderExamenAction(
  prevState: LaboratoireActionState,
  formData: FormData
): Promise<LaboratoireActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaDemandeExamen.safeParse({
    patientId: texte(formData, "patientId"),
    consultationId: texte(formData, "consultationId"),
    laboratoireId: texte(formData, "laboratoireId"),
    typeExamen: texte(formData, "typeExamen"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de demande d'examen invalides."),
      success: false,
    };
  }

  const { patientId, consultationId, laboratoireId, typeExamen } = validation.data;

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
      (TYPES_ACCES_EXAMEN as readonly string[]).includes(consentement.typeAcces);

    if (!consentementValide) {
      return { error: "Aucun consentement actif pour ce patient.", success: false };
    }

    const laboratoire = await prisma.etablissementSanitaire.findUnique({
      where: { id: laboratoireId },
    });

    if (!laboratoire || laboratoire.type !== "laboratoire") {
      return { error: "Ce laboratoire est introuvable.", success: false };
    }

    const consultationIdNettoye = consultationId.trim();
    let consultationIdValide: string | null = null;

    if (consultationIdNettoye.length > 0) {
      const consultation = await prisma.consultation.findUnique({
        where: { id: consultationIdNettoye },
      });

      if (
        !consultation ||
        consultation.patientId !== patientId ||
        consultation.professionnelId !== professionnel.id
      ) {
        return { error: "Cette consultation est introuvable.", success: false };
      }

      consultationIdValide = consultation.id;
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      const examenCree = await tx.examenMedical.create({
        data: {
          patientId,
          demandeurId: professionnel.id,
          laboratoireId: laboratoire.id,
          consultationId: consultationIdValide,
          typeExamen,
          statut: "demande",
        },
      });

      await tx.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "creation",
          donneeConcernee: `examen_medical:${examenCree.id}`,
          adresseTechnique,
          justification: `Examen medical demande pour le patient ${patientId}`,
        },
      });
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la demande d'examen medical :", erreur);
    return {
      error: "Une erreur est survenue lors de la demande d'examen. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Recupere les examens medicaux demandes par le professionnel connecte
 * (derive de getSession() -> ProfessionnelSante lie), du plus recent au plus
 * ancien.
 */
export async function getExamensDemandesParProfessionnel(): Promise<ExamenResume[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const examens = await prisma.examenMedical.findMany({
    where: { demandeurId: professionnel.id },
    include: { patient: { include: { user: true } }, laboratoire: true },
    orderBy: { date: "desc" },
  });

  return examens.map((examen) =>
    versExamenResume(examen, {
      patientNomComplet: nomComplet(examen.patient.user),
      patientIdentifiantSante: examen.patient.identifiantSante,
      demandeurNomComplet: null,
    })
  );
}

/**
 * Recupere tous les examens medicaux du patient connecte (derive de
 * getSession(), jamais d'id en parametre), du plus recent au plus ancien.
 */
export async function getMesExamens(): Promise<ExamenResume[]> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return [];
  }

  const examens = await prisma.examenMedical.findMany({
    where: { patientId: patient.id },
    include: { demandeur: { include: { user: true } }, laboratoire: true },
    orderBy: { date: "desc" },
  });

  return examens.map((examen) =>
    versExamenResume(examen, {
      patientNomComplet: null,
      patientIdentifiantSante: null,
      demandeurNomComplet: nomCompletProfessionnel(examen.demandeur.user),
    })
  );
}

/**
 * Recupere tous les examens medicaux (tous statuts confondus) assignes a
 * l'etablissement du professionnel connecte (derive de getSession() ->
 * ProfessionnelSante lie), tries pour presenter en premier ceux en attente de
 * traitement ("demande" ou "en_cours"), puis par date (du plus ancien au
 * plus recent au sein d'un meme groupe de priorite, comme une file de
 * traitement). Retourne un tableau vide si l'appelant n'a pas de profil
 * ProfessionnelSante ou n'est pas rattache a un etablissement de type
 * "laboratoire" (Zero Trust : jamais suppose depuis le role seul).
 */
export async function getExamensPourLaboratoire(): Promise<ExamenResume[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const etablissement = await prisma.etablissementSanitaire.findUnique({
    where: { id: professionnel.etablissementId },
  });

  if (!etablissement || etablissement.type !== "laboratoire") {
    return [];
  }

  const examens = await prisma.examenMedical.findMany({
    where: { laboratoireId: etablissement.id },
    include: {
      patient: { include: { user: true } },
      demandeur: { include: { user: true } },
      laboratoire: true,
    },
    orderBy: { date: "asc" },
  });

  const prioriteStatut = (statut: string): number =>
    (STATUTS_EN_ATTENTE_LABORATOIRE as readonly string[]).includes(statut) ? 0 : 1;

  const examensTries = [...examens].sort(
    (a, b) => prioriteStatut(a.statut) - prioriteStatut(b.statut)
  );

  return examensTries.map((examen) =>
    versExamenResume(examen, {
      patientNomComplet: nomComplet(examen.patient.user),
      patientIdentifiantSante: examen.patient.identifiantSante,
      demandeurNomComplet: nomCompletProfessionnel(examen.demandeur.user),
    })
  );
}

/**
 * Saisit le resultat d'un examen medical par le professionnel connecte,
 * cote laboratoire. Verifie que l'examen identifie par examenId est bien
 * assigne a l'etablissement auquel le professionnel connecte est rattache
 * (Zero Trust : jamais confiance en l'id transmis par le client sans
 * verification de propriete/rattachement, meme principe que la verification
 * de consultation dans creerPrescriptionAction). Passe le statut a
 * "termine", enregistre le resultat et horodate dateResultat. Trace la
 * modification dans JournalAudit.
 */
export async function saisirResultatExamenAction(
  prevState: LaboratoireActionState,
  formData: FormData
): Promise<LaboratoireActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaSaisieResultat.safeParse({
    examenId: texte(formData, "examenId"),
    resultat: texte(formData, "resultat"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de resultat invalides."),
      success: false,
    };
  }

  const { examenId, resultat } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const examen = await prisma.examenMedical.findUnique({
      where: { id: examenId },
      include: { patient: true, demandeur: true },
    });

    if (!examen || examen.laboratoireId !== professionnel.etablissementId) {
      return { error: "Cet examen est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.examenMedical.update({
        where: { id: examenId },
        data: { statut: "termine", resultat, dateResultat: new Date() },
      });

      await tx.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "modification",
          donneeConcernee: `examen_medical:${examenId}`,
          adresseTechnique,
          justification: `Resultat saisi pour l'examen medical ${examenId}`,
        },
      });
    });

    // Notification interne (Phase 10) : hors transaction, une notification
    // manquee ne doit jamais faire echouer la saisie du resultat elle-meme
    // (deja actee en base a ce stade). Le patient ET le medecin demandeur
    // sont prevenus.
    const { creerNotification } = await import("@/modules/notification/actions");
    await Promise.all([
      creerNotification(
        examen.patient.userId,
        "resultat_examen_disponible",
        `Le resultat de votre examen "${examen.typeExamen}" est disponible.`,
        "/app/patient/examens"
      ),
      creerNotification(
        examen.demandeur.userId,
        "resultat_examen_disponible",
        `Le resultat de l'examen "${examen.typeExamen}" que vous avez demande est disponible.`,
        "/app/medecin/examens"
      ),
    ]);

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la saisie du resultat d'examen medical :", erreur);
    return {
      error: "Une erreur est survenue lors de la saisie du resultat. Veuillez reessayer.",
      success: false,
    };
  }
}
