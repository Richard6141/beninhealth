"use server";

/**
 * Server Actions du module patient : exercice des droits sur ses donnees
 * (F-CIT-13 du pack, docs/pack claude/specs/08-fiches-citoyen.md). Trois
 * volets implementes ici (le quatrieme, signalement d'un acces suspect, est
 * deja fait ailleurs, voir signalerAccesSuspectAction dans ./actions) :
 * (1) copie de mes donnees (JSON + PDF, apres re-authentification),
 * (2) demande de rectification d'une information,
 * (3) fermeture de compte (dossier medical conserve, RG-CIT-110 : aucune
 * demande ne doit entrainer la suppression physique d'une donnee medicale).
 *
 * Adaptations documentees, decidees avec l'utilisateur (voir
 * docs/coordination-agents.md, point F-CIT-13) :
 * - Corrige le 2026-09-28 : une demande de rectification liee a un element
 *   CONFIRME (RG-CIT-30, DemandeRectification.informationDeclareeId) est
 *   desormais routee vers le professionnel confirmant (confirmeParId),
 *   notifie, avec un ecran dedie pour repondre
 *   (/app/medecin/rectifications). Sans reponse sous 30 jours, escaladee
 *   automatiquement (voir ./rectification-escalade.ts) : role "AUDITOR" du
 *   pack absent de ce depot, escalade vers admin_national via la meme entree
 *   JournalAudit qu'avant ce correctif. Une demande GENERALE (sans element
 *   precis, formulaire de /app/patient/droits) garde le comportement
 *   d'origine, inchange : seule une entree JournalAudit, visible depuis
 *   l'ecran de recherche d'audit existant (/app/ministere/audit).
 * - La fiche demande un lien de telechargement de la copie de mes donnees
 *   valide 7 jours. Simplification assumee : ce depot regenere le contenu a
 *   la demande a partir des donnees courantes plutot que de figer et stocker
 *   un fichier avec expiration (pas de tache de nettoyage a construire ni de
 *   nouveau modele). La re-authentification par mot de passe delivre un jeton
 *   signe de courte duree (./jeton-export-donnees) que les deux routes de
 *   telechargement exigent : sans lui, un GET direct avec le seul cookie de
 *   session livrerait toute l'archive.
 */

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { destroySession, getSession } from "@/lib/session";
import { enregistrerEvenement, limiteAtteinte } from "@/lib/limite-debit";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { can } from "@/security/permissions";
import { getMonProfil } from "@/modules/identity/actions";
import { getMesConsultations } from "@/modules/clinical/actions";
import { getMesRendezVous } from "@/modules/facility/actions";
import { getMesPrescriptions } from "@/modules/prescription/actions";
import { getMesExamens } from "@/modules/laboratoire/actions";
import { getMesVaccinations } from "@/modules/vaccination/actions";
import type { PatientActionState } from "./actions";
import { getMesConsentements, getMonDossierPatient } from "./actions";
import { creerJetonExportDonnees } from "./jeton-export-donnees";

const FENETRE_ECHECS_EXPORT_MS = 60 * 60 * 1000;
const ECHECS_MAX_EXPORT_PAR_COMPTE = 5;

export interface ExportDonneesActionState extends PatientActionState {
  /** Jeton signe a joindre aux liens de telechargement (present seulement apres une confirmation reussie). */
  jeton?: string;
}

function cleEchecsExport(userId: string): string {
  return `export-donnees:echecs:${userId}`;
}

const LONGUEUR_MIN_DESCRIPTION_RECTIFICATION = 20;

const schemaRectification = z.object({
  description: z
    .string()
    .trim()
    .min(
      LONGUEUR_MIN_DESCRIPTION_RECTIFICATION,
      `Merci de decrire l'erreur en au moins ${LONGUEUR_MIN_DESCRIPTION_RECTIFICATION} caracteres.`
    ),
  // Present uniquement depuis le bouton "Signaler une erreur" d'un element
  // confirme (RG-CIT-30, SectionInformationsDeclarees.tsx) ; absent pour une
  // demande generale depuis /app/patient/droits.
  informationDeclareeId: z.string().trim().optional().default(""),
});

