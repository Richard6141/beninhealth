"use server";

/**
 * Server Actions du module audit : traitement des demandes des personnes
 * (F-AUD-04 du pack). Deux types de demandes deja produits ailleurs dans ce
 * depot, jamais un nouveau formulaire de saisie ici : demande de
 * rectification (src/modules/patient/droits-donnees.ts, action
 * "demande_rectification") et signalement d'acces suspect
 * (src/modules/patient/actions.ts, action "signalement_acces_suspect"),
 * toutes deux deja routees vers admin_national via une entree JournalAudit
 * dediee (pas de role AUDITOR dans ce depot). Cet ecran leur ajoute un
 * workflow de traitement (TraitementDemandePersonne), meme principe que
 * RevueAccesUrgence : jamais une modification de l'entree JournalAudit
 * d'origine.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";

const ACTIONS_DEMANDE_PERSONNE = ["demande_rectification", "signalement_acces_suspect"] as const;
type ActionDemandePersonne = (typeof ACTIONS_DEMANDE_PERSONNE)[number];

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    const adresse = listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? null;
    return adresse ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

function nomComplet(utilisateur: { nom: string; prenom: string }): string {
  return `${utilisateur.prenom} ${utilisateur.nom}`;
}

/** Une demande d'une personne (rectification ou signalement), traitee ou non. */
export interface DemandePersonne {
  journalAuditId: string;
  type: ActionDemandePersonne;
  date: string; // ISO
  demandeurNomComplet: string;
  contenu: string; // justification/description de la demande d'origine
  traite: boolean;
  reponse: string | null;
  traiteParNomComplet: string | null;
  dateTraitement: string | null;
}

/**
 * Demandes des personnes (F-AUD-04), les plus recentes en premier, traitees
 * et non traitees confondues (l'ecran distingue par le champ "traite").
 * Reserve a admin_national (role AUDITOR absent de ce depot, voir
 * src/modules/patient/droits-donnees.ts pour la justification du routage).
 * Retourne null si la session est absente ou sans le role requis.
 */
export async function getDemandesPersonnes(): Promise<DemandePersonne[] | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const role = session.roles.find((r) => can(r, "read", "demande_personne"));

  if (!role) {
    return null;
  }

  const entrees = await prisma.journalAudit.findMany({
    where: { action: { in: [...ACTIONS_DEMANDE_PERSONNE] } },
    include: {
      utilisateur: true,
      traitementDemande: { include: { traitePar: true } },
    },
    orderBy: { date: "desc" },
  });

  return entrees.map((entree) => ({
    journalAuditId: entree.id,
    type: entree.action as ActionDemandePersonne,
    date: entree.date.toISOString(),
    demandeurNomComplet: nomComplet(entree.utilisateur),
    contenu: entree.justification,
    traite: entree.traitementDemande !== null,
    reponse: entree.traitementDemande?.reponse ?? null,
    traiteParNomComplet: entree.traitementDemande ? nomComplet(entree.traitementDemande.traitePar) : null,
    dateTraitement: entree.traitementDemande?.date.toISOString() ?? null,
  }));
}

export interface TraitementDemandeActionState {
  error: string | null;
  success: boolean;
}

const LONGUEUR_MIN_REPONSE = 10;

const schemaTraitement = z.object({
  journalAuditId: z.string().trim().min(1, "La demande est obligatoire."),
  reponse: z
    .string()
    .trim()
    .min(LONGUEUR_MIN_REPONSE, `La reponse doit comporter au moins ${LONGUEUR_MIN_REPONSE} caracteres.`),
});

/**
 * Enregistre la reponse d'un administrateur a une demande de rectification
 * ou un signalement d'acces suspect (F-AUD-04), cloture cette demande
 * (TraitementDemandePersonne.journalAuditId est unique : une deuxieme
 * tentative de traitement de la meme demande est refusee plutot que
 * d'ecraser la premiere reponse).
 */
export async function traiterDemandePersonneAction(
  prevState: TraitementDemandeActionState,
  formData: FormData
): Promise<TraitementDemandeActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "traitement_demande_personne"))) {
    return { error: "Action reservee aux administrateurs.", success: false };
  }

  const validation = schemaTraitement.safeParse({
    journalAuditId: texte(formData, "journalAuditId"),
    reponse: texte(formData, "reponse"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Reponse invalide."),
      success: false,
    };
  }

  const { journalAuditId, reponse } = validation.data;

  try {
    const entree = await prisma.journalAudit.findUnique({
      where: { id: journalAuditId },
      include: { traitementDemande: true },
    });

    if (!entree || !(ACTIONS_DEMANDE_PERSONNE as readonly string[]).includes(entree.action)) {
      return { error: "Demande introuvable.", success: false };
    }

    if (entree.traitementDemande) {
      return { error: "Cette demande a deja ete traitee.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.traitementDemandePersonne.create({
        data: {
          journalAuditId,
          traiteParId: session.userId,
          reponse,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "traitement_demande_personne",
          donneeConcernee: `journal_audit:${journalAuditId}`,
          adresseTechnique,
          justification: `Reponse a une demande (${entree.action}) : ${reponse}`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du traitement de la demande :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}
