"use server";

/**
 * Server Actions du module pilotage : alertes epidemiologiques simples
 * (F-PIL-06 du pack), lecture et revue humaine uniquement.
 *
 * La DETECTION ne vit plus ici depuis le 2026-09-28 : elle s'executait au
 * chargement de l'ecran (ecriture pendant une lecture, jamais executee si
 * personne n'ouvrait l'ecran). Elle tourne desormais en tache planifiee
 * horaire, voir src/modules/pilotage/detection-alertes.ts (regle du pack,
 * resolution de la zone, liste "declaration immediate" et limites
 * assumees). Ce fichier ne fait plus que lire HealthAlertReview et
 * enregistrer la decision humaine (RG-PIL-50).
 */

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { GROUPES_MALADIES } from "./referentiel-groupes-maladies";
import { z } from "zod";

const LIBELLES_GROUPE = new Map(GROUPES_MALADIES.map((g) => [g.code, g.libelle]));

/** Une alerte epidemiologique (F-PIL-06), traitee ou non. */
export interface AlerteEpidemiologique {
  id: string;
  zoneSanitaireNom: string;
  groupeMaladiesLibelle: string;
  semaine: string;
  casObserves: number;
  seuilCalcule: number;
  statut: "nouvelle" | "vue" | "fermee";
  commentaire: string | null;
  motifFermeture: string | null;
  reviewerNomComplet: string | null;
  dateCreation: string; // ISO
  dateRevue: string | null;
}

function nomComplet(utilisateur: { nom: string; prenom: string }): string {
  return `${utilisateur.prenom} ${utilisateur.nom}`;
}

/**
 * Renvoie toutes les alertes (nouvelles, vues et fermees), les plus recentes
 * en premier, sans jamais rien ecrire (detection planifiee, voir
 * detection-alertes.ts). Reserve a admin_national (meme role que les autres
 * ecrans du chapitre 14, RG-PIL-20).
 */
export async function getAlertesEpidemiologiques(): Promise<AlerteEpidemiologique[] | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const role = session.roles.find((r) => can(r, "read", "analytics"));

  if (!role) {
    return null;
  }

  const alertes = await prisma.healthAlertReview.findMany({
    include: { reviewer: true },
    orderBy: [{ dateCreation: "desc" }],
  });

  const zoneIds = [...new Set(alertes.map((a) => a.zoneSanitaireId))];
  const zones = await prisma.zoneSanitaire.findMany({ where: { id: { in: zoneIds } } });
  const nomZone = new Map(zones.map((z) => [z.id, z.nom]));

  return alertes.map((alerte) => ({
    id: alerte.id,
    zoneSanitaireNom: nomZone.get(alerte.zoneSanitaireId) ?? alerte.zoneSanitaireId,
    groupeMaladiesLibelle: LIBELLES_GROUPE.get(alerte.groupeMaladies) ?? alerte.groupeMaladies,
    semaine: alerte.semaine,
    casObserves: alerte.casObserves,
    seuilCalcule: alerte.seuilCalcule,
    statut: alerte.statut as "nouvelle" | "vue" | "fermee",
    commentaire: alerte.commentaire,
    motifFermeture: alerte.motifFermeture,
    reviewerNomComplet: alerte.reviewer ? nomComplet(alerte.reviewer) : null,
    dateCreation: alerte.dateCreation.toISOString(),
    dateRevue: alerte.dateRevue?.toISOString() ?? null,
  }));
}

export interface RevueAlerteActionState {
  error: string | null;
  success: boolean;
}

const schemaRevue = z.object({
  alerteId: z.string().trim().min(1, "L'alerte est obligatoire."),
  decision: z.enum(["vue", "fermee"], { message: "Decision invalide." }),
  commentaire: z.string().trim().optional().default(""),
});

function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/**
 * Marque une alerte comme vue (simple accuse de lecture, pas de commentaire
 * exige) ou la ferme (commentaire obligatoire : motif de fermeture, RG-PIL-50
 * "un signal a verifier, jamais une communication automatique").
 */
export async function revueAlerteAction(
  prevState: RevueAlerteActionState,
  formData: FormData
): Promise<RevueAlerteActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "read", "analytics"))) {
    return { error: "Action reservee aux administrateurs.", success: false };
  }

  const validation = schemaRevue.safeParse({
    alerteId: texte(formData, "alerteId"),
    decision: texte(formData, "decision"),
    commentaire: texte(formData, "commentaire"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees invalides."),
      success: false,
    };
  }

  const { alerteId, decision, commentaire } = validation.data;

  if (decision === "fermee" && commentaire.trim().length < 10) {
    return { error: "Un motif de fermeture d'au moins 10 caracteres est obligatoire.", success: false };
  }

  try {
    const alerte = await prisma.healthAlertReview.findUnique({ where: { id: alerteId } });

    if (!alerte) {
      return { error: "Alerte introuvable.", success: false };
    }

    if (alerte.statut === "fermee") {
      return { error: "Cette alerte est deja fermee.", success: false };
    }

    await prisma.healthAlertReview.update({
      where: { id: alerteId },
      data: {
        statut: decision,
        reviewerId: session.userId,
        dateRevue: new Date(),
        ...(decision === "fermee" ? { motifFermeture: commentaire } : { commentaire: commentaire || null }),
      },
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la revue de l'alerte :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}
