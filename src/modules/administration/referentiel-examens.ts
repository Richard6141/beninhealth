"use server";

/**
 * Referentiel des examens medicaux, administrable (F-ADM-04 du pack, "Gerer
 * les referentiels"), 3e referentiel concret parmi les sept listes par le
 * pack (apres vaccins, medicaments) : CIM-10, medicaments, examens, vaccins,
 * motifs de rendez-vous, jours feries, modeles de SMS. "Motifs de
 * rendez-vous" ecarte comme candidat : le champ motif de RendezVous est un
 * simple texte libre dans ce depot (aucune liste statique existante a
 * transformer), pas un bon candidat pour ce pattern.
 *
 * Meme principe que src/modules/administration/referentiel-vaccinal.ts :
 * remplace le tableau statique historique REFERENTIEL_EXAMENS
 * (src/modules/laboratoire/referentiel-examens.ts) par une vraie table geree
 * par un administrateur (admin_national, PLATFORM_ADMIN absent de ce
 * depot).
 *
 * RG-ADM-20 (desactivation seule, jamais suppression) : ExamenMedical.typeExamen
 * reste un simple String (jamais une cle etrangere vers ce referentiel) :
 * un examen deja enregistre reste lisible meme si son libelle est ensuite
 * desactive ou meme si "Autre" en texte libre a ete utilise.
 *
 * RG-ADM-21 (versionnement) : hors perimetre ici, seul l'etat courant est
 * conserve. Limite assumee, comme pour les 2 referentiels precedents.
 *
 * Important, comme pour le calendrier vaccinal PEV : `estExamenSensible()`
 * (src/modules/laboratoire/referentiel-examens-sensibles.ts) et
 * `REFERENTIEL_PARAMETRES_EXAMENS` (src/modules/laboratoire/
 * referentiel-parametres-examens.ts, definitions de parametres par examen,
 * cle par CODE) restent codes en dur, cle sur le CODE/libelle d'ORIGINE
 * (le tableau statique historique REFERENTIEL_EXAMENS n'est pas supprime,
 * seulement remplace comme source de la LISTE affichee au medecin) : un
 * examen renomme ou desactive perd silencieusement ses parametres de
 * resultat structures (retour a la saisie libre), limite acceptee tant
 * qu'aucun ecran d'administration des parametres eux-memes n'existe.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { FAMILLES_EXAMENS, REFERENTIEL_EXAMENS } from "@/modules/laboratoire/referentiel-examens";

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/**
 * Seme les examens du tableau statique historique (REFERENTIEL_EXAMENS) une
 * seule fois par code, sans jamais ecraser une entree deja presente (meme
 * principe que provisionnerReferentielParDefaut du referentiel vaccinal) :
 * continuite du comportement existant a l'introduction de ce module.
 */
async function provisionnerReferentielParDefaut(): Promise<void> {
  await Promise.all(
    REFERENTIEL_EXAMENS.map((examen, index) =>
      prisma.examenReferentielAdmin.upsert({
        where: { code: examen.code },
        update: {},
        create: { code: examen.code, libelle: examen.libelle, famille: examen.famille, ordre: index, actif: true },
      })
    )
  );
}

export interface ExamenReferentielAdminResume {
  id: string;
  code: string;
  libelle: string;
  famille: string;
  ordre: number;
  actif: boolean;
  dateModification: string; // ISO
}

/** Liste complete (actifs et desactives), pour l'ecran d'administration uniquement. */
export async function getReferentielExamensComplet(): Promise<ExamenReferentielAdminResume[]> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "referentiel_examens"))) {
    return [];
  }

  await provisionnerReferentielParDefaut();

  const referentiel = await prisma.examenReferentielAdmin.findMany({
    orderBy: [{ famille: "asc" }, { ordre: "asc" }, { libelle: "asc" }],
  });

  return referentiel.map((entree) => ({
    id: entree.id,
    code: entree.code,
    libelle: entree.libelle,
    famille: entree.famille,
    ordre: entree.ordre,
    actif: entree.actif,
    dateModification: entree.dateModification.toISOString(),
  }));
}

export interface GroupeExamensActifs {
  famille: string;
  examens: { code: string; libelle: string }[];
}

/**
 * Examens actifs regroupes par famille, prets a peupler le formulaire de
 * demande d'examen (F-CLI-11 wait non, F-LAB-01,
 * src/app/app/medecin/examens/nouvelle). Gardee derriere create:examen_medical
 * (deja accorde a medecin) plutot qu'une permission dediee : cette liste
 * n'est qu'un support d'un formulaire deja autorise, pas une ressource
 * sensible en soi (meme principe que getReferentielVaccinsActifs).
 */
export async function getReferentielExamensActifs(): Promise<GroupeExamensActifs[]> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "examen_medical"))) {
    return [];
  }

  await provisionnerReferentielParDefaut();

  const referentiel = await prisma.examenReferentielAdmin.findMany({
    where: { actif: true },
    orderBy: [{ famille: "asc" }, { ordre: "asc" }, { libelle: "asc" }],
  });

  return FAMILLES_EXAMENS.map((famille) => ({
    famille,
    examens: referentiel
      .filter((entree) => entree.famille === famille)
      .map((entree) => ({ code: entree.code, libelle: entree.libelle })),
  })).filter((groupe) => groupe.examens.length > 0);
}

