"use server";

/**
 * Table de correspondance allergie <-> classe ATC, administrable (F-ADM-04 du
 * pack, F-PRE-02 / RG-PRE-10). Meme patron que
 * src/modules/administration/referentiels-simples.ts (semis des valeurs de
 * depart sans jamais ecraser une entree existante, RG-ADM-20 : desactivation
 * seule, jamais suppression) et meme ressource RBAC que
 * referentiel-medicaments.ts ("referentiel_medicament", admin_national) :
 * cette table appartient au meme perimetre fonctionnel (referentiel du
 * medicament) et une ressource dediee "referentiel_correspondance_allergie"
 * aurait exige de toucher src/security/permissions.ts, hors perimetre de ce
 * chantier (voir docs/coordination-agents.md, plusieurs sessions actives ce
 * soir sur ce fichier).
 *
 * Consommateur principal : le controle de securite "allergie" de la
 * prescription (F-PRE-02, src/modules/prescription/referentiel-allergies.ts,
 * module pur sans acces Prisma) via getCorrespondancesAllergieAtcActives.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import type { CorrespondanceAllergieAtc } from "./correspondance-allergie-atc-catalogue";
import { DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC, analyserPrefixesAtc } from "./correspondance-allergie-atc-catalogue";

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/** Compare normalise (insensible accents/casse/espaces superflus), meme principe que referentiel-allergies.ts. */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Seme les entrees de depart absentes, sans jamais ecraser une entree
 * existante (une entree deja modifiee ou desactivee par l'administration
 * n'est jamais reecrasee au redemarrage).
 */
async function provisionnerParDefaut(): Promise<void> {
  const defauts = DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC;
  const presentes = await prisma.correspondanceAllergieAtc.count({
    where: { allergie: { in: defauts.map((entree) => normaliser(entree.allergie)) } },
  });

  if (presentes >= defauts.length) {
    return;
  }

  await prisma.correspondanceAllergieAtc.createMany({
    data: defauts.map((entree) => ({
      allergie: normaliser(entree.allergie),
      libelleClasse: entree.libelleClasse,
      prefixesAtc: entree.prefixesAtc.join(","),
      actif: true,
    })),
    skipDuplicates: true,
  });
}

export interface CorrespondanceAllergieAtcResume {
  id: string;
  allergie: string;
  libelleClasse: string;
  prefixesAtc: string[];
  actif: boolean;
  dateModification: string; // ISO
}

function versResume(entree: {
  id: string;
  allergie: string;
  libelleClasse: string;
  prefixesAtc: string;
  actif: boolean;
  dateModification: Date;
}): CorrespondanceAllergieAtcResume {
  return {
    id: entree.id,
    allergie: entree.allergie,
    libelleClasse: entree.libelleClasse,
    prefixesAtc: entree.prefixesAtc.split(",").filter((prefixe) => prefixe.length > 0),
    actif: entree.actif,
    dateModification: entree.dateModification.toISOString(),
  };
}

/** Liste complete (actives et desactivees), pour l'ecran d'administration uniquement. */
export async function getCorrespondancesAllergieAtcCompletes(): Promise<CorrespondanceAllergieAtcResume[]> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "referentiel_medicament"))) {
    return [];
  }

  await provisionnerParDefaut();

  const entrees = await prisma.correspondanceAllergieAtc.findMany({ orderBy: { allergie: "asc" } });
  return entrees.map(versResume);
}

/**
 * Entrees ACTIVES, pour le controle de securite allergie (F-PRE-02). Ouverte
 * a tout utilisateur connecte (aucune donnee de personne, uniquement un
 * referentiel de classes, meme principe que getReferentielSimpleActif) : la
 * seule autorite reelle reste le controle serveur qui l'appelle
 * (creerPrescriptionAction), jamais un affichage client.
 */
export async function getCorrespondancesAllergieAtcActives(): Promise<CorrespondanceAllergieAtc[]> {
  const session = await getSession();

  if (!session) {
    return [];
  }

  await provisionnerParDefaut();

  const entrees = await prisma.correspondanceAllergieAtc.findMany({ where: { actif: true } });
  return entrees.map((entree) => ({
    allergie: entree.allergie,
    libelleClasse: entree.libelleClasse,
    prefixesAtc: entree.prefixesAtc.split(",").filter((prefixe) => prefixe.length > 0),
  }));
}

export interface CorrespondanceAllergieAtcActionState {
  error: string | null;
  success: boolean;
}

const schemaCreation = z.object({
  allergie: z.string().trim().min(1, "Le terme d'allergie est obligatoire.").max(80, "80 caracteres maximum."),
  libelleClasse: z.string().trim().min(1, "Le libelle de la classe est obligatoire.").max(120, "120 caracteres maximum."),
  prefixesAtc: z.string().trim().min(1, "Au moins un prefixe ATC est obligatoire."),
});

/** Ajoute une entree (toujours active a la creation). */
export async function creerCorrespondanceAllergieAtcAction(
  prevState: CorrespondanceAllergieAtcActionState,
  formData: FormData
): Promise<CorrespondanceAllergieAtcActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "referentiel_medicament"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaCreation.safeParse({
    allergie: formData.get("allergie"),
    libelleClasse: formData.get("libelleClasse"),
    prefixesAtc: formData.get("prefixesAtc"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  const prefixesAnalyses = analyserPrefixesAtc(validation.data.prefixesAtc);
  if (!prefixesAnalyses.ok) {
    return { error: prefixesAnalyses.error, success: false };
  }

  const allergie = normaliser(validation.data.allergie);
  const { libelleClasse } = validation.data;

  try {
    const existante = await prisma.correspondanceAllergieAtc.findUnique({ where: { allergie } });

    if (existante) {
      return { error: "Cette allergie est deja liee a une classe ATC.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.correspondanceAllergieAtc.create({
        data: { allergie, libelleClasse, prefixesAtc: prefixesAnalyses.prefixes.join(","), actif: true },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_correspondance_allergie_atc",
          donneeConcernee: `correspondance_allergie_atc:${allergie}`,
          adresseTechnique,
          justification: `Correspondance allergie "${allergie}" -> ${libelleClasse} (${prefixesAnalyses.prefixes.join(", ")}) ajoutee.`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la creation d'une correspondance allergie/ATC :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaBasculement = z.object({
  id: z.string().trim().min(1, "L'entree est obligatoire."),
});

/** Active ou desactive une entree (RG-ADM-20 : jamais de suppression). */
export async function basculerActifCorrespondanceAllergieAtcAction(
  prevState: CorrespondanceAllergieAtcActionState,
  formData: FormData
): Promise<CorrespondanceAllergieAtcActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_medicament"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaBasculement.safeParse({ id: formData.get("id") });

  if (!validation.success) {
    return { error: "Entree invalide.", success: false };
  }

  const { id } = validation.data;

  try {
    const entree = await prisma.correspondanceAllergieAtc.findUnique({ where: { id } });

    if (!entree) {
      return { error: "Cette entree est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.correspondanceAllergieAtc.update({
        where: { id },
        data: { actif: !entree.actif, dateModification: new Date() },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "basculement_correspondance_allergie_atc",
          donneeConcernee: `correspondance_allergie_atc:${entree.allergie}`,
          adresseTechnique,
          justification: `Correspondance allergie "${entree.allergie}" ${!entree.actif ? "activee" : "desactivee"} (etait ${entree.actif ? "active" : "desactivee"}).`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du basculement d'une correspondance allergie/ATC :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
