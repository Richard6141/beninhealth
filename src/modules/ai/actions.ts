"use server";

/**
 * Server Actions du resume de dossier par IA (F-IA-01, chapitre 16 du pack).
 * L'IA assiste, elle ne remplace pas le professionnel (RG-IA-01) : le resume
 * n'est jamais enregistre dans le dossier ni envoye a un patient, seule une
 * ligne de journal sans texte est conservee (RG-IA-08).
 *
 * Ordre des controles, chacun fermant l'acces : session et role medecin,
 * fonctionnalite ai.summary active (RG-IA-02, lue en base a chaque appel),
 * consentement actif de type dossier_complet (base d'acces FULL), limite de
 * 30 resumes par heure et par medecin.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { journaliser } from "@/modules/audit/journaliser";
import { can } from "@/security/permissions";
import { fournisseurConfigure } from "./configuration";
import { cloreAppelIa, compterAppelsDeLHeure, FONCTIONNALITE_RESUME, ouvrirAppelIa } from "./journal";
import { lireDossierPourIa } from "./lecture-dossier";
import { produireResume } from "./pipeline";
import {
  LIBELLES_TYPE_ELEMENT,
  LIMITE_RESUMES_PAR_HEURE,
  LONGUEUR_MAX_COMMENTAIRE_RETOUR,
  MESSAGE_RESUME_INDISPONIBLE,
  VERSION_CONSIGNE_RESUME,
} from "./regles";

export interface SourceAffichee {
  etiquette: string;
  libelleType: string;
  texte: string;
  date: string | null;
}

export interface ResultatResumeIa {
  succes: boolean;
  erreur: string | null;
  /** Identifiant de la ligne de journal, utile pour noter le resume. */
  appelId: string | null;
  puces: { texte: string; sources: string[] }[];
  sources: SourceAffichee[];
  /** Renseigne quand aucun resume n'est affiche (moins de 2 puces conformes, fournisseur coupe, requete bloquee). */
  message: string | null;
}

const MESSAGE_INACTIF = "Le résumé par IA est désactivé.";

function refus(erreur: string): ResultatResumeIa {
  return { succes: false, erreur, appelId: null, puces: [], sources: [], message: null };
}

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

const schemaPatient = z.string().trim().min(1).max(64);

