"use server";

/**
 * Suspendre / reactiver / terminer l'affiliation d'un membre du personnel
 * (F-ETA-04 du pack, partie "Actions"). Nouveau fichier, aucune
 * modification de src/modules/identity/gestion-comptes.ts au-dela de
 * l'ajout du champ statutCompte a MembrePersonnel (partage cette nuit).
 *
 * Perimetre reduit et assume par rapport au pack : pas de flux
 * d'invitation/validation d'affiliation (RG-ETA-30 concerne la seule
 * affiliation FACILITY_ADMIN, hors de portee ici puisque
 * listPersonnelEtablissement exclut deja les comptes "Administration" de la
 * liste actionnable - voir son filtre specialite). "Suspendre" et
 * "terminer" reutilisent le champ User.statut existant (deja verifie a la
 * connexion, src/modules/identity/actions.ts : statut !== "actif" refuse
 * deja l'authentification, aucune modification necessaire de ce fichier
 * partage pour que la suspension ait un effet reel immediat).
 */

import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { STATUTS_QUI_LIBERENT_LE_CRENEAU } from "./rendez-vous-etats";
import {
  normaliserNumeroOrdre,
  numeroOrdreValide,
  professionDepuisRole,
} from "@/modules/identity/identite-professionnelle";

const SPECIALITE_ADMINISTRATION = "Administration";

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/**
 * Verifie que l'appelant est admin_etablissement et que le professionnel
 * cible (par son userId, jamais suppose) appartient bien au meme
 * etablissement et n'est pas un compte d'administration (RG-ETA-30 : cette
 * action ne s'applique jamais a une affiliation FACILITY_ADMIN, listPersonnelEtablissement
 * ne les affiche deja pas). Renvoie null si une seule de ces conditions
 * echoue.
 */
async function professionnelCibleAutorise(session: { userId: string }, professionnelUserId: string) {
  const adminProfil = await prisma.professionnelSante.findUnique({
    where: { userId: session.userId },
  });

  if (!adminProfil) {
    return null;
  }

  const cible = await prisma.professionnelSante.findUnique({
    where: { userId: professionnelUserId },
  });

  if (!cible || cible.etablissementId !== adminProfil.etablissementId || cible.specialite === SPECIALITE_ADMINISTRATION) {
    return null;
  }

  return cible;
}

export interface GestionPersonnelActionState {
  error: string | null;
  success: boolean;
}

const schemaMotif = z.object({
  userId: z.string().trim().min(1, "Le membre du personnel est obligatoire."),
  motif: z.string().trim().min(10, "Le motif doit comporter au moins 10 caracteres."),
});

