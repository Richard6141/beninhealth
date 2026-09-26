"use server";

/**
 * Reclamer un dossier existant (F-AUTH-03 du pack) : le titulaire d'un
 * dossier Patient cree "sans compte" par un professionnel (F-CLI-03,
 * creerPatientParProfessionnelAction dans src/modules/identity/actions.ts,
 * fichier partage ce soir, non modifie ici) peut activer lui-meme ce
 * compte avec un code recu (simule, voir envoyerSms plus bas).
 *
 * Perimetre reduit et assume par rapport au pack : RG-AUTH-21 exige un
 * "telephone verifie" par OTP en plus de la date de naissance. Ce depot n'a
 * pas d'infrastructure generique de verification de telephone par OTP (seul
 * le code de connexion passe par e-mail, voir src/lib/mail.ts) : la
 * verification se limite ici a la correspondance exacte entre le telephone
 * saisi et celui deja enregistre sur le dossier, sans defi OTP live
 * supplementaire. A renforcer si un vrai canal de verification telephonique
 * existe un jour.
 *
 * Le SMS du pack (etape 1, N-CLAIM-CODE) est simule via l'adaptateur F-NOT-02
 * (src/modules/notification/sms/envoyer.ts) : consultable sur
 * /app/ministere/sms, jamais un vrai SMS.
 */

import { randomInt } from "node:crypto";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { createSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { journaliser } from "@/modules/audit/journaliser";
import { envoyerSms } from "@/modules/notification/sms/envoyer";
import type { NomRole } from "@/types";

const ROLES_VALIDES: readonly string[] = [
  "patient",
  "medecin",
  "infirmier",
  "agent_communautaire",
  "pharmacien",
  "laboratoire",
  "admin_etablissement",
  "admin_national",
];

const ROUNDS_BCRYPT = 12;
const JOURS_VALIDITE_CODE = 30;
const TENTATIVES_MAX = 5;
const ALPHABET_CODE = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LONGUEUR_CODE = 8;
const TYPES_ACCES_AUTORISES = ["dossier_complet", "consultations"] as const;

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

function genererCode(): string {
  let code = "";
  for (let i = 0; i < LONGUEUR_CODE; i++) {
    code += ALPHABET_CODE[randomInt(0, ALPHABET_CODE.length)];
  }
  return code;
}

export interface GenererCodeReclamationActionState {
  error: string | null;
  success: boolean;
  code?: string;
}

const schemaGenerationCode = z.object({
  patientId: z.string().trim().min(1, "Le patient est obligatoire."),
});

export interface PatientPourReclamation {
  nomComplet: string;
  eligible: boolean;
}

/**
 * Informations minimales pour l'ecran de generation de code (F-AUTH-03),
 * reserve a un professionnel ayant un consentement actif sur ce patient
 * (meme controle d'acces que genererCodeReclamationAction ci-dessous).
 * Renvoie null si l'appelant n'a pas ce consentement (Zero Trust). eligible
 * est faux si le dossier a deja ete reclame (statut du compte deja actif).
 */
export async function getPatientPourReclamation(patientId: string): Promise<PatientPourReclamation | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { user: true },
  });

  if (!patient) {
    return null;
  }

  const consentement = await prisma.consentement.findFirst({
    where: {
      patientId: patient.id,
      acteurAutoriseId: session.userId,
      statut: "actif",
      typeAcces: { in: [...TYPES_ACCES_AUTORISES] },
    },
  });

  if (!consentement) {
    return null;
  }

  return {
    nomComplet: `${patient.user.prenom} ${patient.user.nom}`,
    eligible: patient.user.statut === "sans_compte",
  };
}

/**
 * Genere un code de reclamation pour un dossier "sans compte" (F-AUTH-03).
 * Reserve a un professionnel ayant un consentement actif sur ce patient
 * (dossier_complet ou consultations), meme perimetre d'acces que pour
 * demander un examen ou une consultation. Le code est affiche ici (usage
 * de demonstration, le SMS reel n'existant pas) et "envoye" via
 * l'adaptateur SMS simule.
 */
