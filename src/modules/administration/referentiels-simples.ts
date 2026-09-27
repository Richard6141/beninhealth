"use server";

/**
 * Referentiels "listes simples" administrables (F-ADM-04 du pack) : services,
 * types d'etablissement, specialites, motifs de rendez-vous, dans UNE table
 * discriminee par "type" (ReferentielSimple). Meme principe que les
 * referentiels precedents : role admin_national (PLATFORM_ADMIN absent de ce
 * depot), RG-ADM-20 (desactivation seule, jamais suppression), RG-ADM-21
 * (versionnement) hors perimetre.
 *
 * Les valeurs de depart (referentiels-simples-catalogue.ts) sont semees une
 * seule fois par (type, code), sans jamais ecraser une entree existante.
 *
 * Perimetre : ce module fournit l'administration et la lecture des entrees
 * actives (getReferentielSimpleActif). Brancher un formulaire existant sur
 * une liste (services d'un etablissement, specialite d'un professionnel...)
 * releve du module proprietaire de ce formulaire.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import {
  REFERENTIELS_SIMPLES,
  TYPES_REFERENTIEL_SIMPLE,
  estTypeReferentielSimple,
  type TypeReferentielSimple,
} from "./referentiels-simples-catalogue";

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/**
 * Seme les valeurs de depart absentes, sans jamais ecraser une entree
 * existante. Une seule requete de comptage quand tout est deja en base (cas
 * courant : les formulaires lisent ces listes a chaque affichage), une seule
 * insertion groupee sinon.
 */
async function provisionnerParDefaut(type: TypeReferentielSimple): Promise<void> {
  const defauts = REFERENTIELS_SIMPLES[type].entreesParDefaut;
  const presents = await prisma.referentielSimple.count({
    where: { type, code: { in: defauts.map((entree) => entree.code) } },
  });

  if (presents >= defauts.length) {
    return;
  }

  await prisma.referentielSimple.createMany({
    data: defauts.map((entree, index) => ({
      type,
      code: entree.code,
      libelle: entree.libelle,
      ordre: index,
      actif: true,
    })),
    skipDuplicates: true,
  });
}

export interface EntreeReferentielSimpleResume {
  id: string;
  code: string;
  libelle: string;
  ordre: number;
  actif: boolean;
  dateModification: string; // ISO
}

/** Liste complete (actives et desactivees) d'un referentiel, pour l'ecran d'administration. */
export async function getReferentielSimpleComplet(type: string): Promise<EntreeReferentielSimpleResume[]> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "referentiel_simple"))) {
    return [];
  }

  if (!estTypeReferentielSimple(type)) {
    return [];
  }

  await provisionnerParDefaut(type);

  const entrees = await prisma.referentielSimple.findMany({
    where: { type },
    orderBy: [{ ordre: "asc" }, { libelle: "asc" }],
  });

  return entrees.map((entree) => ({
    id: entree.id,
    code: entree.code,
    libelle: entree.libelle,
    ordre: entree.ordre,
    actif: entree.actif,
    dateModification: entree.dateModification.toISOString(),
  }));
}

/**
 * Entrees ACTIVES d'un referentiel, pour peupler un formulaire. Ouverte a tout
 * utilisateur connecte : ce ne sont que des libelles de liste, sans donnee de
 * personne (meme principe que getReferentielVaccinsActifs).
 */
export async function getReferentielSimpleActif(type: string): Promise<{ code: string; libelle: string }[]> {
  const session = await getSession();

  if (!session || !estTypeReferentielSimple(type)) {
    return [];
  }

  await provisionnerParDefaut(type);

  const entrees = await prisma.referentielSimple.findMany({
    where: { type, actif: true },
    orderBy: [{ ordre: "asc" }, { libelle: "asc" }],
  });

  return entrees.map((entree) => ({ code: entree.code, libelle: entree.libelle }));
}

export interface ReferentielSimpleActionState {
  error: string | null;
  success: boolean;
}

const schemaCreation = z.object({
  type: z.enum(TYPES_REFERENTIEL_SIMPLE, { message: "Referentiel inconnu." }),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Le code est obligatoire.")
    .max(40, "40 caracteres maximum.")
    .regex(/^[a-z0-9_]+$/, "Le code ne doit contenir que des lettres minuscules, chiffres et underscores."),
  libelle: z.string().trim().min(1, "Le libelle est obligatoire.").max(120, "120 caracteres maximum."),
});