/** Suspend le compte d'un membre du personnel (F-ETA-04) : effet immediat, la connexion est deja bloquee par le seul changement de statut. */
export async function suspendrePersonnelAction(
  prevState: GestionPersonnelActionState,
  formData: FormData
): Promise<GestionPersonnelActionState> {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_etablissement")) {
    return { error: "Action reservee aux administrateurs d'etablissement.", success: false };
  }

  const validation = schemaMotif.safeParse({
    userId: formData.get("userId"),
    motif: formData.get("motif"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  try {
    const cible = await professionnelCibleAutorise(session, validation.data.userId);

    if (!cible) {
      return { error: "Membre du personnel introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    // Seul un compte actif se suspend : suspendre un compte "termine" le rendrait reactivable.
    const suspendu = await prisma.$transaction(async (tx) => {
      const modifies = await tx.user.updateMany({ where: { id: validation.data.userId, statut: "actif" }, data: { statut: "suspendu" } });
      if (modifies.count !== 1) return false;
      await tx.sessionActive.deleteMany({ where: { userId: validation.data.userId } });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "suspension_personnel",
          donneeConcernee: `utilisateur:${validation.data.userId}`,
          adresseTechnique,
          justification: validation.data.motif,
        },
        tx
      );
      return true;
    });

    if (!suspendu) {
      return { error: "Ce compte n'est pas actif : seul un compte actif peut être suspendu.", success: false };
    }

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la suspension du personnel :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaUserId = z.object({
  userId: z.string().trim().min(1, "Le membre du personnel est obligatoire."),
});

/** Reactive le compte d'un membre du personnel precedemment suspendu (F-ETA-04). */
export async function reactiverPersonnelAction(
  prevState: GestionPersonnelActionState,
  formData: FormData
): Promise<GestionPersonnelActionState> {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_etablissement")) {
    return { error: "Action reservee aux administrateurs d'etablissement.", success: false };
  }

  const validation = schemaUserId.safeParse({ userId: formData.get("userId") });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  try {
    const cible = await professionnelCibleAutorise(session, validation.data.userId);

    if (!cible) {
      return { error: "Membre du personnel introuvable.", success: false };
    }

    // Un refus du ministere (F-ADM-03) ne se leve pas depuis l'etablissement : seule une approbation du validateur retablit le compte.
    if (cible.statutValidation === "rejete") {
      return {
        error: "Ce professionnel a été refusé par le ministère de la Santé : seule une nouvelle validation du ministère peut le rétablir.",
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    // Seul un compte suspendu se reactive : un compte "termine" reste ferme (voir terminerAffiliationAction).
    const reactive = await prisma.$transaction(async (tx) => {
      const modifies = await tx.user.updateMany({ where: { id: validation.data.userId, statut: "suspendu" }, data: { statut: "actif" } });
      if (modifies.count !== 1) return false;

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "reactivation_personnel",
          donneeConcernee: `utilisateur:${validation.data.userId}`,
          adresseTechnique,
          justification: "Reactivation du compte apres suspension.",
        },
        tx
      );
      return true;
    });

    if (!reactive) {
      return { error: "Ce compte n'est pas suspendu : seul un compte suspendu peut être réactivé.", success: false };
    }

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la reactivation du personnel :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

/**
 * Termine l'affiliation d'un membre du personnel (depart, F-ETA-04).
 * RG-ETA-31 : refuse s'il a des rendez-vous futurs non annules - ce depot
 * n'a pas de mecanisme de reaffectation, l'administrateur doit d'abord les
 * annuler autrement. Contrairement a la suspension, la terminaison n'est
 * PAS reactivable par reactiverPersonnelAction (statut distinct "termine"),
 * meme principe que les comptes "fusionne"/"sans_compte" ailleurs dans ce
 * depot : jamais de suppression, un statut fixe.
 */
export async function terminerAffiliationAction(
  prevState: GestionPersonnelActionState,
  formData: FormData
): Promise<GestionPersonnelActionState> {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_etablissement")) {
    return { error: "Action reservee aux administrateurs d'etablissement.", success: false };
  }

  const validation = schemaMotif.safeParse({
    userId: formData.get("userId"),
    motif: formData.get("motif"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  try {
    const cible = await professionnelCibleAutorise(session, validation.data.userId);

    if (!cible) {
      return { error: "Membre du personnel introuvable.", success: false };
    }

    const rendezVousFuturs = await prisma.rendezVous.count({
      where: {
        professionnelId: cible.id,
        date: { gte: new Date() },
        statut: { notIn: [...STATUTS_QUI_LIBERENT_LE_CRENEAU] },
      },
    });

    if (rendezVousFuturs > 0) {
      return {
        error: `Impossible : ${rendezVousFuturs} rendez-vous futur(s) sont encore affectes a ce professionnel. Annulez-les ou reaffectez-les avant de terminer l'affiliation.`,
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: validation.data.userId }, data: { statut: "termine" } });
      await tx.sessionActive.deleteMany({ where: { userId: validation.data.userId } });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "fin_affiliation_personnel",
          donneeConcernee: `utilisateur:${validation.data.userId}`,
          adresseTechnique,
          justification: validation.data.motif,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la fin d'affiliation du personnel :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaNumeroOrdre = z.object({
  userId: z.string().trim().min(1, "Le membre du personnel est obligatoire."),
  numeroOrdre: z.string(),
});

const MESSAGE_NUMERO_ORDRE_EXISTANT =
  "Ce numéro d'inscription est déjà enregistré sur la plateforme pour cette profession. Contactez le ministère si la personne exerce dans votre établissement.";

/**
 * Renseigne ou corrige le numero d'inscription a l'Ordre d'un membre du
 * personnel (F-ADM-03 : la reponse a une demande de complement du ministere).
 * La profession est deduite du role du compte, jamais saisie. Toute
 * modification annule la verification precedente et la demande de complement :
 * le validateur doit reverifier le nouveau numero. Refuse pour un profil
 * refuse par le ministere (seule une approbation du validateur le retablit).
 */
export async function renseignerNumeroOrdreAction(
  prevState: GestionPersonnelActionState,
  formData: FormData
): Promise<GestionPersonnelActionState> {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_etablissement")) {
    return { error: "Action reservee aux administrateurs d'etablissement.", success: false };
  }

  const validation = schemaNumeroOrdre.safeParse({
    userId: formData.get("userId"),
    numeroOrdre: formData.get("numeroOrdre") ?? "",
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  const numeroOrdre = normaliserNumeroOrdre(validation.data.numeroOrdre);

  if (numeroOrdre === null || !numeroOrdreValide(numeroOrdre)) {
    return { error: "Numéro d'inscription invalide : lettres, chiffres, points, tirets et barres uniquement.", success: false };
  }

  try {
    const cible = await professionnelCibleAutorise(session, validation.data.userId);

    if (!cible) {
      return { error: "Membre du personnel introuvable.", success: false };
    }

    if (cible.statutValidation === "rejete") {
      return { error: "Ce profil a été refusé par le ministère de la Santé : seule une nouvelle validation du ministère peut le rétablir.", success: false };
    }

    const compte = await prisma.user.findUnique({
      where: { id: validation.data.userId },
      select: { roles: { select: { nom: true } } },
    });
    const profession = (compte?.roles ?? []).map((role) => professionDepuisRole(role.nom)).find((p) => p !== null) ?? null;

    if (profession === null) {
      return { error: "Ce membre n'a pas de profession réglementée : aucun numéro d'inscription à l'Ordre n'est attendu.", success: false };
    }

    if (cible.profession === profession && cible.numeroOrdre === numeroOrdre) {
      return { error: "Ce numéro est déjà enregistré pour ce membre.", success: false };
    }

    // Ne pas reveler qui est deja enregistre ni ou : un simple constat d'existence.
    const dejaEnregistre = await prisma.professionnelSante.findFirst({
      where: { profession, numeroOrdre, id: { not: cible.id } },
      select: { id: true },
    });

    if (dejaEnregistre) {
      return { error: MESSAGE_NUMERO_ORDRE_EXISTANT, success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    const enregistre = await prisma.$transaction(async (tx) => {
      const modifies = await tx.professionnelSante.updateMany({
        where: { id: cible.id, statutValidation: { not: "rejete" } },
        data: {
          profession,
          numeroOrdre,
          ordreVerifieLe: null,
          ordreVerifiePar: null,
          validationDecision: null,
          validationMessage: null,
          validationDecideLe: null,
        },
      });
      if (modifies.count !== 1) return false;

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "numero_ordre_renseigne",
          donneeConcernee: `utilisateur:${validation.data.userId}`,
          adresseTechnique,
          justification: "Numero d'inscription a l'Ordre renseigne ou corrige, a reverifier par le ministere.",
        },
        tx
      );
      return true;
    });

    if (!enregistre) {
      return { error: "Ce profil a été refusé par le ministère de la Santé : seule une nouvelle validation du ministère peut le rétablir.", success: false };
    }

    if (cible.validationDecision === "complement") {
      const validateurs = await prisma.user.findMany({
        where: { statut: "actif", roles: { some: { nom: "admin_national" } } },
        select: { id: true },
      });
      await Promise.all(
        validateurs.map((validateur) =>
          creerNotification(
            validateur.id,
            "validation_complement_recu",
            "Un établissement a répondu à une demande de complément : un profil est de nouveau à vérifier.",
            "/app/ministere/validation-professionnels"
          ).catch((erreur) => console.error("Erreur lors de la notification du validateur :", erreur))
        )
      );
    }

    return { error: null, success: true };
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
      return { error: MESSAGE_NUMERO_ORDRE_EXISTANT, success: false };
    }
    console.error("Erreur lors de l'enregistrement du numero d'ordre :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