/** Genere le resume IA d'un dossier pour le medecin connecte (F-IA-01). */
export async function genererResumeIaAction(patientId: string): Promise<ResultatResumeIa> {
  const session = await getSession();
  if (!session || !session.roles.some((role) => can(role, "create", "resume_ia"))) {
    return refus("Action réservée aux médecins.");
  }

  const patient = schemaPatient.safeParse(patientId);
  if (!patient.success) return refus("Patient invalide.");

  if (!(await estFonctionnaliteActive("ai.summary"))) return refus(MESSAGE_INACTIF);

  // Base d'acces complete exigee : ni acces d'urgence, ni reference, ni consentement limite aux consultations.
  const consentement = await prisma.consentement.findUnique({
    where: { patientId_acteurAutoriseId: { patientId: patient.data, acteurAutoriseId: session.userId } },
  });
  const accesComplet =
    consentement !== null &&
    consentement.statut === "actif" &&
    consentement.typeAcces === "dossier_complet" &&
    (consentement.dateFin === null || consentement.dateFin > new Date());
  if (!accesComplet) return refus("Le résumé par IA exige un accès complet au dossier, accordé par le patient.");

  if ((await compterAppelsDeLHeure(session.userId, FONCTIONNALITE_RESUME)) >= LIMITE_RESUMES_PAR_HEURE) {
    return refus(`Limite atteinte : ${LIMITE_RESUMES_PAR_HEURE} résumés par heure. Réessayez plus tard.`);
  }

  const fournisseur = fournisseurConfigure();
  const appelId = await ouvrirAppelIa({
    utilisateurId: session.userId,
    patientId: patient.data,
    fonctionnalite: FONCTIONNALITE_RESUME,
    modele: fournisseur.nom,
    versionConsigne: VERSION_CONSIGNE_RESUME,
  });

  try {
    const dossier = await lireDossierPourIa(patient.data);
    if (!dossier) {
      await cloreAppelIa(appelId, { statut: "erreur", modele: fournisseur.nom, nombreSources: 0, pucesLues: 0, pucesSupprimees: 0, dureeMs: 0 });
      return refus("Patient introuvable.");
    }

    const resultat = await produireResume(dossier.donnees, dossier.identite, fournisseur);

    await cloreAppelIa(appelId, {
      statut: resultat.statut,
      modele: resultat.modele,
      nombreSources: resultat.nombreSources,
      pucesLues: resultat.pucesLues,
      pucesSupprimees: resultat.pucesSupprimees,
      dureeMs: resultat.dureeMs,
    });

    // Journal d'audit sans aucun texte du dossier ni de la reponse (RG-IA-08).
    await journaliser({
      utilisateurId: session.userId,
      action: "resume_ia_genere",
      donneeConcernee: `patient:${patient.data}`,
      adresseTechnique: await adresseTechniqueCourante(),
      justification: `Résumé IA (${resultat.statut}, modèle ${resultat.modele}, ${resultat.nombreSources} sources, ${resultat.puces.length} puces, ${resultat.pucesSupprimees} supprimées).`,
    });

    if (resultat.statut !== "ok") {
      return { succes: true, erreur: null, appelId, puces: [], sources: [], message: MESSAGE_RESUME_INDISPONIBLE };
    }

    return {
      succes: true,
      erreur: null,
      appelId,
      puces: resultat.puces,
      sources: resultat.sourcesCitees.map((source) => ({
        etiquette: source.etiquette,
        libelleType: LIBELLES_TYPE_ELEMENT[source.type],
        texte: source.texte,
        date: source.date,
      })),
      message: null,
    };
  } catch (erreur) {
    console.error("[ia] echec de la generation du resume", erreur);
    return refus("Le résumé n'a pas pu être généré. Consultez l'historique.");
  }
}

const schemaRetour = z.object({
  appelId: z.string().trim().min(1).max(64),
  retour: z.enum(["utile", "inexact"], { message: "Choisissez « utile » ou « inexact »." }),
  commentaire: z.string().trim().max(LONGUEUR_MAX_COMMENTAIRE_RETOUR, `Le commentaire est limité à ${LONGUEUR_MAX_COMMENTAIRE_RETOUR} caractères.`),
});

/** Enregistre le retour du medecin sur un resume (F-IA-01 etape 7). Le commentaire libre est efface a 30 jours (RG-IA-08). */
export async function noterResumeIaAction(appelId: string, retour: string, commentaire: string): Promise<{ succes: boolean; erreur: string | null }> {
  const session = await getSession();
  if (!session || !session.roles.some((role) => can(role, "update", "resume_ia"))) {
    return { succes: false, erreur: "Action réservée aux médecins." };
  }

  const validation = schemaRetour.safeParse({ appelId, retour, commentaire });
  if (!validation.success) return { succes: false, erreur: validation.error.issues[0]?.message ?? "Retour invalide." };

  // Un medecin ne note que ses propres resumes.
  const modifies = await prisma.appelIa.updateMany({
    where: { id: validation.data.appelId, utilisateurId: session.userId, fonctionnalite: FONCTIONNALITE_RESUME, statut: "ok" },
    data: { retour: validation.data.retour, commentaireRetour: validation.data.commentaire === "" ? null : validation.data.commentaire },
  });
  if (modifies.count === 0) return { succes: false, erreur: "Résumé introuvable." };

  await journaliser({
    utilisateurId: session.userId,
    action: "resume_ia_note",
    donneeConcernee: `appel_ia:${validation.data.appelId}`,
    adresseTechnique: await adresseTechniqueCourante(),
    justification: `Retour sur un résumé IA : ${validation.data.retour}.`,
  });

  return { succes: true, erreur: null };
}
