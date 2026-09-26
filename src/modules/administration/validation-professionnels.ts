"use server";

/**
 * F-ADM-03 du pack (chapitre 15, "Valider un professionnel") : le validateur du
 * ministere (admin_national, permission dediee validation_professionnel)
 * verifie le numero d'inscription d'un professionnel aupres de l'Ordre
 * concerne (procedure manuelle, hors plateforme, docs/conception-transfert-dossier.md
 * section 12), puis approuve, refuse avec un motif, ou demande un complement.
 *
 * Perimetre reduit et documente (docs/coordination-agents.md) :
 * - les comptes crees par un administrateur d'etablissement restent actifs
 *   des leur creation (Phase 6) : la file contient donc des professionnels
 *   deja en poste dont le numero n'a jamais ete verifie ; elle ne bloque pas
 *   l'integration de nouveaux professionnels ;
 * - pas de televersement de carte professionnelle : le validateur ne voit que
 *   l'identite, la profession, le numero et l'etablissement ;
 * - REFUSER a un effet reel : le compte est suspendu, ses sessions fermees et
 *   ses affiliations suspendues (RG-ROL-08) ; seule une approbation ulterieure
 *   du validateur les retablit ;
 * - le validateur ne lit aucune donnee clinique (RG-ROL-06) et ne peut pas
 *   valider son propre profil (RG-ADM-11).
 *
 * Zero Trust : la session est relue dans chaque action, le professionnel cible
 * est recharge en base (jamais suppose valide parce que l'id vient du client),
 * et chaque decision est ecrite avec un verrou optimiste (deux validateurs
 * simultanes ne peuvent pas decider deux fois de la meme demande).
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { PROFESSIONS_CLINIQUES } from "@/modules/identity/identite-professionnelle";
import {
  MOTIFS_REFUS,
  delaiCibleDepasse,
  etatVerification,
  heuresOuvreesEcoulees,
  type EtatVerification,
  type ProfessionnelAValider,
  type ValidationProfessionnelActionState,
} from "./validation-professionnels-regles";

const ORDRE_ETATS: Record<EtatVerification, number> = {
  a_traiter: 0,
  complement: 1,
  a_revalider: 2,
  verifie: 3,
  refuse: 4,
};

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

/** Professionnel clinique cible (jamais un administrateur, jamais un patient), recharge en base. */
async function chargerProfessionnelClinique(professionnelId: string) {
  const professionnel = await prisma.professionnelSante.findUnique({
    where: { id: professionnelId },
    include: {
      user: { select: { id: true, nom: true, prenom: true, roles: { select: { nom: true } } } },
    },
  });

  if (!professionnel) return null;
  const estClinique = professionnel.user.roles.some((role) => (PROFESSIONS_CLINIQUES as readonly string[]).includes(role.nom));
  return estClinique ? professionnel : null;
}

/** Administrateurs actifs de l'etablissement du professionnel (ceux qui l'ont recrute). */
async function administrateursDeLEtablissement(etablissementId: string): Promise<string[]> {
  const administrateurs = await prisma.user.findMany({
    where: {
      statut: "actif",
      roles: { some: { nom: "admin_etablissement" } },
      professionnel: { etablissementId },
    },
    select: { id: true },
  });
  return administrateurs.map((administrateur) => administrateur.id);
}

async function notifier(destinataires: string[], type: string, message: string, lien?: string): Promise<void> {
  // Apres le commit : une notification manquee ne doit jamais annuler la decision deja actee.
  await Promise.all(
    destinataires.map((id) =>
      creerNotification(id, type, message, lien).catch((erreur) => {
        console.error("Erreur lors de la notification d'une decision de validation :", erreur);
      })
    )
  );
}

/**
 * File du validateur : tous les professionnels cliniques, avec leur etat de
 * verification et le delai ecoule (RG-ADM-10). Renvoie null sans la permission
 * (l'ecran affiche alors un acces refuse), jamais un tableau vide qui
 * laisserait croire qu'il n'y a rien a traiter.
 */
