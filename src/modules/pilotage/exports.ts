"use server";

/**
 * Exports et rapports de pilotage (F-PIL-05, chapitre 14 du pack). Meme
 * patron de re-authentification que F-CIT-13 (patient/jeton-export-donnees.ts)
 * et F-AUD-01 (audit/jeton-export-audit.ts) : cette action verifie le droit
 * d'exporter pour la portee, le motif et le mot de passe reconfirme, puis
 * emet un jeton signe de 5 minutes (jeton-export.ts, contexte HMAC propre
 * aux exports de pilotage, jamais interchangeable avec les deux autres).
 * Les points de telechargement (/api/pilotage/export/pdf|csv et
 * exporterRepartitionCSV d'analytics/actions.ts) exigent ce jeton cote
 * serveur et lisent le motif dans le jeton verifie, jamais dans l'URL : un
 * GET direct avec le seul cookie de session est refuse (403).
 *
 * RG-PIL-40 : motif obligatoire (liste fermee + "autre" avec un texte d'au
 * moins LONGUEUR_MIN_MOTIF_TEXTE_EXPORT caracteres), re-authentification,
 * journalisation (ACTIONS_AUDIT_EXPORT_PILOTAGE, motif en clair dans la
 * justification) faite par les points de telechargement, au moment ou le
 * fichier est reellement genere, pas ici.
 * RG-PIL-41 : les regles de masquage s'appliquent avant l'export. Assure
 * structurellement : les routes de telechargement ne lisent jamais
 * AgregatQuotidien directement, elles reutilisent exclusivement
 * getVueNationalePilotage / getTableauBordEtablissement (deja masquees).
 *
 * Corrige le 2026-09-28 : 5 mots de passe incorrects par heure et par compte
 * bloquent l'etape (meme patron que patient/droits-donnees.ts, F-CIT-13,
 * `@/lib/limite-debit`) ; avant ce correctif, un attaquant deja authentifie
 * (session active) mais sans le mot de passe pouvait tenter un nombre
 * illimite de mots de passe sur cette seule etape. Pas de deconnexion au
 * plafond (a la difference d'identity/reauthentification.ts, F-PRE-04) :
 * aucune regle equivalente a RG-PRE-30 ne s'applique a cette etape.
 */

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { enregistrerEvenement, limiteAtteinte } from "@/lib/limite-debit";
import {
  LONGUEUR_MIN_MOTIF_TEXTE_EXPORT as LONGUEUR_MIN_MOTIF_TEXTE,
  type ExportPilotageActionState,
  type MotifExport,
  type PorteeExportPilotage,
} from "./exports-constantes";
import { creerJetonExport } from "./jeton-export";

const FENETRE_ECHECS_EXPORT_MS = 60 * 60 * 1000;
const ECHECS_MAX_EXPORT_PAR_COMPTE = 5;

function cleEchecsExportPilotage(userId: string): string {
  return `pilotage-export:echecs:${userId}`;
}

const schemaConfirmation = z
  .object({
    motDePasse: z.string().min(1, "Votre mot de passe est obligatoire pour confirmer."),
    motif: z.enum(["rapport_mensuel", "reunion", "planification", "autre"], {
      message: "Choisissez un motif d'export.",
    }),
    motifTexte: z.string().trim().optional(),
  })
  .refine(
    (donnees) => donnees.motif !== "autre" || (donnees.motifTexte?.length ?? 0) >= LONGUEUR_MIN_MOTIF_TEXTE,
    {
      message: `Précisez le motif en au moins ${LONGUEUR_MIN_MOTIF_TEXTE} caractères.`,
      path: ["motifTexte"],
    }
  );

function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

/** Verifie que la session courante a bien le droit d'exporter pour la portee demandee (Zero Trust, jamais fie a une entree client). */
async function sessionAutoriseePourPortee(portee: PorteeExportPilotage): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;

  if (portee === "national") {
    return session.roles.includes("admin_national");
  }

  if (!session.roles.includes("admin_etablissement")) return false;
  const professionnel = await prisma.professionnelSante.findUnique({ where: { userId: session.userId } });
  return professionnel !== null;
}

export async function verifierExportPilotageAction(
  portee: PorteeExportPilotage,
  prevState: ExportPilotageActionState,
  formData: FormData
): Promise<ExportPilotageActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "Session expirée. Veuillez vous reconnecter.", success: false };
  }

  if (!(await sessionAutoriseePourPortee(portee))) {
    return { error: "Votre compte ne dispose pas des droits nécessaires pour cet export.", success: false };
  }

  if (limiteAtteinte(cleEchecsExportPilotage(session.userId), ECHECS_MAX_EXPORT_PAR_COMPTE, FENETRE_ECHECS_EXPORT_MS)) {
    return { error: "Trop de tentatives. Réessayez dans une heure.", success: false };
  }

  const validation = schemaConfirmation.safeParse({
    motDePasse: texte(formData, "motDePasse"),
    motif: texte(formData, "motif"),
    motifTexte: texte(formData, "motifTexte"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Formulaire invalide.", success: false };
  }

  const utilisateur = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!utilisateur) {
    return { error: "Compte introuvable.", success: false };
  }

  const motDePasseValide = await bcrypt.compare(validation.data.motDePasse, utilisateur.motDePasseHash);
  if (!motDePasseValide) {
    enregistrerEvenement(cleEchecsExportPilotage(session.userId), FENETRE_ECHECS_EXPORT_MS);
    return { error: "Mot de passe incorrect.", success: false };
  }

  return {
    error: null,
    success: true,
    jeton: creerJetonExport({
      utilisateurId: session.userId,
      sessionId: session.sessionId,
      portee,
      motif: validation.data.motif as MotifExport,
      motifTexte: validation.data.motif === "autre" ? validation.data.motifTexte : undefined,
    }),
  };
}

export async function verifierExportPilotageNationalAction(
  prevState: ExportPilotageActionState,
  formData: FormData
): Promise<ExportPilotageActionState> {
  return verifierExportPilotageAction("national", prevState, formData);
}

export async function verifierExportPilotageEtablissementAction(
  prevState: ExportPilotageActionState,
  formData: FormData
): Promise<ExportPilotageActionState> {
  return verifierExportPilotageAction("etablissement", prevState, formData);
}
