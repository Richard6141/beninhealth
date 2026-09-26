"use server";

/**
 * Catalogue des notifications administrable (F-NOT-04 du pack,
 * docs/pack claude/specs/17-fiches-notifications.md ligne ~47) et 4e
 * referentiel administrable concret parmi les sept listes par le pack
 * F-ADM-04 (apres vaccins, medicaments, examens), meme principe : voir
 * src/modules/administration/referentiel-vaccinal.ts pour le pattern
 * d'origine reproduit ici.
 *
 * Perimetre volontairement reduit (limite assumee) :
 * - seul le texte du modele SMS (texteModele) et l'etat actif/inactif sont
 *   reellement administrables au sens metier ; declencheur, destinataire et
 *   canaux restent des colonnes DOCUMENTAIRES du catalogue (reprises du
 *   tableau du pack), pas des parametres consommes par un envoi reel.
 * - aucun appelant existant (creerNotification, envoyerSms, le flux OTP...)
 *   ne lit cette table aujourd'hui : la migration des appels existants
 *   (une quinzaine, repartis dans plusieurs modules critiques) vers ce
 *   catalogue est un chantier transverse hors perimetre de cette nuit,
 *   documente dans docs/coordination-agents.md. L'infrastructure
 *   demontrable (catalogue complet, modifiable, trace) suffit ici.
 * - RG-ADM-20 (desactivation seule, jamais suppression) : meme principe que
 *   les 3 referentiels precedents. RG-ADM-21 (versionnement) hors
 *   perimetre, meme limite assumee.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { CATALOGUE_NOTIFICATIONS_DEFAUT } from "@/modules/notification/catalogue-defaut";

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
 * Seme le catalogue du pack une seule fois, sans jamais ecraser une entree
 * deja presente (meme principe que provisionnerReferentielParDefaut dans
 * referentiel-vaccinal.ts) : un administrateur peut ensuite modifier
 * librement le texte ou l'etat actif d'un code sans qu'un redemarrage ne
 * revienne en arriere.
 */
async function provisionnerReferentielParDefaut(): Promise<void> {
  await Promise.all(
    CATALOGUE_NOTIFICATIONS_DEFAUT.map((entree, index) =>
      prisma.modeleNotification.upsert({
        where: { code: entree.code },
        update: {},
        create: {
          code: entree.code,
          declencheur: entree.declencheur,
          destinataire: entree.destinataire,
          canaux: entree.canaux,
          texteModele: entree.texteModele,
          ordre: index,
          actif: true,
        },
      })
    )
  );
}

export interface ModeleNotificationResume {
  id: string;
  code: string;
  declencheur: string;
  destinataire: string;
  canaux: string;
  texteModele: string;
  actif: boolean;
  dateModification: string; // ISO
}

/** Liste complete (actifs et desactives), pour l'ecran d'administration (admin_national). */
export async function getReferentielNotificationsComplet(): Promise<ModeleNotificationResume[]> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "referentiel_notification"))) {
    return [];
  }

  await provisionnerReferentielParDefaut();

  const referentiel = await prisma.modeleNotification.findMany({
    orderBy: [{ ordre: "asc" }, { code: "asc" }],
  });

  return referentiel.map((entree) => ({
    id: entree.id,
    code: entree.code,
    declencheur: entree.declencheur,
    destinataire: entree.destinataire,
    canaux: entree.canaux,
    texteModele: entree.texteModele,
    actif: entree.actif,
    dateModification: entree.dateModification.toISOString(),
  }));
}

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface ReferentielNotificationActionState {
  error: string | null;
  success: boolean;
}

const schemaCreation = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Le code est obligatoire.")
    .max(60, "60 caracteres maximum.")
    .regex(/^[A-Z0-9-]+$/, "Le code ne peut contenir que des lettres majuscules, chiffres et tirets."),
  declencheur: z.string().trim().min(1, "Le declencheur est obligatoire.").max(200, "200 caracteres maximum."),
  destinataire: z.string().trim().min(1, "Le destinataire est obligatoire.").max(200, "200 caracteres maximum."),
  canaux: z.string().trim().min(1, "Les canaux sont obligatoires.").max(100, "100 caracteres maximum."),
  texteModele: z.string().trim().max(320, "320 caracteres maximum.").optional().default(""),
});