export interface ReferentielExamensActionState {
  error: string | null;
  success: boolean;
}

const schemaCreation = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Le code est obligatoire.")
    .max(40, "40 caracteres maximum.")
    .regex(/^[A-Z0-9_]+$/, "Le code ne doit contenir que des lettres majuscules, chiffres et underscores."),
  libelle: z.string().trim().min(1, "Le libelle est obligatoire.").max(200, "200 caracteres maximum."),
  famille: z.enum(FAMILLES_EXAMENS, { message: "Famille invalide." }),
});

/** Ajoute une entree au referentiel des examens (toujours active a la creation). */
export async function creerExamenReferentielAction(
  prevState: ReferentielExamensActionState,
  formData: FormData
): Promise<ReferentielExamensActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "referentiel_examens"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaCreation.safeParse({
    code: formData.get("code"),
    libelle: formData.get("libelle"),
    famille: formData.get("famille"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Donnees invalides.",
      success: false,
    };
  }

  const { code, libelle, famille } = validation.data;

  try {
    const existant = await prisma.examenReferentielAdmin.findUnique({ where: { code } });

    if (existant) {
      return { error: "Ce code d'examen existe deja dans le referentiel.", success: false };
    }

    const dernier = await prisma.examenReferentielAdmin.aggregate({
      where: { famille },
      _max: { ordre: true },
    });
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.examenReferentielAdmin.create({
        data: { code, libelle, famille, ordre: (dernier._max.ordre ?? -1) + 1, actif: true },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_referentiel_examens",
          donneeConcernee: `referentiel_examens:${code}`,
          adresseTechnique,
          justification: `Examen "${libelle}" (${code}, ${famille}) ajoute au referentiel.`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la creation du referentiel des examens :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaBasculement = z.object({
  id: z.string().trim().min(1, "L'examen est obligatoire."),
});

/** Active ou desactive une entree (RG-ADM-20 : jamais de suppression). */
export async function basculerActifExamenReferentielAction(
  prevState: ReferentielExamensActionState,
  formData: FormData
): Promise<ReferentielExamensActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_examens"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaBasculement.safeParse({ id: formData.get("id") });

  if (!validation.success) {
    return { error: "Examen invalide.", success: false };
  }

  const { id } = validation.data;

  try {
    const entree = await prisma.examenReferentielAdmin.findUnique({ where: { id } });

    if (!entree) {
      return { error: "Cet examen est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.examenReferentielAdmin.update({
        where: { id },
        data: { actif: !entree.actif, dateModification: new Date() },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "basculement_referentiel_examens",
          donneeConcernee: `referentiel_examens:${entree.code}`,
          adresseTechnique,
          justification: `Examen "${entree.libelle}" ${!entree.actif ? "active" : "desactive"} (etait ${entree.actif ? "actif" : "desactive"}).`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du basculement du referentiel des examens :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaReordonnancement = z.object({
  id: z.string().trim().min(1, "L'examen est obligatoire."),
  direction: z.enum(["haut", "bas"], { message: "Direction invalide." }),
});

/**
 * Deplace une entree d'un cran DANS SA FAMILLE (echange son "ordre" avec son
 * voisin immediat de la meme famille) : le referentiel est affiche groupe
 * par famille, reordonner entre familles n'aurait pas de sens visuel.
 */
export async function reordonnerExamenReferentielAction(
  prevState: ReferentielExamensActionState,
  formData: FormData
): Promise<ReferentielExamensActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_examens"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaReordonnancement.safeParse({
    id: formData.get("id"),
    direction: formData.get("direction"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Donnees invalides.",
      success: false,
    };
  }

  const { id, direction } = validation.data;

  try {
    const entree = await prisma.examenReferentielAdmin.findUnique({ where: { id } });

    if (!entree) {
      return { error: "Cet examen est introuvable.", success: false };
    }

    const tousTriesDeLaFamille = await prisma.examenReferentielAdmin.findMany({
      where: { famille: entree.famille },
      orderBy: [{ ordre: "asc" }, { libelle: "asc" }],
    });
    const index = tousTriesDeLaFamille.findIndex((candidat) => candidat.id === id);
    const indexVoisin = direction === "haut" ? index - 1 : index + 1;

    if (index === -1 || indexVoisin < 0 || indexVoisin >= tousTriesDeLaFamille.length) {
      return { error: "Cet examen est deja a cette extremite de sa famille.", success: false };
    }

    const voisin = tousTriesDeLaFamille[indexVoisin];
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.examenReferentielAdmin.update({ where: { id: entree.id }, data: { ordre: voisin.ordre } });
      await tx.examenReferentielAdmin.update({ where: { id: voisin.id }, data: { ordre: entree.ordre } });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "reordonnancement_referentiel_examens",
          donneeConcernee: `referentiel_examens:${entree.code}`,
          adresseTechnique,
          justification: `Examen "${entree.libelle}" deplace vers le ${direction} dans sa famille (echange avec "${voisin.libelle}").`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du reordonnancement du referentiel des examens :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
