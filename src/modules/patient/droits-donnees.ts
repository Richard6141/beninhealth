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
 * - La fiche du pack route une demande de rectification vers le
 *   professionnel auteur puis, sans reponse sous 30 jours, vers un role
 *   "AUDITOR" absent de ce depot. Routee directement vers admin_national ici,
 *   via une entree JournalAudit dediee (meme principe que
 *   signalerAccesSuspectAction : pas de nouveau modele), visible depuis
 *   l'ecran de recherche d'audit existant (/app/ministere/audit), dont le
 *   filtre par action est deja peuple dynamiquement depuis les actions
 *   distinctes en base (voir getActionsDisponibles dans ./actions... en
 *   realite src/modules/audit/actions.ts).
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
});

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
 * qu'il estime incorrecte, en texte libre (aucun champ specifique de ce
 * depot n'a aujourd'hui de distinction declare/confirme par un professionnel
 * a rectifier via un mecanisme dedie, voir docs/audit-cote-patient.md,
 * F-CIT-04). Cree une entree JournalAudit exploitable par admin_national
 * plutot qu'un ecran sans effet.
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
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Description invalide.",
      success: false,
    };
  }

  const adresseTechnique = await adresseTechniqueCourante();

  await journaliser({
    utilisateurId: patient.userId,
    action: "demande_rectification",
    donneeConcernee: `patient:${patient.id}`,
    adresseTechnique,
    justification: validation.data.description,
  });

  return { error: null, success: true };
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
