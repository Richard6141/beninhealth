"use server";

/**
 * Parametres numeriques et fonctionnalites activables (F-ADM-07 du pack).
 * Reserve a PLATFORM_ADMIN dans le pack, role absent de ce depot : ouvert a
 * admin_national, meme adaptation documentee que F-AUD-01/02 et F-ADM-06.
 *
 * RG-IA-02 : toute fonctionnalite d'IA doit se trouver derriere l'une des
 * fonctionnalites activables ci-dessous, desactivee par defaut en
 * production. Ce module fournit l'infrastructure (table, ecran, RBAC,
 * journalisation) pour que ce depot soit pret le jour ou une fonctionnalite
 * du chapitre 16 est effectivement construite ; aucune fonctionnalite d'IA
 * n'est construite ici elle-meme.
 *
 * RG-ADM-50 : chaque modification prend effet sans redemarrage (lue en base
 * a chaque appel, jamais mise en cache en memoire par ce module) et est
 * journalisee.
 *
 * Les 4 parametres du catalogue (parametres-catalogue.ts) sont lus par leur
 * consommateur reel a chaque appel via parametres-lecture.ts : duree du code de
 * verification e-mail, duree de l'acces d'une reference, limite d'acces
 * d'urgence par 24 h, duree du code de partage. D'autres constantes du code
 * (ex. duree du code de reinitialisation du mot de passe, duree du code d'acces
 * par telephone) ne sont pas encore administrables.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { estFonctionnaliteIa, evaluerFonctionnaliteIa } from "@/modules/ai/evaluation";
import { can } from "@/security/permissions";
import { PARAMETRES_PAR_DEFAUT } from "./parametres-catalogue";
import {
  CLES_FONCTIONNALITES,
  ACTIVE_PAR_DEFAUT,
  DESCRIPTIONS_FONCTIONNALITES,
  type CleFonctionnalite,
} from "@/modules/administration/fonctionnalites-catalogue";

// Pas de re-export de valeur ici (CLES_FONCTIONNALITES) : un fichier
// "use server" ne peut exporter que des fonctions async, voir l'erreur de
// build "A 'use server' file can only export async functions, found object"
// rencontree en construisant ce module. Importer CLES_FONCTIONNALITES
// directement depuis @/modules/administration/fonctionnalites-catalogue.
export type { CleFonctionnalite };

async function estAdminNationalConnecte(): Promise<{ userId: string } | null> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "parametre"))) {
    return null;
  }

  return { userId: session.userId };
}

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

/**
 * Cree les fonctionnalites du catalogue si elles n'existent pas encore (etat
 * par defaut : ACTIVE_PAR_DEFAUT, IA et autres desactivees, RG-IA-02, modules
 * metier actifs), sans jamais modifier une ligne deja presente (donc jamais
 * ecraser une activation existante).
 */
async function provisionnerFonctionnalitesParDefaut(): Promise<void> {
  await Promise.all(
    CLES_FONCTIONNALITES.map((cle) =>
      prisma.fonctionnaliteActivable.upsert({
        where: { cle },
        update: {},
        create: { cle, actif: ACTIVE_PAR_DEFAUT[cle], description: DESCRIPTIONS_FONCTIONNALITES[cle] },
      })
    )
  );
}

export interface FonctionnaliteResume {
  id: string;
  cle: string;
  actif: boolean;
  description: string;
  dateModification: string; // ISO
}

/** Liste des fonctionnalites activables, dans l'ordre du catalogue MVP. */
export async function getFonctionnalitesActivables(): Promise<FonctionnaliteResume[]> {
  if (!(await estAdminNationalConnecte())) {
    return [];
  }

  await provisionnerFonctionnalitesParDefaut();

  const fonctionnalites = await prisma.fonctionnaliteActivable.findMany({
    orderBy: { cle: "asc" },
  });

  return fonctionnalites.map((fonctionnalite) => ({
    id: fonctionnalite.id,
    cle: fonctionnalite.cle,
    actif: fonctionnalite.actif,
    description: fonctionnalite.description,
    dateModification: fonctionnalite.dateModification.toISOString(),
  }));
}

/**
 * Verifie si une fonctionnalite est active. Point d'entree destine a etre
 * appele par une future fonctionnalite (ex. un ecran d'IA) avant de
 * s'executer, jamais mis en cache (RG-ADM-50 : effet immediat d'un
 * basculement). Renvoie false pour toute cle inconnue plutot que de lever
 * une exception (fail-safe, meme principe que can() dans permissions.ts).
 */
export async function estFonctionnaliteActive(cle: CleFonctionnalite): Promise<boolean> {
  let fonctionnalite: { actif: boolean } | null = null;
  try {
    fonctionnalite = await prisma.fonctionnaliteActivable.findUnique({ where: { cle }, select: { actif: true } });
  } catch (erreur) {
    console.error("[administration] lecture de la fonctionnalite impossible, etat par defaut utilise :", cle, erreur);
  }
  // Ligne absente (jamais provisionnee) : etat par defaut du catalogue, modules actifs, le reste desactive.
  return fonctionnalite?.actif ?? ACTIVE_PAR_DEFAUT[cle];
}