/** Ajoute une entree au catalogue (toujours active a la creation). */
export async function creerModeleNotificationAction(
  prevState: ReferentielNotificationActionState,
  formData: FormData
): Promise<ReferentielNotificationActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "referentiel_notification"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaCreation.safeParse({
    code: formData.get("code"),
    declencheur: formData.get("declencheur"),
    destinataire: formData.get("destinataire"),
    canaux: formData.get("canaux"),
    texteModele: formData.get("texteModele"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Donnees invalides.",
      success: false,
    };
  }

  const { code, declencheur, destinataire, canaux, texteModele } = validation.data;

  try {
    const existant = await prisma.modeleNotification.findUnique({ where: { code } });

    if (existant) {
      return { error: "Ce code existe deja dans le catalogue.", success: false };
    }

    const dernier = await prisma.modeleNotification.aggregate({ _max: { ordre: true } });
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.modeleNotification.create({
        data: {
          code,
          declencheur,
          destinataire,
          canaux,
          texteModele,
          ordre: (dernier._max.ordre ?? -1) + 1,
          actif: true,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_referentiel_notification",
          donneeConcernee: `referentiel_notification:${code}`,
          adresseTechnique,
          justification: `Code de notification "${code}" ajoute au catalogue.`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la creation du catalogue des notifications :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaTexte = z.object({
  id: z.string().trim().min(1, "Le code est obligatoire."),
  texteModele: z.string().trim().max(320, "320 caracteres maximum.").optional().default(""),
});

/** Modifie le texte du modele (SMS) d'une entree existante. */
export async function mettreAJourTexteModeleAction(
  prevState: ReferentielNotificationActionState,
  formData: FormData
): Promise<ReferentielNotificationActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_notification"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaTexte.safeParse({
    id: formData.get("id"),
    texteModele: formData.get("texteModele"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Texte invalide.",
      success: false,
    };
  }

  const { id, texteModele } = validation.data;

  try {
    const entree = await prisma.modeleNotification.findUnique({ where: { id } });

    if (!entree) {
      return { error: "Ce code est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.modeleNotification.update({
        where: { id },
        data: { texteModele, dateModification: new Date() },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "modification_texte_referentiel_notification",
          donneeConcernee: `referentiel_notification:${entree.code}`,
          adresseTechnique,
          justification: `Texte du modele "${entree.code}" modifie.`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la modification du catalogue des notifications :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaBasculement = z.object({
  id: z.string().trim().min(1, "Le code est obligatoire."),
});

/**
 * Active ou desactive une entree (RG-ADM-20 : jamais de suppression). Sans
 * effet operationnel aujourd'hui (aucun appelant ne lit encore cette table),
 * mais coherent avec les 3 autres referentiels administrables du depot.
 */
export async function basculerActifModeleNotificationAction(
  prevState: ReferentielNotificationActionState,
  formData: FormData
): Promise<ReferentielNotificationActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_notification"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaBasculement.safeParse({ id: formData.get("id") });

  if (!validation.success) {
    return { error: "Code invalide.", success: false };
  }

  const { id } = validation.data;

  try {
    const entree = await prisma.modeleNotification.findUnique({ where: { id } });

    if (!entree) {
      return { error: "Ce code est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.modeleNotification.update({
        where: { id },
        data: { actif: !entree.actif, dateModification: new Date() },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "basculement_referentiel_notification",
          donneeConcernee: `referentiel_notification:${entree.code}`,
          adresseTechnique,
          justification: `Code de notification "${entree.code}" ${!entree.actif ? "active" : "desactive"} (etait ${entree.actif ? "actif" : "desactive"}).`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du basculement du catalogue des notifications :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