const schemaReponseRectification = z.object({
  id: z.string().trim().min(1, "La demande est obligatoire."),
  reponse: z.string().trim().min(1, "La reponse est obligatoire."),
});

/** Demande de rectification (F-CIT-13) adressee a un professionnel, prete a afficher. */
export interface DemandeRectificationResume {
  id: string;
  description: string;
  elementConteste: string | null;
  statut: "en_attente" | "traitee" | "escaladee";
  reponseProfessionnel: string | null;
  dateCreation: string; // ISO
}

const schemaMotDePasse = z.object({
  motDePasse: z.string().min(1, "Votre mot de passe est obligatoire pour confirmer."),
});

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

/** Recupere le profil Patient du titulaire de la session courante, ou null si absent. */
async function patientDeLaSessionCourante() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  return prisma.patient.findUnique({ where: { userId: session.userId } });
}

/**
 * Type "rectification" de F-CIT-13 : le patient signale une information
 * qu'il estime incorrecte. Deux cas : (1) demande generale depuis
 * /app/patient/droits (informationDeclareeId absent) : comportement
 * d'origine inchange, seule une entree JournalAudit, exploitable par
 * admin_national ; (2) "Signaler une erreur" sur un element CONFIRME
 * (RG-CIT-30, SectionInformationsDeclarees.tsx, informationDeclareeId
 * fourni) : cree en plus une ligne DemandeRectification routee vers le
 * professionnel confirmant (confirmeParId), notifie. Aucun ecran de ce
 * depot n'ecrit encore le statut "confirme" (voir la limite deja documentee
 * dans src/modules/patient/informations-declarees.ts) : ce second cas est
 * donc deja applique et teste, mais jamais declenche en usage reel pour
 * l'instant.
 */
export async function demanderRectificationAction(
  prevState: PatientActionState,
  formData: FormData
): Promise<PatientActionState> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaRectification.safeParse({
    description: texte(formData, "description"),
    informationDeclareeId: texte(formData, "informationDeclareeId"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Description invalide.",
      success: false,
    };
  }

  const { description, informationDeclareeId } = validation.data;
  const adresseTechnique = await adresseTechniqueCourante();

  let professionnelDestinataireId: string | null = null;

  if (informationDeclareeId) {
    const element = await prisma.informationDeclaree.findUnique({ where: { id: informationDeclareeId } });

    if (!element || element.patientId !== patient.id) {
      return { error: "Cet element est introuvable.", success: false };
    }

    if (element.statut !== "confirme") {
      return { error: "Cet element n'est pas confirme par un professionnel.", success: false };
    }

    professionnelDestinataireId = element.confirmeParId;
  }

  await prisma.$transaction(async (tx) => {
    await tx.demandeRectification.create({
      data: {
        patientId: patient.id,
        description,
        informationDeclareeId: informationDeclareeId || null,
        professionnelDestinataireId,
      },
    });

    if (professionnelDestinataireId) {
      const professionnel = await tx.professionnelSante.findUnique({ where: { id: professionnelDestinataireId } });
      if (professionnel) {
        await creerNotification(
          professionnel.userId,
          "N-CIT-RECTIFICATION-RECUE",
          "Un patient signale une erreur sur une information que vous avez confirmee.",
          "/app/medecin/rectifications"
        );
      }
    }

    await journaliser(
      {
        utilisateurId: patient.userId,
        action: "demande_rectification",
        donneeConcernee: `patient:${patient.id}`,
        adresseTechnique,
        justification: description,
      },
      tx
    );
  });

  return { error: null, success: true };
}

/**
 * Demandes de rectification (F-CIT-13) adressees au professionnel connecte
 * (confirmeParId de l'element conteste), les plus recentes d'abord. Jamais
 * de dossier Patient complet : seuls la description et l'element conteste
 * (libelle deja compose de InformationDeclaree) sont exposes.
 */
