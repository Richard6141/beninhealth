"use server";

/**
 * Server Actions du module urgence : acces d'urgence "bris de glace"
 * (F-CLI-10 du pack), reserve aux roles medecin et infirmier. Permet de
 * soigner un patient incapable de consentir (inconscient, detresse vitale)
 * sans attendre son accord, dans un cadre strictement controle et trace.
 *
 * Limites assumees par rapport a la fiche du pack, documentees dans
 * docs/audit-cote-medecin.md :
 * - Notification patient en interne (Notification), jamais par SMS reel
 *   (aucune passerelle SMS dans ce depot, meme limite deja actee ailleurs).
 * - Pas de role "auditeur" distinct dans ce depot : la revue sous 7 jours
 *   (RG-CLI-92) n'a pas d'ecran dedie (F-AUD-02 non construit), mais chaque
 *   acces reste trace integralement dans JournalAudit pour une revue future.
 *   Le responsable d'etablissement (admin_etablissement) recoit neanmoins
 *   une notification interne immediate, lui.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { lireParametre } from "@/modules/administration/parametres-lecture";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { creerNotification } from "@/modules/notification/creer";
import { verifierCodeMfaPourConnexion } from "@/modules/identity/mfa-totp";
import { enregistrerEvenement, limiteAtteinte } from "@/lib/limite-debit";
import { MOTIFS_URGENCE } from "./motifs-urgence";

export interface UrgenceActionState {
  error: string | null;
  success: boolean;
  patientId?: string;
  dateFin?: string; // ISO, rempli uniquement en cas de succes
}

const DUREE_ACCES_URGENCE_MS = 4 * 60 * 60 * 1000;
// Meme regle que la connexion (F-AUTH-06) : 5 codes incorrects verrouillent 15 minutes.
// Sans cette limite, une session volee pourrait deviner le code a 6 chiffres.
const MAX_CODES_TOTP_INCORRECTS = 5;
const FENETRE_CODES_TOTP_INCORRECTS_MS = 15 * 60 * 1000;

const schemaDeclenchement = z.object({
  identifiantSante: z.string().trim().min(1, "L'identifiant sante du patient est obligatoire."),
  motif: z.enum(MOTIFS_URGENCE, { message: "Motif d'urgence invalide." }),
  justification: z
    .string()
    .trim()
    .min(20, "La justification doit contenir au moins 20 caracteres.")
    .max(500, "La justification ne peut pas depasser 500 caracteres."),
  codeTotp: z.string().trim().regex(/^\d{6}$/, "Le code de double authentification doit contenir 6 chiffres."),
});

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    const adresse = listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? null;
    return adresse ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

/**
 * Declenche un acces d'urgence "bris de glace" (F-CLI-10, CA-1/CA-2/CA-3) :
 * ouvre un Consentement de type "urgence" de 4 heures pour le patient
 * identifie, apres re-authentification TOTP reelle et verification du
 * quota quotidien (RG-CLI-90). RG-CLI-91 (exclusion des donnees sensibles)
 * est applique cote lecture par getResumePatient/getHistoriquePatient sur
 * le typeAcces "urgence", pas ici. RG-CLI-93 (pas de prolongation) est
 * applique en refusant si un acces urgence est deja actif pour ce couple.
 */