export async function getFileValidationProfessionnels(): Promise<ProfessionnelAValider[] | null> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "validation_professionnel"))) {
    return null;
  }

  const professionnels = await prisma.professionnelSante.findMany({
    where: { user: { roles: { some: { nom: { in: [...PROFESSIONS_CLINIQUES] } } } } },
    include: {
      user: { select: { nom: true, prenom: true, email: true, dateCreation: true, roles: { select: { nom: true } } } },
      etablissement: { select: { nom: true } },
    },
  });

  const maintenant = new Date();

  const lignes = professionnels.map((professionnel): ProfessionnelAValider => {
    const etat = etatVerification(professionnel, maintenant);
    const role = professionnel.user.roles.map((r) => r.nom).find((nom) => (PROFESSIONS_CLINIQUES as readonly string[]).includes(nom)) ?? "";

    return {
      id: professionnel.id,
      nomComplet: `${professionnel.user.prenom} ${professionnel.user.nom}`,
      email: professionnel.user.email,
      role,
      specialite: professionnel.specialite,
      profession: professionnel.profession,
      numeroOrdre: professionnel.numeroOrdre,
      etablissementNom: professionnel.etablissement.nom,
      dateDemande: professionnel.user.dateCreation.toISOString(),
      heuresOuvreesEcoulees: Math.round(heuresOuvreesEcoulees(professionnel.user.dateCreation, maintenant)),
      delaiDepasse: etat === "a_traiter" && delaiCibleDepasse(professionnel.user.dateCreation, maintenant),
      etat,
      ordreVerifieLe: professionnel.ordreVerifieLe?.toISOString() ?? null,
      decision: professionnel.validationDecision,
      message: professionnel.validationMessage,
      dateDecision: professionnel.validationDecideLe?.toISOString() ?? null,
    };
  });

  return lignes.sort(
    (a, b) => ORDRE_ETATS[a.etat] - ORDRE_ETATS[b.etat] || a.dateDemande.localeCompare(b.dateDemande)
  );
}

const schemaApprobation = z.object({
  professionnelId: z.string().trim().min(1, "Le professionnel est obligatoire."),
  confirmation: z.literal("on", { message: "Confirmez que le numéro a été vérifié auprès de l'Ordre." }),
});

