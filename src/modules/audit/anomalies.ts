"use server";

/**
 * Server Actions du module audit : detection d'anomalies d'acces (F-AUD-03
 * du pack). Version reduite et volontaire, documentee en detail dans
 * prisma/schema.prisma au-dessus de SignalementAnomalieAcces : detection a
 * la demande (au chargement de l'ecran), pas une tache planifiee horaire ;
 * 4 des 7 regles du pack, celles calculables sans ajouter de journalisation
 * ailleurs dans le depot.
 */

import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { headers } from "next/headers";
import { z } from "zod";

const SEUIL_ACCES_URGENCE_7J = 3;
const SEUIL_IP_MULTIPLES_1H = 3;
const SEUIL_DOSSIERS_DISTINCTS_JOUR = 60;

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

/**
 * Cree un signalement pour (regle, utilisateurId) s'il n'en existe pas deja
 * un ouvert (statut "nouveau") pour ce meme couple : la detection peut etre
 * relancee a chaque chargement de l'ecran sans jamais dupliquer un
 * signalement pas encore traite.
 */
async function signalerSiNouveau(regle: string, utilisateurId: string, detail: string): Promise<void> {
  const existant = await prisma.signalementAnomalieAcces.findFirst({
    where: { regle, utilisateurId, statut: "nouveau" },
  });

  if (existant) {
    return;
  }

  await prisma.signalementAnomalieAcces.create({
    data: { regle, utilisateurId, detail },
  });
}

/**
 * Execute les 4 regles de detection implementees et cree les signalements
 * correspondants (voir signalerSiNouveau pour l'idempotence). Volontairement
 * silencieux sur les erreurs individuelles d'une regle : une regle en echec
 * ne doit jamais empecher les autres de s'executer, ni bloquer l'affichage
 * de l'ecran.
 */
async function executerDetection(): Promise<void> {
  const maintenant = new Date();
  const il7Jours = new Date(maintenant.getTime() - 7 * 24 * 60 * 60 * 1000);
  const il1Heure = new Date(maintenant.getTime() - 60 * 60 * 1000);
  const debutJour = new Date(maintenant);
  debutJour.setHours(0, 0, 0, 0);

  try {
    const accesUrgence = await prisma.journalAudit.findMany({
      where: { action: "acces_urgence", date: { gte: il7Jours } },
      select: { utilisateurId: true },
    });
    const parProfessionnel = new Map<string, number>();
    for (const entree of accesUrgence) {
      parProfessionnel.set(entree.utilisateurId, (parProfessionnel.get(entree.utilisateurId) ?? 0) + 1);
    }
    for (const [utilisateurId, nombre] of parProfessionnel) {
      if (nombre > SEUIL_ACCES_URGENCE_7J) {
        await signalerSiNouveau(
          "acces_urgence_frequents",
          utilisateurId,
          `${nombre} accès d'urgence déclenchés sur les 7 derniers jours (seuil : ${SEUIL_ACCES_URGENCE_7J}).`
        );
      }
    }
  } catch (erreur) {
    console.error("Erreur regle acces_urgence_frequents :", erreur);
  }

  try {
    const connexions = await prisma.journalAudit.findMany({
      where: { action: "connexion", date: { gte: il1Heure } },
      select: { utilisateurId: true, adresseTechnique: true },
    });
    const ipParUtilisateur = new Map<string, Set<string>>();
    for (const entree of connexions) {
      const ips = ipParUtilisateur.get(entree.utilisateurId) ?? new Set<string>();
      ips.add(entree.adresseTechnique);
      ipParUtilisateur.set(entree.utilisateurId, ips);
    }
    for (const [utilisateurId, ips] of ipParUtilisateur) {
      if (ips.size > SEUIL_IP_MULTIPLES_1H) {
        await signalerSiNouveau(
          "connexions_ip_multiples",
          utilisateurId,
          `${ips.size} adresses techniques différentes en 1 heure (seuil : ${SEUIL_IP_MULTIPLES_1H}).`
        );
      }
    }
  } catch (erreur) {
    console.error("Erreur regle connexions_ip_multiples :", erreur);
  }

  try {
    const consultationsResume = await prisma.journalAudit.findMany({
      where: { action: "consultation_resume_patient", date: { gte: debutJour } },
      select: { utilisateurId: true, donneeConcernee: true },
    });

    const dossiersParUtilisateur = new Map<string, Set<string>>();
    for (const entree of consultationsResume) {
      const dossiers = dossiersParUtilisateur.get(entree.utilisateurId) ?? new Set<string>();
      dossiers.add(entree.donneeConcernee);
      dossiersParUtilisateur.set(entree.utilisateurId, dossiers);
    }
    for (const [utilisateurId, dossiers] of dossiersParUtilisateur) {
      if (dossiers.size > SEUIL_DOSSIERS_DISTINCTS_JOUR) {
        await signalerSiNouveau(
          "dossiers_distincts_eleves",
          utilisateurId,
          `${dossiers.size} dossiers patients distincts ouverts aujourd'hui (seuil : ${SEUIL_DOSSIERS_DISTINCTS_JOUR}).`
        );
      }
    }

    const patientIds = consultationsResume
      .map((e) => (e.donneeConcernee.startsWith("patient:") ? e.donneeConcernee.slice("patient:".length) : null))
      .filter((id): id is string => id !== null);

    if (patientIds.length > 0) {
      const [professionnels, patients] = await Promise.all([
        prisma.user.findMany({
          where: { id: { in: [...new Set(consultationsResume.map((e) => e.utilisateurId))] } },
          select: { id: true, nom: true },
        }),
        prisma.patient.findMany({
          where: { id: { in: [...new Set(patientIds)] } },
          include: { user: { select: { nom: true } } },
        }),
      ]);
      const nomParProfessionnel = new Map(professionnels.map((p) => [p.id, p.nom.toLowerCase()]));
      const nomParPatient = new Map(patients.map((p) => [p.id, p.user.nom.toLowerCase()]));

      for (const entree of consultationsResume) {
        if (!entree.donneeConcernee.startsWith("patient:")) continue;
        const patientId = entree.donneeConcernee.slice("patient:".length);
        const nomProfessionnel = nomParProfessionnel.get(entree.utilisateurId);
        const nomPatient = nomParPatient.get(patientId);
        if (nomProfessionnel && nomPatient && nomProfessionnel === nomPatient) {
          await signalerSiNouveau(
            "nom_famille_identique",
            entree.utilisateurId,
            `Dossier consulté d'un patient partageant le même nom de famille (${nomPatient}).`
          );
        }
      }
    }
  } catch (erreur) {
    console.error("Erreur regles dossiers_distincts_eleves/nom_famille_identique :", erreur);
  }
}