export async function declencherAccesUrgenceAction(
  prevState: UrgenceActionState,
  formData: FormData
): Promise<UrgenceActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "acces_urgence"))) {
    return { error: "Vous n'etes pas autorise a declencher un acces d'urgence.", success: false };
  }

  const validation = schemaDeclenchement.safeParse({
    identifiantSante: texte(formData, "identifiantSante"),
    motif: texte(formData, "motif"),
    justification: texte(formData, "justification"),
    codeTotp: texte(formData, "codeTotp"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  const { identifiantSante, motif, justification, codeTotp } = validation.data;

  const utilisateur = await prisma.user.findUnique({ where: { id: session.userId } });

  if (!utilisateur || !utilisateur.mfaActif) {
    return {
      error:
        "La double authentification (MFA) doit etre activee sur votre compte avant de pouvoir declencher un acces d'urgence. Activez-la depuis Securite du compte.",
      success: false,
    };
  }

  const cleEchecsTotp = `urgence-totp:${session.userId}`;

  if (limiteAtteinte(cleEchecsTotp, MAX_CODES_TOTP_INCORRECTS, FENETRE_CODES_TOTP_INCORRECTS_MS)) {
    return {
      error: "Trop de codes de double authentification incorrects. Reessayez dans 15 minutes.",
      success: false,
    };
  }

  const codeValide = await verifierCodeMfaPourConnexion(session.userId, codeTotp);

  if (!codeValide) {
    enregistrerEvenement(cleEchecsTotp, FENETRE_CODES_TOTP_INCORRECTS_MS);
    return { error: "Code de double authentification incorrect.", success: false };
  }

  const professionnel = await prisma.professionnelSante.findUnique({
    where: { userId: session.userId },
    include: { etablissement: true },
  });

  if (!professionnel) {
    return { error: "Profil professionnel introuvable.", success: false };
  }

  const patient = await prisma.patient.findUnique({
    where: { identifiantSante },
    include: { user: true },
  });

  if (!patient) {
    return { error: "Aucun patient ne correspond a cet identifiant sante.", success: false };
  }

  const maintenant = new Date();
  const debutFenetre24h = new Date(maintenant.getTime() - 24 * 60 * 60 * 1000);
  const adresseTechnique = await adresseTechniqueCourante();

  // F-ADM-07 : limite administrable, relue en base a chaque acces (RG-ADM-50).
  const limiteAcces24h = await lireParametre("urgence.limite_acces_24h");

  const nombreAccesRecents = await prisma.journalAudit.count({
    where: {
      utilisateurId: session.userId,
      action: "acces_urgence",
      date: { gte: debutFenetre24h },
    },
  });

  if (nombreAccesRecents >= limiteAcces24h) {
    await journaliser({
      utilisateurId: session.userId,
      action: "acces_urgence_refuse_quota",
      donneeConcernee: `patient:${patient.id}`,
      adresseTechnique,
      justification: `Quota de ${limiteAcces24h} acces d'urgence par 24h atteint. Tentative motif "${motif}" refusee.`,
    });
    return {
      error: `Vous avez deja declenche ${limiteAcces24h} acces d'urgence au cours des dernieres 24 heures. Refus, alerte transmise.`,
      success: false,
    };
  }

  const consentementExistant = await prisma.consentement.findUnique({
    where: { patientId_acteurAutoriseId: { patientId: patient.id, acteurAutoriseId: session.userId } },
  });

  if (consentementExistant && consentementExistant.statut === "actif" && consentementExistant.dateFin !== null) {
    const consentementValide = consentementExistant.dateFin > maintenant;

    if (consentementValide && consentementExistant.typeAcces !== "urgence") {
      return {
        error:
          "Vous disposez deja d'un acces autorise a ce dossier : l'acces d'urgence, reserve a l'absence de consentement, n'est pas necessaire.",
        success: false,
      };
    }

    if (consentementValide && consentementExistant.typeAcces === "urgence") {
      return {
        error: `Un acces d'urgence est deja actif pour ce patient jusqu'a ${consentementExistant.dateFin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. Prolongation impossible : attendez son expiration.`,
        success: false,
      };
    }
  }

  const dateFin = new Date(maintenant.getTime() + DUREE_ACCES_URGENCE_MS);

  await prisma.$transaction(async (tx) => {
    await tx.consentement.upsert({
      where: { patientId_acteurAutoriseId: { patientId: patient.id, acteurAutoriseId: session.userId } },
      create: {
        patientId: patient.id,
        acteurAutoriseId: session.userId,
        typeAcces: "urgence",
        statut: "actif",
        dateDebut: maintenant,
        dateFin,
      },
      update: {
        typeAcces: "urgence",
        statut: "actif",
        dateDebut: maintenant,
        dateFin,
      },
    });

    await journaliser(
      {
        utilisateurId: session.userId,
        action: "acces_urgence",
        donneeConcernee: `patient:${patient.id}`,
        adresseTechnique,
        justification: `Motif : ${motif}. ${justification}`,
      },
      tx
    );
  });

  const heureExpiration = dateFin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  await creerNotification(
    patient.userId,
    "acces_urgence",
    `Votre dossier BHIP a ete consulte en urgence par ${professionnel.etablissement.nom} le ${maintenant.toLocaleDateString("fr-FR")}.`
  );

  const administrateursEtablissement = await prisma.professionnelSante.findMany({
    where: {
      etablissementId: professionnel.etablissementId,
      user: { roles: { some: { nom: "admin_etablissement" } } },
    },
    select: { userId: true },
  });

  await Promise.all(
    administrateursEtablissement.map((admin) =>
      creerNotification(
        admin.userId,
        "acces_urgence",
        `Acces d'urgence declenche par un professionnel de votre etablissement sur le dossier ${patient.identifiantSante}, expire a ${heureExpiration}.`,
        `/app/medecin/patients/${patient.id}`
      )
    )
  );

  return { error: null, success: true, patientId: patient.id, dateFin: dateFin.toISOString() };
}