/** Approuve : le numero a ete verifie aupres de l'Ordre. Retablit un professionnel precedemment refuse. */
export async function approuverProfessionnelAction(
  prevState: ValidationProfessionnelActionState,
  formData: FormData
): Promise<ValidationProfessionnelActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "validation_professionnel"))) {
    return { error: "Action réservée au validateur du ministère.", success: false };
  }

  const validation = schemaApprobation.safeParse({
    professionnelId: texte(formData, "professionnelId"),
    confirmation: texte(formData, "confirmation"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Données invalides.", success: false };
  }

  try {
    const cible = await chargerProfessionnelClinique(validation.data.professionnelId);

    if (!cible) {
      return { error: "Professionnel introuvable.", success: false };
    }

    if (cible.userId === session.userId) {
      return { error: "Vous ne pouvez pas valider votre propre profil (RG-ADM-11).", success: false };
    }

    if (!cible.profession || !cible.numeroOrdre) {
      return {
        error: "Aucun numéro d'inscription à l'Ordre n'est renseigné : demandez un complément à l'établissement avant d'approuver.",
        success: false,
      };
    }

    const maintenant = new Date();
    const adresseTechnique = await adresseTechniqueCourante();

    const decide = await prisma.$transaction(async (tx) => {
      const misAJour = await tx.professionnelSante.updateMany({
        where: {
          id: cible.id,
          statutValidation: cible.statutValidation,
          validationDecideLe: cible.validationDecideLe,
          ordreVerifieLe: cible.ordreVerifieLe,
        },
        data: {
          statutValidation: "valide",
          ordreVerifieLe: maintenant,
          ordreVerifiePar: session.userId,
          validationDecision: "approuve",
          validationMessage: null,
          validationDecideLe: maintenant,
        },
      });

      if (misAJour.count !== 1) return false;

      if (cible.statutValidation === "rejete") {
        await tx.user.updateMany({ where: { id: cible.userId, statut: "suspendu" }, data: { statut: "actif" } });
        await tx.affiliationProfessionnelle.updateMany({
          where: { professionnelId: cible.id, statut: "suspendue" },
          data: { statut: "active" },
        });
      }
      await tx.affiliationProfessionnelle.updateMany({
        where: { professionnelId: cible.id, statut: "invitee" },
        data: { statut: "active" },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "validation_professionnel_approuvee",
          donneeConcernee: `professionnel:${cible.id}`,
          adresseTechnique,
          justification: "Numéro d'inscription vérifié auprès de l'Ordre (procédure manuelle du validateur).",
        },
        tx
      );

      return true;
    });

    if (!decide) {
      return { error: "Cette demande a été traitée entre-temps. Actualisez la liste.", success: false };
    }

    await notifier([cible.userId], "profil_professionnel_valide", "Votre profil professionnel a été vérifié par le ministère de la Santé.");

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'approbation d'un professionnel :", erreur);
    return { error: "Une erreur est survenue. Veuillez réessayer.", success: false };
  }
}

const schemaRefus = z
  .object({
    professionnelId: z.string().trim().min(1, "Le professionnel est obligatoire."),
    motif: z.enum(MOTIFS_REFUS.map((m) => m.code) as [string, ...string[]], { message: "Choisissez un motif de refus." }),
    precision: z.string().trim().max(500, "500 caractères maximum."),
  })
  .refine((donnees) => donnees.motif !== "autre" || donnees.precision.length >= 10, {
    message: "Pour « Autre motif », précisez au moins 10 caractères.",
    path: ["precision"],
  });

/**
 * Refuse le profil, motif obligatoire. Effet reel : compte suspendu, sessions
 * fermees, affiliations suspendues (RG-ROL-08), verification precedente annulee.
 * Notifie le professionnel et les administrateurs de son etablissement.
 */
export async function refuserProfessionnelAction(
  prevState: ValidationProfessionnelActionState,
  formData: FormData
): Promise<ValidationProfessionnelActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "validation_professionnel"))) {
    return { error: "Action réservée au validateur du ministère.", success: false };
  }

  const validation = schemaRefus.safeParse({
    professionnelId: texte(formData, "professionnelId"),
    motif: texte(formData, "motif"),
    precision: texte(formData, "precision"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Données invalides.", success: false };
  }

  try {
    const cible = await chargerProfessionnelClinique(validation.data.professionnelId);

    if (!cible) {
      return { error: "Professionnel introuvable.", success: false };
    }

    if (cible.userId === session.userId) {
      return { error: "Vous ne pouvez pas valider votre propre profil (RG-ADM-11).", success: false };
    }

    const libelleMotif = MOTIFS_REFUS.find((m) => m.code === validation.data.motif)?.libelle ?? validation.data.motif;
    const message = validation.data.precision ? `${libelleMotif} : ${validation.data.precision}` : libelleMotif;
    const maintenant = new Date();
    const adresseTechnique = await adresseTechniqueCourante();

    const decide = await prisma.$transaction(async (tx) => {
      const misAJour = await tx.professionnelSante.updateMany({
        where: {
          id: cible.id,
          statutValidation: cible.statutValidation,
          validationDecideLe: cible.validationDecideLe,
          ordreVerifieLe: cible.ordreVerifieLe,
        },
        data: {
          statutValidation: "rejete",
          ordreVerifieLe: null,
          ordreVerifiePar: null,
          validationDecision: "refuse",
          validationMessage: message,
          validationDecideLe: maintenant,
        },
      });

      if (misAJour.count !== 1) return false;

      await tx.user.updateMany({ where: { id: cible.userId, statut: "actif" }, data: { statut: "suspendu" } });
      await tx.sessionActive.deleteMany({ where: { userId: cible.userId } });
      await tx.affiliationProfessionnelle.updateMany({
        where: { professionnelId: cible.id, statut: { in: ["active", "invitee"] } },
        data: { statut: "suspendue" },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "validation_professionnel_refusee",
          donneeConcernee: `professionnel:${cible.id}`,
          adresseTechnique,
          justification: `Profil refusé, compte suspendu. Motif : ${message}`,
        },
        tx
      );

      return true;
    });

    if (!decide) {
      return { error: "Cette demande a été traitée entre-temps. Actualisez la liste.", success: false };
    }

    const nomComplet = `${cible.user.prenom} ${cible.user.nom}`;
    await notifier([cible.userId], "profil_professionnel_refuse", `Votre profil professionnel a été refusé par le ministère de la Santé. Motif : ${message}`);
    await notifier(
      await administrateursDeLEtablissement(cible.etablissementId),
      "personnel_validation_refusee",
      `Le ministère a refusé le profil de ${nomComplet} et suspendu son compte. Motif : ${message}`,
      "/app/etablissement"
    );

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du refus d'un professionnel :", erreur);
    return { error: "Une erreur est survenue. Veuillez réessayer.", success: false };
  }
}

const schemaComplement = z.object({
  professionnelId: z.string().trim().min(1, "Le professionnel est obligatoire."),
  message: z.string().trim().min(10, "Le message doit comporter au moins 10 caractères.").max(500, "500 caractères maximum."),
});

/**
 * Demande un complement : message au professionnel et a l'administrateur de
 * son etablissement. Ne suspend rien (le professionnel reste en poste tant
 * que le ministere ne refuse pas) ; la reponse se fait hors plateforme, sans
 * televersement de document dans ce depot.
 */
export async function demanderComplementProfessionnelAction(
  prevState: ValidationProfessionnelActionState,
  formData: FormData
): Promise<ValidationProfessionnelActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "validation_professionnel"))) {
    return { error: "Action réservée au validateur du ministère.", success: false };
  }

  const validation = schemaComplement.safeParse({
    professionnelId: texte(formData, "professionnelId"),
    message: texte(formData, "message"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Données invalides.", success: false };
  }

  try {
    const cible = await chargerProfessionnelClinique(validation.data.professionnelId);

    if (!cible) {
      return { error: "Professionnel introuvable.", success: false };
    }

    if (cible.userId === session.userId) {
      return { error: "Vous ne pouvez pas valider votre propre profil (RG-ADM-11).", success: false };
    }

    if (cible.statutValidation === "rejete") {
      return { error: "Ce profil a déjà été refusé : approuvez-le d'abord pour le rétablir.", success: false };
    }

    const maintenant = new Date();
    const adresseTechnique = await adresseTechniqueCourante();

    const decide = await prisma.$transaction(async (tx) => {
      const misAJour = await tx.professionnelSante.updateMany({
        where: {
          id: cible.id,
          statutValidation: cible.statutValidation,
          validationDecideLe: cible.validationDecideLe,
          ordreVerifieLe: cible.ordreVerifieLe,
        },
        data: {
          validationDecision: "complement",
          validationMessage: validation.data.message,
          validationDecideLe: maintenant,
        },
      });

      if (misAJour.count !== 1) return false;

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "validation_professionnel_complement",
          donneeConcernee: `professionnel:${cible.id}`,
          adresseTechnique,
          justification: `Complément demandé : ${validation.data.message}`,
        },
        tx
      );

      return true;
    });

    if (!decide) {
      return { error: "Cette demande a été traitée entre-temps. Actualisez la liste.", success: false };
    }

    const nomComplet = `${cible.user.prenom} ${cible.user.nom}`;
    await notifier([cible.userId], "profil_professionnel_complement", `Le ministère demande un complément pour votre profil professionnel : ${validation.data.message}`);
    await notifier(
      await administrateursDeLEtablissement(cible.etablissementId),
      "personnel_validation_complement",
      `Le ministère demande un complément pour le profil de ${nomComplet} : ${validation.data.message}`,
      "/app/etablissement"
    );

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la demande de complément :", erreur);
    return { error: "Une erreur est survenue. Veuillez réessayer.", success: false };
  }
}
