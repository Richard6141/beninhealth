"use server";

/**
 * Referentiel medicaments administrable (F-ADM-04 du pack, "Gerer les
 * referentiels"), deuxieme referentiel concret couvert apres le referentiel
 * vaccinal (voir src/modules/administration/referentiel-vaccinal.ts pour le
 * meme perimetre reduit : parmi les sept listes du pack, seuls vaccins et
 * medicaments sont administrables dans ce depot).
 *
 * A la difference du referentiel vaccinal (tableau statique promu en table
 * neuve ce soir), le modele Prisma `Medicament` existe deja depuis les
 * Phases 5/9 (catalogue de prescription/delivrance) : ce module ne fait
 * qu'exposer un ecran d'administration par-dessus, avec le meme principe
 * RG-ADM-20 (desactivation seule, jamais de suppression - une entree deja
 * utilisee par une vraie LignePrescription ne peut de toute facon pas etre
 * supprimee sans casser la relation).
 *
 * RG-ADM-21 (versionnement : chaque modification cree une nouvelle version
 * numerotee, datee, avec auteur et commentaire) : hors perimetre ici, meme
 * limite assumee que le referentiel vaccinal. Seul l'etat courant est
 * conserve ; une modification de posologie/contre-indication sur un
 * medicament deja prescrit ne modifie jamais retroactivement les
 * prescriptions existantes (LignePrescription.posologie est deja une chaine
 * figee au moment de la creation, independante du catalogue).
 *
 * Role cible : PLATFORM_ADMIN absent de ce depot, route vers admin_national
 * (meme adaptation que parametres.ts et etablissements.ts). Ressource RBAC
 * "referentiel_medicament", DISTINCTE de "medicament" (accordee a
 * pharmacien pour la delivrance, voir permissions.ts) : reutiliser cette
 * derniere aurait par erreur permis a un pharmacien d'appeler directement
 * les Server Actions ci-dessous (creerMedicamentAction et consorts sont
 * atteignables sans passer par l'ecran) puisque can() ne distingue pas deux
 * usages differents d'une meme chaine de permission. Bug reel introduit
 * puis corrige avant tout commit ce soir, voir docs/coordination-agents.md.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

export interface MedicamentReferentielResume {
  id: string;
  nom: string;
  principeActif: string;
  dosage: string;
  forme: string;
  classeTherapeutique: string;
  ageMinimumMois: number | null;
  contreIndiqueGrossesse: boolean;
  informationsComplementaires: string;
  actif: boolean;
}

function versResume(medicament: {
  id: string;
  nom: string;
  principeActif: string;
  dosage: string;
  forme: string;
  classeTherapeutique: string;
  ageMinimumMois: number | null;
  contreIndiqueGrossesse: boolean;
  informationsComplementaires: string;
  actif: boolean;
}): MedicamentReferentielResume {
  return {
    id: medicament.id,
    nom: medicament.nom,
    principeActif: medicament.principeActif,
    dosage: medicament.dosage,
    forme: medicament.forme,
    classeTherapeutique: medicament.classeTherapeutique,
    ageMinimumMois: medicament.ageMinimumMois,
    contreIndiqueGrossesse: medicament.contreIndiqueGrossesse,
    informationsComplementaires: medicament.informationsComplementaires,
    actif: medicament.actif,
  };
}

/**
 * Liste complete (actifs et desactives), triee par nom, pour l'ecran
 * d'administration uniquement (admin_national). Tableau vide si l'appelant
 * n'a pas le role requis : aucune exception, Zero Trust.
 */
export async function getReferentielMedicamentsComplet(): Promise<MedicamentReferentielResume[]> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "referentiel_medicament"))) {
    return [];
  }

  const medicaments = await prisma.medicament.findMany({ orderBy: { nom: "asc" } });
  return medicaments.map(versResume);
}

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface ReferentielMedicamentsActionState {
  error: string | null;
  success: boolean;
}

const schemaMedicament = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire.").max(100, "100 caracteres maximum."),
  principeActif: z.string().trim().min(1, "Le principe actif (DCI) est obligatoire.").max(100),
  dosage: z.string().trim().min(1, "Le dosage est obligatoire.").max(50),
  forme: z.string().trim().min(1, "La forme galenique est obligatoire.").max(50),
  classeTherapeutique: z.string().trim().max(100).optional().default(""),
  // Chaine vide = pas de restriction d'age (ageMinimumMois reste null),
  // jamais 0 par defaut (0 serait une vraie contre-indication "des la
  // naissance", distincte de "aucune restriction connue").
  ageMinimumMois: z.string().trim().optional().default(""),
  contreIndiqueGrossesse: z.coerce.boolean().optional().default(false),
  informationsComplementaires: z.string().trim().max(500).optional().default(""),
});

function parseAgeMinimumMois(valeur: string): { ok: true; valeur: number | null } | { ok: false } {
  if (valeur.length === 0) return { ok: true, valeur: null };
  const nombre = Number(valeur);
  if (!Number.isInteger(nombre) || nombre < 0) return { ok: false };
  return { ok: true, valeur: nombre };
}