/** Un signalement d'anomalie d'acces, traite ou non. */
export interface SignalementAnomalie {
  id: string;
  regle: string;
  utilisateurNomComplet: string;
  detail: string;
  dateDetection: string; // ISO
  statut: "nouveau" | "ferme";
  commentaire: string | null;
  reviewerNomComplet: string | null;
  dateRevue: string | null;
}

const LIBELLES_REGLE: Record<string, string> = {
  acces_urgence_frequents: "Accès d'urgence fréquents",
  connexions_ip_multiples: "Connexions multi-IP",
  nom_famille_identique: "Nom de famille identique",
  dossiers_distincts_eleves: "Dossiers distincts élevés",
};

/**
 * Lance la detection puis renvoie tous les signalements (nouveaux et
 * fermes), les plus recents en premier. Reserve a admin_national (role
 * AUDITOR absent de ce depot). Retourne null si la session est absente ou
 * sans le role requis.
 */
export async function getSignalementsAnomalies(): Promise<SignalementAnomalie[] | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const role = session.roles.find((r) => can(r, "read", "signalement_anomalie"));

  if (!role) {
    return null;
  }

  await executerDetection();

  const signalements = await prisma.signalementAnomalieAcces.findMany({
    include: { utilisateur: true, reviewer: true },
    orderBy: { dateDetection: "desc" },
  });

  return signalements.map((signalement) => ({
    id: signalement.id,
    regle: LIBELLES_REGLE[signalement.regle] ?? signalement.regle,
    utilisateurNomComplet: nomComplet(signalement.utilisateur),
    detail: signalement.detail,
    dateDetection: signalement.dateDetection.toISOString(),
    statut: signalement.statut as "nouveau" | "ferme",
    commentaire: signalement.commentaire,
    reviewerNomComplet: signalement.reviewer ? nomComplet(signalement.reviewer) : null,
    dateRevue: signalement.dateRevue?.toISOString() ?? null,
  }));
}

export interface ClotureSignalementActionState {
  error: string | null;
  success: boolean;
}

const LONGUEUR_MIN_COMMENTAIRE = 10;

const schemaCloture = z.object({
  signalementId: z.string().trim().min(1, "Le signalement est obligatoire."),
  commentaire: z
    .string()
    .trim()
    .min(LONGUEUR_MIN_COMMENTAIRE, `Le commentaire doit comporter au moins ${LONGUEUR_MIN_COMMENTAIRE} caracteres.`),
});

/** Cloture un signalement (F-AUD-03), commentaire obligatoire, reserve a admin_national. */
export async function cloturerSignalementAction(
  prevState: ClotureSignalementActionState,
  formData: FormData
): Promise<ClotureSignalementActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "update", "signalement_anomalie"))) {
    return { error: "Action reservee aux administrateurs.", success: false };
  }

  const validation = schemaCloture.safeParse({
    signalementId: texte(formData, "signalementId"),
    commentaire: texte(formData, "commentaire"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Commentaire invalide."),
      success: false,
    };
  }

  const { signalementId, commentaire } = validation.data;

  try {
    const signalement = await prisma.signalementAnomalieAcces.findUnique({ where: { id: signalementId } });

    if (!signalement) {
      return { error: "Signalement introuvable.", success: false };
    }

    if (signalement.statut === "ferme") {
      return { error: "Ce signalement est déjà fermé.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const dateRevue = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.signalementAnomalieAcces.update({
        where: { id: signalementId },
        data: { statut: "ferme", commentaire, reviewerId: session.userId, dateRevue },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "cloture_signalement_anomalie",
          donneeConcernee: `signalement_anomalie:${signalementId}`,
          adresseTechnique,
          justification: `Signalement (${signalement.regle}) fermé : ${commentaire}`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la cloture du signalement :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}