export async function getMesDemandesRectificationRecues(): Promise<DemandeRectificationResume[]> {
  const session = await getSession();
  if (!session) return [];

  if (!session.roles.some((role) => can(role, "read", "demande_rectification"))) {
    return [];
  }

  const professionnel = await prisma.professionnelSante.findUnique({ where: { userId: session.userId } });
  if (!professionnel) return [];

  const demandes = await prisma.demandeRectification.findMany({
    where: { professionnelDestinataireId: professionnel.id },
    include: { informationDeclaree: true },
    orderBy: [{ statut: "asc" }, { dateCreation: "desc" }],
  });

  return demandes.map((demande) => ({
    id: demande.id,
    description: demande.description,
    elementConteste: demande.informationDeclaree?.valeur ?? null,
    statut: demande.statut as "en_attente" | "traitee" | "escaladee",
    reponseProfessionnel: demande.reponseProfessionnel,
    dateCreation: demande.dateCreation.toISOString(),
  }));
}

/**
 * Reponse du professionnel a une demande de rectification qui lui est
 * adressee (F-CIT-13). Reserve au professionnel destinataire (jamais
 * confiance dans le seul id transmis). Ne modifie jamais l'element conteste
 * lui-meme : c'est au professionnel de le corriger separement s'il donne
 * raison au patient (retirerInformationDeclareeAction reste une action
 * distincte, hors de ce module).
 */
