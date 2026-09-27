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
 *
 * Reponse notifiee au demandeur (creerNotification) : le pack exige une
 * reponse "visible par la personne" (F-AUD-04), corrige ici (l'ecart
 * initial ne la rendait visible qu'a l'auditeur qui l'a redigee).
 *
 * Limite assumee, non implementee : "transferer au responsable
 * d'etablissement concerne" (texte du pack). Ce depot n'a pas de mecanisme
 * de reassignation d'une demande a un autre role (contrairement a
 * RevueAccesUrgence, toujours traitee par le meme admin_etablissement que
 * celui de l'etablissement concerne) ; un transfert exigerait un champ de
 * destinataire et une notification dediee, non construits ce soir.
 *
 * "Consulter les traces liees" (texte du pack), ajoute ce soir pour
 * signalement_acces_suspect : le patient signale un acces PRECIS (voir
 * src/modules/patient/actions.ts, donneeConcernee = "journal_audit:<id>"),
 * jamais son dossier en general. getDemandesPersonnes resout desormais cette
 * reference vers l'entree JournalAudit d'origine (action, date, adresse
 * technique, et l'identite de qui a fait l'acces conteste), pour que
 * l'administrateur voie exactement ce qui est mis en cause avant de
 * repondre. Sans objet pour demande_rectification (donneeConcernee =
 * "patient:<id>", la personne rectifie ses propres informations, aucun
 * acces tiers a examiner).
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";

const ACTIONS_DEMANDE_PERSONNE = ["demande_rectification", "signalement_acces_suspect"] as const;
type ActionDemandePersonne = (typeof ACTIONS_DEMANDE_PERSONNE)[number];

/** Objectif de delai de reponse du pack (fiche F-AUD-04 : "reponse sous 30 jours"). */
const JOURS_OBJECTIF_REPONSE = 30;

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
  /**
   * Jours restants avant l'objectif de reponse du pack (F-AUD-04 :
   * "reponse sous 30 jours"), negatif si l'objectif est deja depasse.
   * Toujours calcule (meme pour une demande deja traitee, ou il indique le
   * delai reellement tenu) : jamais masque, l'auditeur doit pouvoir voir un
   * depassement plutot que l'ecran le lui cache.
   */
  joursRestantsObjectif: number;
  /**
   * Pour un signalement d'acces suspect seulement : l'acces precis mis en
   * cause (resolu depuis donneeConcernee = "journal_audit:<id>"). Null pour
   * une demande de rectification, ou si la trace d'origine a disparu.
   */
  traceLiee: TraceLiee | null;
}

export interface TraceLiee {
  action: string;
  date: string; // ISO
  acteurNomComplet: string;
  adresseTechnique: string;
  donneeConcernee: string;
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

  const idsTracesLiees = entrees
    .filter((entree) => entree.action === "signalement_acces_suspect" && entree.donneeConcernee.startsWith("journal_audit:"))
    .map((entree) => entree.donneeConcernee.slice("journal_audit:".length));

  const tracesLiees =
    idsTracesLiees.length === 0
      ? []
      : await prisma.journalAudit.findMany({
          where: { id: { in: idsTracesLiees } },
          include: { utilisateur: true },
        });
  const traceParId = new Map(tracesLiees.map((trace) => [trace.id, trace]));

  const maintenant = new Date();

  return entrees.map((entree) => {
    const dateReference = entree.traitementDemande?.date ?? maintenant;
    const joursEcoules = (dateReference.getTime() - entree.date.getTime()) / (1000 * 60 * 60 * 24);

    const idTraceLiee = entree.action === "signalement_acces_suspect" && entree.donneeConcernee.startsWith("journal_audit:")
      ? entree.donneeConcernee.slice("journal_audit:".length)
      : null;
    const trace = idTraceLiee ? traceParId.get(idTraceLiee) : undefined;

    return {
      journalAuditId: entree.id,
      type: entree.action as ActionDemandePersonne,
      date: entree.date.toISOString(),
      demandeurNomComplet: nomComplet(entree.utilisateur),
      contenu: entree.justification,
      traite: entree.traitementDemande !== null,
      reponse: entree.traitementDemande?.reponse ?? null,
      traiteParNomComplet: entree.traitementDemande ? nomComplet(entree.traitementDemande.traitePar) : null,
      dateTraitement: entree.traitementDemande?.date.toISOString() ?? null,
      joursRestantsObjectif: Math.ceil(JOURS_OBJECTIF_REPONSE - joursEcoules),
      traceLiee: trace
        ? {
            action: trace.action,
            date: trace.date.toISOString(),
            acteurNomComplet: nomComplet(trace.utilisateur),
            adresseTechnique: trace.adresseTechnique,
            donneeConcernee: trace.donneeConcernee,
          }
        : null,
    };
  });
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

    // creerNotification() ecrit via le client prisma global, jamais via un
    // client de transaction : appelee seulement APRES que la transaction a
    // reellement commit, meme principe que src/modules/administration/etablissements.ts.
    // Sans cet appel, la reponse n'etait jamais visible par la personne qui a
    // fait la demande (F-AUD-04 du pack : "cloturer avec une reponse ecrite
    // visible par la personne"), un ecart reel corrige ici.
    await creerNotification(
      entree.utilisateurId,
      "reponse_demande_personne",
      `Réponse à votre demande du ${entree.date.toLocaleDateString("fr-FR")} : ${reponse}`
    );

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du traitement de la demande :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}