/** Ajoute une entree a la fin d'un referentiel (toujours active a la creation). */
export async function creerEntreeReferentielSimpleAction(
  prevState: ReferentielSimpleActionState,
  formData: FormData
): Promise<ReferentielSimpleActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "referentiel_simple"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaCreation.safeParse({
    type: formData.get("type"),
    code: formData.get("code"),
    libelle: formData.get("libelle"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  const { type, code, libelle } = validation.data;

  try {
    const existant = await prisma.referentielSimple.findUnique({ where: { type_code: { type, code } } });

    if (existant) {
      return { error: "Ce code existe deja dans ce referentiel.", success: false };
    }

    const dernier = await prisma.referentielSimple.aggregate({ where: { type }, _max: { ordre: true } });
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.referentielSimple.create({
        data: { type, code, libelle, ordre: (dernier._max.ordre ?? -1) + 1, actif: true },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_referentiel_simple",
          donneeConcernee: `referentiel_simple:${type}:${code}`,
          adresseTechnique,
          justification: `Entree "${libelle}" (${code}) ajoutee au referentiel ${REFERENTIELS_SIMPLES[type].libelle}.`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la creation d'une entree de referentiel :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaBasculement = z.object({
  id: z.string().trim().min(1, "L'entree est obligatoire."),
});

/** Active ou desactive une entree (RG-ADM-20 : jamais de suppression). */
export async function basculerActifEntreeReferentielSimpleAction(
  prevState: ReferentielSimpleActionState,
  formData: FormData
): Promise<ReferentielSimpleActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_simple"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaBasculement.safeParse({ id: formData.get("id") });

  if (!validation.success) {
    return { error: "Entree invalide.", success: false };
  }

  const { id } = validation.data;

  try {
    const entree = await prisma.referentielSimple.findUnique({ where: { id } });

    if (!entree) {
      return { error: "Cette entree est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.referentielSimple.update({
        where: { id },
        data: { actif: !entree.actif, dateModification: new Date() },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "basculement_referentiel_simple",
          donneeConcernee: `referentiel_simple:${entree.type}:${entree.code}`,
          adresseTechnique,
          justification: `Entree "${entree.libelle}" (${entree.type}) ${!entree.actif ? "activee" : "desactivee"} (etait ${entree.actif ? "active" : "desactivee"}).`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du basculement d'une entree de referentiel :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaReordonnancement = z.object({
  id: z.string().trim().min(1, "L'entree est obligatoire."),
  direction: z.enum(["haut", "bas"], { message: "Direction invalide." }),
});

/** Deplace une entree d'un cran dans son referentiel (echange son ordre avec son voisin). */
export async function reordonnerEntreeReferentielSimpleAction(
  prevState: ReferentielSimpleActionState,
  formData: FormData
): Promise<ReferentielSimpleActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_simple"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaReordonnancement.safeParse({
    id: formData.get("id"),
    direction: formData.get("direction"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  const { id, direction } = validation.data;

  try {
    const entree = await prisma.referentielSimple.findUnique({ where: { id } });

    if (!entree) {
      return { error: "Cette entree est introuvable.", success: false };
    }

    const toutes = await prisma.referentielSimple.findMany({
      where: { type: entree.type },
      orderBy: [{ ordre: "asc" }, { libelle: "asc" }],
    });
    const index = toutes.findIndex((candidat) => candidat.id === id);
    const indexVoisin = direction === "haut" ? index - 1 : index + 1;

    if (index === -1 || indexVoisin < 0 || indexVoisin >= toutes.length) {
      return { error: "Cette entree est deja a l'extremite de la liste.", success: false };
    }

    const voisin = toutes[indexVoisin];

    // Reecrit des ordres consecutifs : deux entrees a ordre egal (creation
    // concurrente) ne bloquent jamais l'echange.
    await prisma.$transaction(async (tx) => {
      for (const [position, candidat] of toutes.entries()) {
        let nouvelOrdre = position;
        if (candidat.id === entree.id) nouvelOrdre = indexVoisin;
        else if (candidat.id === voisin.id) nouvelOrdre = index;

        if (candidat.ordre !== nouvelOrdre) {
          await tx.referentielSimple.update({ where: { id: candidat.id }, data: { ordre: nouvelOrdre } });
        }
      }
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du reordonnancement d'une entree de referentiel :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