export async function repondreRectificationAction(
  prevState: PatientActionState,
  formData: FormData
): Promise<PatientActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "update", "demande_rectification"))) {
    return { error: "Action reservee au professionnel concerne.", success: false };
  }

  const validation = schemaReponseRectification.safeParse({
    id: texte(formData, "id"),
    reponse: texte(formData, "reponse"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Reponse invalide.",
      success: false,
    };
  }

  try {
    const professionnel = await prisma.professionnelSante.findUnique({ where: { userId: session.userId } });
    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const demande = await prisma.demandeRectification.findUnique({ where: { id: validation.data.id } });
    if (!demande || demande.professionnelDestinataireId !== professionnel.id) {
      return { error: "Demande introuvable.", success: false };
    }

    if (demande.statut !== "en_attente") {
      return { error: "Cette demande a deja ete traitee.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.demandeRectification.update({
        where: { id: demande.id },
        data: {
          statut: "traitee",
          reponseProfessionnel: validation.data.reponse,
          dateTraitement: new Date(),
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "reponse_demande_rectification",
          donneeConcernee: `demande_rectification:${demande.id}`,
          adresseTechnique,
          justification: validation.data.reponse,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la reponse a une demande de rectification :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

/**
 * Type "copie de mes donnees" de F-CIT-13, etape de re-authentification :
 * verifie le mot de passe du compte connecte et delivre un jeton signe de 5
 * minutes, lie a ce compte, que les liens de telechargement
 * (/api/patient/export/json, /api/patient/export/pdf) joignent a leur adresse
 * et que les deux routes exigent. Reservee au role patient (les routes le
 * sont) ; 5 mots de passe incorrects par heure et par compte bloquent l'etape
 * (compteur en memoire du processus, voir src/lib/limite-debit.ts).
 */
export async function verifierMotDePasseExportAction(
  prevState: ExportDonneesActionState,
  formData: FormData
): Promise<ExportDonneesActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.includes("patient")) {
    return { error: "Cette action est reservee aux patients.", success: false };
  }

  if (limiteAtteinte(cleEchecsExport(session.userId), ECHECS_MAX_EXPORT_PAR_COMPTE, FENETRE_ECHECS_EXPORT_MS)) {
    return { error: "Trop de tentatives. Reessayez dans une heure.", success: false };
  }

  const validation = schemaMotDePasse.safeParse({
    motDePasse: texte(formData, "motDePasse"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Mot de passe invalide.",
      success: false,
    };
  }

  const utilisateur = await prisma.user.findUnique({ where: { id: session.userId } });

  if (!utilisateur) {
    return { error: "Compte introuvable.", success: false };
  }

  const motDePasseValide = await bcrypt.compare(validation.data.motDePasse, utilisateur.motDePasseHash);

  if (!motDePasseValide) {
    enregistrerEvenement(cleEchecsExport(session.userId), FENETRE_ECHECS_EXPORT_MS);
    return { error: "Mot de passe incorrect.", success: false };
  }

  const adresseTechnique = await adresseTechniqueCourante();

  await journaliser({
    utilisateurId: session.userId,
    action: "export_donnees_demande",
    donneeConcernee: `utilisateur:${session.userId}`,
    adresseTechnique,
    justification: "Demande de copie des donnees personnelles (F-CIT-13), re-authentification reussie",
  });

  return { error: null, success: true, jeton: creerJetonExportDonnees(session.userId) };
}

/**
 * Type "fermeture de compte" de F-CIT-13 : re-authentification par mot de
 * passe (meme niveau que retirerConsultationAction, src/modules/clinical/
 * actions.ts), puis desactivation du compte (statut "ferme", bloque la
 * connexion via le controle existant dans loginAction) et destruction de la
 * session courante. RG-CIT-110 : le dossier Patient n'est jamais supprime ni
 * detache, uniquement l'acces par compte qui est ferme.
 */
export async function fermerMonCompteAction(
  prevState: PatientActionState,
  formData: FormData
): Promise<PatientActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaMotDePasse.safeParse({
    motDePasse: texte(formData, "motDePasse"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Mot de passe invalide.",
      success: false,
    };
  }

  const utilisateur = await prisma.user.findUnique({ where: { id: session.userId } });

  if (!utilisateur) {
    return { error: "Compte introuvable.", success: false };
  }

  if (utilisateur.statut !== "actif") {
    return { error: "Ce compte est deja ferme.", success: false };
  }

  const motDePasseValide = await bcrypt.compare(validation.data.motDePasse, utilisateur.motDePasseHash);

  if (!motDePasseValide) {
    return { error: "Mot de passe incorrect.", success: false };
  }

  const adresseTechnique = await adresseTechniqueCourante();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: session.userId }, data: { statut: "ferme" } });
    await tx.sessionActive.deleteMany({ where: { userId: session.userId } });

    await journaliser(
      {
        utilisateurId: session.userId,
        action: "fermeture_compte",
        donneeConcernee: `utilisateur:${session.userId}`,
        adresseTechnique,
        justification:
          "Fermeture de compte demandee par le patient (F-CIT-13) : dossier medical conserve, acces par compte desactive.",
      },
      tx
    );
  });

  await destroySession();
  redirect("/connexion");
}

/**
 * Rassemble l'integralite des donnees du patient connecte, pour la copie de
 * mes donnees (F-CIT-13). Reutilise exclusivement les fonctions de lecture
 * "mes ..." deja existantes de chaque module, jamais de requete Prisma
 * directe ici : ce fichier ne doit connaitre aucune regle d'acces propre a
 * un autre module. Consomme par les deux routes /api/patient/export/* (JSON
 * et PDF), jamais expose comme Server Action (pas de forme serialisable
 * adaptee a un gros objet imbrique via useActionState).
 */
export async function collecterMesDonneesPersonnelles() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const [profil, dossier, consentements, rendezVous, consultations, prescriptions, examens, vaccinations] =
    await Promise.all([
      getMonProfil(),
      getMonDossierPatient(),
      getMesConsentements(),
      getMesRendezVous(),
      getMesConsultations(),
      getMesPrescriptions(),
      getMesExamens(),
      getMesVaccinations(),
    ]);

  return {
    genereLe: new Date().toISOString(),
    profil,
    dossier,
    consentements,
    rendezVous,
    consultations,
    prescriptions,
    examens,
    vaccinations,
  };
}
