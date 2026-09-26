"use server";

/**
 * Referentiel des jours feries, administrable (F-ADM-04 du pack, "Gerer les
 * referentiels"), 5e referentiel concret apres vaccins, medicaments, examens
 * et modeles de notification. Consommateur reel : la verification des
 * creneaux de rendez-vous (RG-ETA-42, src/modules/facility/creneau-disponible.ts)
 * refuse un rendez-vous un jour ferie actif.
 *
 * Meme principe que les referentiels precedents : role admin_national
 * (PLATFORM_ADMIN absent de ce depot), RG-ADM-20 (desactivation seule, jamais
 * suppression), RG-ADM-21 (versionnement) hors perimetre.
 *
 * Les jours fixes et les fetes chretiennes mobiles se generent par annee
 * (jours-feries-calcul.ts). Les fetes musulmanes dependent de la lune : elles
 * se saisissent a la main. Une annee non generee n'a aucun jour ferie, donc
 * aucun blocage : le referentiel ne peut que restreindre, jamais empecher un
 * rendez-vous par defaut.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import {
  dateDepuisJourCivil,
  jourCivilDepuisDate,
  jourCivilValide,
  joursFeriesDeterministes,
} from "./jours-feries-calcul";

const ANNEE_MIN = 2020;
const ANNEE_MAX = 2100;

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

export interface JourFerieResume {
  id: string;
  date: string; // AAAA-MM-JJ
  libelle: string;
  actif: boolean;
  source: string;
}

/** Jours feries d'une annee, actifs et desactives, pour l'ecran d'administration uniquement. */
export async function getJoursFeries(annee: number): Promise<JourFerieResume[]> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "jour_ferie"))) {
    return [];
  }

  if (!Number.isInteger(annee) || annee < ANNEE_MIN || annee > ANNEE_MAX) {
    return [];
  }

  const jours = await prisma.jourFerie.findMany({
    where: {
      date: { gte: dateDepuisJourCivil(`${annee}-01-01`), lte: dateDepuisJourCivil(`${annee}-12-31`) },
    },
    orderBy: { date: "asc" },
  });

  return jours.map((jour) => ({
    id: jour.id,
    date: jourCivilDepuisDate(jour.date),
    libelle: jour.libelle,
    actif: jour.actif,
    source: jour.source,
  }));
}

export interface ReferentielJoursFeriesActionState {
  error: string | null;
  success: boolean;
  /** Nombre de jours ajoutes par une generation (0 si tout existait deja). */
  nombreAjoutes?: number;
}

const schemaCreation = z.object({
  date: z.string().trim().refine(jourCivilValide, "La date doit etre un jour valide au format AAAA-MM-JJ."),
  libelle: z.string().trim().min(1, "Le libelle est obligatoire.").max(100, "100 caracteres maximum."),
});

/** Ajoute un jour ferie saisi a la main (toujours actif a la creation). */
export async function creerJourFerieAction(
  prevState: ReferentielJoursFeriesActionState,
  formData: FormData
): Promise<ReferentielJoursFeriesActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "jour_ferie"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaCreation.safeParse({ date: formData.get("date"), libelle: formData.get("libelle") });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  const { date, libelle } = validation.data;

  try {
    const existant = await prisma.jourFerie.findUnique({ where: { date: dateDepuisJourCivil(date) } });

    if (existant) {
      return { error: "Un jour ferie existe deja a cette date.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.jourFerie.create({
        data: { date: dateDepuisJourCivil(date), libelle, actif: true, source: "saisie" },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_referentiel_jours_feries",
          donneeConcernee: `referentiel_jours_feries:${date}`,
          adresseTechnique,
          justification: `Jour ferie "${libelle}" (${date}) ajoute au referentiel.`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la creation d'un jour ferie :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaBasculement = z.object({
  id: z.string().trim().min(1, "Le jour ferie est obligatoire."),
});

/** Active ou desactive un jour ferie (RG-ADM-20 : jamais de suppression). */
export async function basculerActifJourFerieAction(
  prevState: ReferentielJoursFeriesActionState,
  formData: FormData
): Promise<ReferentielJoursFeriesActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "jour_ferie"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaBasculement.safeParse({ id: formData.get("id") });

  if (!validation.success) {
    return { error: "Jour ferie invalide.", success: false };
  }

  const { id } = validation.data;

  try {
    const entree = await prisma.jourFerie.findUnique({ where: { id } });

    if (!entree) {
      return { error: "Ce jour ferie est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const date = jourCivilDepuisDate(entree.date);

    await prisma.$transaction(async (tx) => {
      await tx.jourFerie.update({
        where: { id },
        data: { actif: !entree.actif, dateModification: new Date() },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "basculement_referentiel_jours_feries",
          donneeConcernee: `referentiel_jours_feries:${date}`,
          adresseTechnique,
          justification: `Jour ferie "${entree.libelle}" (${date}) ${!entree.actif ? "active" : "desactive"} (etait ${entree.actif ? "actif" : "desactive"}).`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du basculement d'un jour ferie :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaGeneration = z.object({
  annee: z.coerce
    .number({ message: "L'annee doit etre un nombre." })
    .int("L'annee doit etre un nombre entier.")
    .min(ANNEE_MIN, `L'annee doit etre comprise entre ${ANNEE_MIN} et ${ANNEE_MAX}.`)
    .max(ANNEE_MAX, `L'annee doit etre comprise entre ${ANNEE_MIN} et ${ANNEE_MAX}.`),
});

/**
 * Genere les jours feries deterministes d'une annee (dates fixes et fetes
 * chretiennes mobiles). Ne remplace ni ne reactive jamais une date deja
 * presente (une date desactivee a la main le reste) : seuls les jours
 * manquants sont ajoutes.
 */
export async function genererJoursFeriesAction(
  prevState: ReferentielJoursFeriesActionState,
  formData: FormData
): Promise<ReferentielJoursFeriesActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "jour_ferie"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaGeneration.safeParse({ annee: formData.get("annee") });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Annee invalide.", success: false };
  }

  const { annee } = validation.data;

  try {
    const adresseTechnique = await adresseTechniqueCourante();
    const calcules = joursFeriesDeterministes(annee);

    const nombreAjoutes = await prisma.$transaction(async (tx) => {
      const resultat = await tx.jourFerie.createMany({
        data: calcules.map((jour) => ({
          date: dateDepuisJourCivil(jour.date),
          libelle: jour.libelle,
          actif: true,
          source: "genere",
        })),
        skipDuplicates: true,
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "generation_referentiel_jours_feries",
          donneeConcernee: `referentiel_jours_feries:${annee}`,
          adresseTechnique,
          justification: `Jours feries de ${annee} generes : ${resultat.count} ajoute(s) sur ${calcules.length} (les dates deja presentes sont conservees telles quelles).`,
        },
        tx
      );

      return resultat.count;
    });

    return { error: null, success: true, nombreAjoutes };
  } catch (erreur) {
    console.error("Erreur lors de la generation des jours feries :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
