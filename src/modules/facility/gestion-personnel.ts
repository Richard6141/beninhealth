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
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";

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

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: validation.data.userId }, data: { statut: "suspendu" } });

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
    });

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

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: validation.data.userId }, data: { statut: "actif" } });

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
    });

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
        statut: { notIn: ["annule"] },
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