/** Etat renvoye par basculerFonctionnaliteAction, consomme via useActionState. */
export interface ParametresActionState {
  error: string | null;
  success: boolean;
}

const schemaBasculement = z.object({
  cle: z.enum(CLES_FONCTIONNALITES, { message: "Fonctionnalite inconnue." }),
});

/** Active ou desactive une fonctionnalite (bascule l'etat actuel). */
export async function basculerFonctionnaliteAction(
  prevState: ParametresActionState,
  formData: FormData
): Promise<ParametresActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "parametre"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaBasculement.safeParse({ cle: formData.get("cle") });

  if (!validation.success) {
    return { error: "Fonctionnalite invalide.", success: false };
  }

  const { cle } = validation.data;

  try {
    await provisionnerFonctionnalitesParDefaut();

    const actuelle = await prisma.fonctionnaliteActivable.findUniqueOrThrow({ where: { cle } });

    // RG-IA-20 : une fonctionnalite d'IA ne s'allume que si son jeu d'evaluation passe, avec le fournisseur et la base actuels.
    if (estFonctionnaliteIa(cle) && !actuelle.actif) {
      const evaluation = await evaluerFonctionnaliteIa(cle);
      if (evaluation.echecs.length > 0) {
        return {
          error: `Activation refusée : le jeu d'évaluation de l'IA échoue (${evaluation.conformes}/${evaluation.total} dossiers conformes). Voir la gouvernance de l'IA.`,
          success: false,
        };
      }
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.fonctionnaliteActivable.update({
        where: { cle },
        data: { actif: !actuelle.actif, dateModification: new Date() },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "modification_fonctionnalite_activable",
          donneeConcernee: `fonctionnalite:${cle}`,
          adresseTechnique,
          justification: `Fonctionnalite "${cle}" ${!actuelle.actif ? "activee" : "desactivee"} (etait ${actuelle.actif ? "active" : "desactivee"}).`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du basculement de fonctionnalite :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

async function provisionnerParametresParDefaut(): Promise<void> {
  await Promise.all(
    PARAMETRES_PAR_DEFAUT.map((parametre) =>
      prisma.parametre.upsert({
        where: { cle: parametre.cle },
        // Seul le texte est rafraichi : jamais la valeur, les bornes ni le defaut deja fixes.
        update: { description: parametre.description },
        create: { ...parametre, valeur: parametre.valeurDefaut },
      })
    )
  );
}

export interface ParametreResume {
  id: string;
  cle: string;
  valeur: number;
  valeurDefaut: number;
  borneMin: number;
  borneMax: number;
  description: string;
  dateModification: string; // ISO
}

/** Liste des parametres numeriques, tries par cle. */
export async function getParametres(): Promise<ParametreResume[]> {
  if (!(await estAdminNationalConnecte())) {
    return [];
  }

  await provisionnerParametresParDefaut();

  const parametres = await prisma.parametre.findMany({ orderBy: { cle: "asc" } });

  return parametres.map((parametre) => ({
    id: parametre.id,
    cle: parametre.cle,
    valeur: parametre.valeur,
    valeurDefaut: parametre.valeurDefaut,
    borneMin: parametre.borneMin,
    borneMax: parametre.borneMax,
    description: parametre.description,
    dateModification: parametre.dateModification.toISOString(),
  }));
}

const schemaModificationParametre = z.object({
  cle: z.string().trim().min(1, "Le parametre est obligatoire."),
  valeur: z.coerce.number({ message: "La valeur doit etre un nombre." }),
});

/**
 * Modifie la valeur effective d'un parametre, apres verification qu'elle
 * reste dans les bornes min/max definies (jamais une confiance aveugle dans
 * la valeur transmise par le formulaire).
 */
export async function modifierParametreAction(
  prevState: ParametresActionState,
  formData: FormData
): Promise<ParametresActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "parametre"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaModificationParametre.safeParse({
    cle: formData.get("cle"),
    valeur: formData.get("valeur"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Donnees de parametre invalides.",
      success: false,
    };
  }

  const { cle, valeur } = validation.data;

  try {
    const parametre = await prisma.parametre.findUnique({ where: { cle } });

    if (!parametre) {
      return { error: "Parametre introuvable.", success: false };
    }

    if (valeur < parametre.borneMin || valeur > parametre.borneMax) {
      return {
        error: `La valeur doit etre comprise entre ${parametre.borneMin} et ${parametre.borneMax}.`,
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const ancienneValeur = parametre.valeur;

    await prisma.$transaction(async (tx) => {
      await tx.parametre.update({
        where: { cle },
        data: { valeur, dateModification: new Date() },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "modification_parametre",
          donneeConcernee: `parametre:${cle}`,
          adresseTechnique,
          justification: `Parametre "${cle}" modifie de ${ancienneValeur} a ${valeur}.`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la modification du parametre :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
