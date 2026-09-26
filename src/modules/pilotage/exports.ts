"use server";

/**
 * Exports et rapports de pilotage (F-PIL-05, chapitre 14 du pack). Meme
 * principe de re-authentification que src/modules/patient/droits-donnees.ts
 * (F-CIT-13) : cette action ne verifie que le mot de passe et le motif, puis
 * renvoie un etat de succes que l'interface utilise pour reveler des liens
 * de telechargement (/api/pilotage/export/pdf|csv) qui regenerent le contenu
 * a la demande a partir de la session courante. Meme limite assumee que
 * F-CIT-13, deja acceptee dans ce depot : la re-authentification n'emet pas
 * de jeton signe verifie par la route de telechargement, elle controle
 * seulement l'affichage des liens dans cette page. La route re-verifie
 * toujours independamment la session et le role (Zero Trust), donc aucune
 * donnee n'est exposee a un compte non autorise ; ce qui n'est pas
 * re-verifie est seulement le mot de passe lui-meme au moment du clic.
 *
 * RG-PIL-40 : motif obligatoire (liste fermee + "autre" avec texte),
 * re-authentification, journalisation "EXPORT" avec les filtres (faite dans
 * les routes de telechargement, au moment ou le fichier est reellement
 * genere, pas ici).
 * RG-PIL-41 : les regles de masquage s'appliquent avant l'export. Assure
 * structurellement : les routes de telechargement ne lisent jamais
 * AgregatQuotidien directement, elles reutilisent exclusivement
 * getVueNationalePilotage / getTableauBordEtablissement (deja masquees).
 */

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { ExportPilotageActionState, MotifExport, PorteeExportPilotage } from "./exports-constantes";

const LONGUEUR_MIN_MOTIF_TEXTE = 5;

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
    return { error: "Mot de passe incorrect.", success: false };
  }

  return {
    error: null,
    success: true,
    motif: validation.data.motif as MotifExport,
    motifTexte: validation.data.motif === "autre" ? validation.data.motifTexte : undefined,
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