export async function genererCodeReclamationAction(
  prevState: GenererCodeReclamationActionState,
  formData: FormData
): Promise<GenererCodeReclamationActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaGenerationCode.safeParse({ patientId: formData.get("patientId") });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  try {
    const patient = await prisma.patient.findUnique({
      where: { id: validation.data.patientId },
      include: { user: true },
    });

    if (!patient) {
      return { error: "Patient introuvable.", success: false };
    }

    if (patient.user.statut !== "sans_compte") {
      return { error: "Ce dossier est déjà associé à un compte actif.", success: false };
    }

    const consentement = await prisma.consentement.findFirst({
      where: {
        patientId: patient.id,
        acteurAutoriseId: session.userId,
        statut: "actif",
        typeAcces: { in: [...TYPES_ACCES_AUTORISES] },
      },
    });

    if (!consentement) {
      return { error: "Vous n'avez pas d'accès autorisé à ce dossier.", success: false };
    }

    if (patient.user.telephone === "inconnu" || !patient.user.telephone) {
      return { error: "Ce patient n'a pas de numéro de téléphone enregistré.", success: false };
    }

    const code = genererCode();
    const codeHash = await bcrypt.hash(code, ROUNDS_BCRYPT);
    const expireLe = new Date();
    expireLe.setDate(expireLe.getDate() + JOURS_VALIDITE_CODE);

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.codeReclamationDossier.create({
        data: { patientId: patient.id, codeHash, expireLe },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "generation_code_reclamation",
          donneeConcernee: `patient:${patient.id}`,
          adresseTechnique,
          justification: "Generation d'un code permettant au patient de reclamer son dossier (F-AUTH-03).",
        },
        tx
      );
    });

    await envoyerSms({
      destinataire: patient.user.telephone,
      texte: `Votre code pour activer votre compte BHIP : ${code}. Valable 30 jours.`,
      categorie: "codes",
    });

    return { error: null, success: true, code };
  } catch (erreur) {
    console.error("Erreur lors de la generation du code de reclamation :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

export interface ReclamerDossierActionState {
  error: string | null;
  success: boolean;
}

const MESSAGE_ERREUR_GENERIQUE = "Code, date de naissance ou téléphone incorrect.";

const schemaReclamation = z.object({
  code: z.string().trim().min(1, "Le code est obligatoire."),
  dateNaissance: z.string().trim().min(1, "La date de naissance est obligatoire."),
  telephone: z.string().trim().min(1, "Le téléphone est obligatoire."),
  nouvelEmail: z.string().trim().email("Adresse e-mail invalide."),
  nouveauMotDePasse: z.string().min(8, "Le mot de passe doit comporter au moins 8 caractères."),
});

/**
 * Reclame un dossier "sans compte" (F-AUTH-03) : verifie le code, la date
 * de naissance et le telephone (RG-AUTH-21), puis active le compte
 * existant (email et mot de passe choisis par le patient, statut ->
 * "actif") et ouvre une session. Jamais de nouveau compte cree : c'est
 * TOUJOURS le compte "sans compte" existant qui est active, jamais un
 * doublon.
 *
 * RG-AUTH-22 : deja verifie plus haut (statut sans_compte requis pour
 * generer un code) mais revérifié ici, Zero Trust : un code ancien pourrait
 * en theorie rester valide alors que le dossier a ete active entre-temps.
 */
export async function reclamerDossierAction(
  prevState: ReclamerDossierActionState,
  formData: FormData
): Promise<ReclamerDossierActionState> {
  const validation = schemaReclamation.safeParse({
    code: formData.get("code"),
    dateNaissance: formData.get("dateNaissance"),
    telephone: formData.get("telephone"),
    nouvelEmail: formData.get("nouvelEmail"),
    nouveauMotDePasse: formData.get("nouveauMotDePasse"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  const { code, dateNaissance, telephone, nouvelEmail, nouveauMotDePasse } = validation.data;
  const dateNaissanceSaisie = new Date(dateNaissance);

  if (Number.isNaN(dateNaissanceSaisie.getTime())) {
    return { error: "Date de naissance invalide.", success: false };
  }

  try {
    const codesActifs = await prisma.codeReclamationDossier.findMany({
      where: { consommeLe: null, expireLe: { gte: new Date() }, tentatives: { lt: TENTATIVES_MAX } },
      include: { patient: { include: { user: true } } },
    });

    let codeCorrespondant: (typeof codesActifs)[number] | null = null;
    for (const candidat of codesActifs) {
      if (await bcrypt.compare(code, candidat.codeHash)) {
        codeCorrespondant = candidat;
        break;
      }
    }

    if (!codeCorrespondant) {
      return { error: MESSAGE_ERREUR_GENERIQUE, success: false };
    }

    const { patient } = codeCorrespondant;
    const adresseTechnique = await adresseTechniqueCourante();

    if (patient.user.statut !== "sans_compte") {
      return { error: "Ce dossier est déjà associé à un compte. Présentez-vous à l'accueil d'un établissement.", success: false };
    }

    const dateNaissanceCorrespond =
      patient.dateNaissance.toISOString().slice(0, 10) === dateNaissanceSaisie.toISOString().slice(0, 10);
    const telephoneCorrespond = patient.user.telephone === telephone.trim();

    if (!dateNaissanceCorrespond || !telephoneCorrespond) {
      await prisma.codeReclamationDossier.update({
        where: { id: codeCorrespondant.id },
        data: { tentatives: { increment: 1 } },
      });

      await journaliser({
        utilisateurId: patient.userId,
        action: "tentative_reclamation_echouee",
        donneeConcernee: `patient:${patient.id}`,
        adresseTechnique,
        justification: "Code valide mais date de naissance ou telephone ne correspondent pas au dossier (F-AUTH-03, RG-AUTH-21).",
      });

      return { error: MESSAGE_ERREUR_GENERIQUE, success: false };
    }

    const emailDejaUtilise = await prisma.user.findUnique({ where: { email: nouvelEmail } });

    if (emailDejaUtilise && emailDejaUtilise.id !== patient.userId) {
      return { error: "Cette adresse e-mail est déjà utilisée par un autre compte.", success: false };
    }

    const motDePasseHash = await bcrypt.hash(nouveauMotDePasse, ROUNDS_BCRYPT);

    const roles = await prisma.userRole.findMany({ where: { userId: patient.userId } });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: patient.userId },
        data: { email: nouvelEmail, motDePasseHash, statut: "actif" },
      });

      await tx.codeReclamationDossier.update({
        where: { id: codeCorrespondant!.id },
        data: { consommeLe: new Date() },
      });

      await journaliser(
        {
          utilisateurId: patient.userId,
          action: "reclamation_dossier",
          donneeConcernee: `patient:${patient.id}`,
          adresseTechnique,
          justification: "Dossier reclame et compte active par son titulaire (F-AUTH-03).",
        },
        tx
      );
    });

    const rolesValides = roles.map((r) => r.nom).filter((nom): nom is NomRole => ROLES_VALIDES.includes(nom));
    await createSession({ userId: patient.userId, roles: rolesValides });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la reclamation du dossier :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