/** Ajoute un medicament au catalogue (toujours actif a la creation). */
export async function creerMedicamentAction(
  prevState: ReferentielMedicamentsActionState,
  formData: FormData
): Promise<ReferentielMedicamentsActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "referentiel_medicament"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaMedicament.safeParse({
    nom: formData.get("nom"),
    principeActif: formData.get("principeActif"),
    dosage: formData.get("dosage"),
    forme: formData.get("forme"),
    classeTherapeutique: formData.get("classeTherapeutique"),
    ageMinimumMois: formData.get("ageMinimumMois"),
    contreIndiqueGrossesse: formData.get("contreIndiqueGrossesse"),
    informationsComplementaires: formData.get("informationsComplementaires"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Donnees de medicament invalides.",
      success: false,
    };
  }

  const ageMinimumParse = parseAgeMinimumMois(validation.data.ageMinimumMois);
  if (!ageMinimumParse.ok) {
    return { error: "L'age minimum doit etre un nombre entier de mois positif, ou vide.", success: false };
  }

  const donnees = validation.data;

  try {
    const adresseTechnique = await adresseTechniqueCourante();

    const medicamentCree = await prisma.$transaction(async (tx) => {
      const cree = await tx.medicament.create({
        data: {
          nom: donnees.nom,
          principeActif: donnees.principeActif,
          dosage: donnees.dosage,
          forme: donnees.forme,
          classeTherapeutique: donnees.classeTherapeutique,
          ageMinimumMois: ageMinimumParse.valeur,
          contreIndiqueGrossesse: donnees.contreIndiqueGrossesse,
          informationsComplementaires: donnees.informationsComplementaires,
          actif: true,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_referentiel_medicament",
          donneeConcernee: `medicament:${cree.id}`,
          adresseTechnique,
          justification: `Medicament "${cree.nom}" (${cree.principeActif}) ajoute au referentiel.`,
        },
        tx
      );

      return cree;
    });

    void medicamentCree;
    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la creation du medicament :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaModification = schemaMedicament.extend({
  id: z.string().trim().min(1, "Le medicament est obligatoire."),
});

/** Modifie les champs d'un medicament existant (jamais son statut actif, voir basculerActifMedicamentAction). */
export async function modifierMedicamentAction(
  prevState: ReferentielMedicamentsActionState,
  formData: FormData
): Promise<ReferentielMedicamentsActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_medicament"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaModification.safeParse({
    id: formData.get("id"),
    nom: formData.get("nom"),
    principeActif: formData.get("principeActif"),
    dosage: formData.get("dosage"),
    forme: formData.get("forme"),
    classeTherapeutique: formData.get("classeTherapeutique"),
    ageMinimumMois: formData.get("ageMinimumMois"),
    contreIndiqueGrossesse: formData.get("contreIndiqueGrossesse"),
    informationsComplementaires: formData.get("informationsComplementaires"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Donnees de medicament invalides.",
      success: false,
    };
  }

  const ageMinimumParse = parseAgeMinimumMois(validation.data.ageMinimumMois);
  if (!ageMinimumParse.ok) {
    return { error: "L'age minimum doit etre un nombre entier de mois positif, ou vide.", success: false };
  }

  const { id, ...donnees } = validation.data;

  try {
    const existant = await prisma.medicament.findUnique({ where: { id } });

    if (!existant) {
      return { error: "Ce medicament est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.medicament.update({
        where: { id },
        data: {
          nom: donnees.nom,
          principeActif: donnees.principeActif,
          dosage: donnees.dosage,
          forme: donnees.forme,
          classeTherapeutique: donnees.classeTherapeutique,
          ageMinimumMois: ageMinimumParse.valeur,
          contreIndiqueGrossesse: donnees.contreIndiqueGrossesse,
          informationsComplementaires: donnees.informationsComplementaires,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "modification_referentiel_medicament",
          donneeConcernee: `medicament:${id}`,
          adresseTechnique,
          justification: `Medicament "${existant.nom}" modifie (voir nouvelles valeurs en base).`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la modification du medicament :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaBasculement = z.object({
  id: z.string().trim().min(1, "Le medicament est obligatoire."),
});

/**
 * Active ou desactive un medicament (RG-ADM-20 : jamais de suppression,
 * cohérent avec la contrainte relationnelle reelle vers LignePrescription).
 * Un medicament desactive disparait du catalogue propose a la creation
 * d'une prescription (une fois que src/modules/prescription/actions.ts
 * filtre sur `actif`, voir note de coordination) mais reste lisible sur
 * toute prescription deja enregistree.
 */
export async function basculerActifMedicamentAction(
  prevState: ReferentielMedicamentsActionState,
  formData: FormData
): Promise<ReferentielMedicamentsActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_medicament"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaBasculement.safeParse({ id: formData.get("id") });

  if (!validation.success) {
    return { error: "Medicament invalide.", success: false };
  }

  const { id } = validation.data;

  try {
    const existant = await prisma.medicament.findUnique({ where: { id } });

    if (!existant) {
      return { error: "Ce medicament est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.medicament.update({ where: { id }, data: { actif: !existant.actif } });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "basculement_referentiel_medicament",
          donneeConcernee: `medicament:${id}`,
          adresseTechnique,
          justification: `Medicament "${existant.nom}" ${!existant.actif ? "active" : "desactive"} (etait ${existant.actif ? "actif" : "desactive"}).`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du basculement du medicament :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
