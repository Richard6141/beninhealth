"use server";

/**
 * Server Actions du module partage : partage du dossier patient par code
 * temporaire (F-CIT-11 du pack). Le patient genere un code court (8
 * caracteres, format "XXXX-XXXX"), valable 10 minutes, usage unique. Le
 * professionnel (medecin ou infirmier valide, RG-CIT-91) le saisit pour
 * obtenir lui-meme un Consentement "consultations" (RG-CIT-90/91), sans que
 * le patient ait besoin de le chercher dans une liste au prealable.
 *
 * Simplifications assumees par rapport a la fiche complete du pack :
 * - Le pack laisse le patient choisir le niveau d'acces et la duree du
 *   consentement resultant ("comme F-CIT-10"). Ce depot n'a que deux niveaux
 *   reels ("dossier_complet"/"consultations", voir TYPES_ACCES_CONSULTATION
 *   dans src/modules/clinical/actions.ts) : fixe a "consultations" ici,
 *   jamais "dossier_complet" par defaut. Duree du consentement resultant
 *   fixee a 24h (le pack ne precise pas de valeur pour ce parcours
 *   simplifie) : suffisant pour la visite en cours, le patient peut
 *   toujours accorder un acces plus long ensuite depuis /app/patient/consentements
 *   si necessaire.
 * - Recherche du code par comparaison bcrypt sur l'ensemble des codes
 *   actifs (non consommes, non expires), pas par un index direct : le code
 *   en lui-meme ne doit reveler aucune information sur le patient
 *   concerne, et bcrypt ne permet pas une recherche indexee sur la valeur en
 *   clair. A l'echelle de ce MVP (codes valables 10 minutes, generation peu
 *   frequente), le nombre de codes actifs simultanement reste faible ; une
 *   strategie differente (prefixe indexe non sensible avant la comparaison
 *   bcrypt complete) serait a envisager a plus grande echelle.
 */

import { randomInt } from "node:crypto";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";

const ROUNDS_BCRYPT = 12;
const DUREE_VALIDITE_CODE_MINUTES = 10;
const DUREE_CONSENTEMENT_ISSU_CODE_HEURES = 24;
const MAX_TENTATIVES_PAR_HEURE = 5;

// RG-CIT-90 : sans caracteres ambigus (pas de 0/O, 1/I/L).
const ALPHABET_CODE = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LONGUEUR_CODE = 8;

function genererCode(): string {
  let code = "";
  for (let i = 0; i < LONGUEUR_CODE; i++) {
    code += ALPHABET_CODE[randomInt(0, ALPHABET_CODE.length)];
  }
  return code;
}

/** Formate un code brut ("K7M4QX9P") pour l'affichage ("K7M4-QX9P"), comme dans le pack. */
function formaterCodeAffichage(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Normalise une saisie professionnelle : majuscules, sans espaces ni tiret. */
function normaliserCodeSaisi(saisie: string): string {
  return saisie.trim().toUpperCase().replace(/[\s-]/g, "");
}

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

async function patientDeLaSessionCourante() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  return prisma.patient.findUnique({ where: { userId: session.userId } });
}

/** Etat renvoye par genererCodePartageAction, consomme via useActionState. */
export interface GenerationCodePartageState {
  error: string | null;
  success: boolean;
  codeId?: string;
  // Le code en clair n'est jamais relu depuis la base (seule son empreinte
  // est stockee) : renvoye une seule fois, a l'instant de la creation.
  code?: string;
  expireLe?: string; // ISO
}

/**
 * Genere un nouveau code de partage pour le patient connecte, invalide tout
 * code non consomme precedent (une seule demande active a la fois, meme
 * principe que creerEtEnvoyerCodeVerificationEmail). Le code en clair n'est
 * renvoye qu'a cet instant, jamais journalise, jamais relisible ensuite.
 */
export async function genererCodePartageAction(
  prevState: GenerationCodePartageState,
  _formData: FormData
): Promise<GenerationCodePartageState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "code_partage"))) {
    return { error: "Action reservee aux patients.", success: false };
  }

  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return { error: "Aucun dossier patient associe a ce compte.", success: false };
  }

  const code = genererCode();
  const codeHash = await bcrypt.hash(code, ROUNDS_BCRYPT);
  const expireLe = new Date(Date.now() + DUREE_VALIDITE_CODE_MINUTES * 60_000);

  try {
    const [, codeCree] = await prisma.$transaction([
      prisma.codePartageDossier.deleteMany({
        where: { patientId: patient.id, consommeLe: null },
      }),
      prisma.codePartageDossier.create({
        data: { patientId: patient.id, codeHash, expireLe },
      }),
    ]);

    return {
      error: null,
      success: true,
      codeId: codeCree.id,
      code: formaterCodeAffichage(code),
      expireLe: expireLe.toISOString(),
    };
  } catch (erreur) {
    console.error("Erreur lors de la generation du code de partage :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

/** Statut d'un code de partage, pour le sondage periodique cote ecran patient. */
export interface StatutCodePartage {
  consomme: boolean;
  consommeParNomComplet: string | null;
  expireLe: string; // ISO
}

/**
 * Statut d'un code de partage (F-CIT-11 : "le citoyen voit « Partagé avec Dr
 * X » en temps réel"), Zero Trust : uniquement pour le patient qui l'a
 * genere. Prevu pour un sondage cote client toutes les quelques secondes.
 */
export async function getStatutCodePartage(codeId: string): Promise<StatutCodePartage | null> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return null;
  }

  const identifiantNettoye = codeId.trim();

  if (identifiantNettoye.length === 0) {
    return null;
  }

  const code = await prisma.codePartageDossier.findUnique({
    where: { id: identifiantNettoye },
    include: { consommePar: { include: { user: true } } },
  });

  if (!code || code.patientId !== patient.id) {
    return null;
  }

  return {
    consomme: code.consommeLe !== null,
    consommeParNomComplet: code.consommePar
      ? `Dr. ${code.consommePar.user.prenom} ${code.consommePar.user.nom}`
      : null,
    expireLe: code.expireLe.toISOString(),
  };
}

/** Etat renvoye par consommerCodePartageAction, consomme via useActionState. */
export interface ConsommationCodePartageState {
  error: string | null;
  success: boolean;
  patientId?: string;
}

const schemaConsommation = z.object({
  code: z.string().trim().min(1, "Le code est obligatoire."),
});

/**
 * Consomme un code de partage presente par un patient (RG-CIT-91 : reserve
 * a un professionnel medecin ou infirmier valide, dans un espace actif).
 * Cree ou met a jour un Consentement "consultations" au nom du professionnel
 * connecte, reutilisant integralement les verifications d'acces existantes
 * (getResumePatient, getHistoriquePatient...), sans mecanisme d'acces
 * separe. RG-CIT-90 : 5 tentatives maximum par professionnel et par heure,
 * comptees via JournalAudit (meme patron que rechercherOrdonnancePresenteeAction,
 * F-PHA-02) plutot qu'un compteur en memoire.
 */
export async function consommerCodePartageAction(
  prevState: ConsommationCodePartageState,
  formData: FormData
): Promise<ConsommationCodePartageState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "update", "code_partage"))) {
    return { error: "Action reservee aux medecins et infirmiers.", success: false };
  }

  const validation = schemaConsommation.safeParse({ code: texte(formData, "code") });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Code invalide."),
      success: false,
    };
  }

  const codeNormalise = normaliserCodeSaisi(validation.data.code);

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel || professionnel.statutValidation !== "valide") {
      return { error: "Profil professionnel non valide pour cette action.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const uneHeureAvant = new Date(Date.now() - 60 * 60 * 1000);

    const tentativesRecentes = await prisma.journalAudit.count({
      where: {
        utilisateurId: session.userId,
        action: "partage_code_echec",
        date: { gte: uneHeureAvant },
      },
    });

    if (tentativesRecentes >= MAX_TENTATIVES_PAR_HEURE) {
      return {
        error: "Trop de tentatives infructueuses. Reessayez dans une heure.",
        success: false,
      };
    }

    if (!/^[A-Z2-9]{8}$/.test(codeNormalise)) {
      await journaliser({
        utilisateurId: session.userId,
        action: "partage_code_echec",
        donneeConcernee: "code_partage:format_invalide",
        adresseTechnique,
        justification: "Code de partage saisi au format invalide.",
      });
      return { error: "Code invalide.", success: false };
    }

    const codesActifs = await prisma.codePartageDossier.findMany({
      where: { consommeLe: null, expireLe: { gt: new Date() } },
    });

    let codeTrouve: (typeof codesActifs)[number] | null = null;

    for (const candidat of codesActifs) {
      if (await bcrypt.compare(codeNormalise, candidat.codeHash)) {
        codeTrouve = candidat;
        break;
      }
    }

    if (!codeTrouve) {
      await journaliser({
        utilisateurId: session.userId,
        action: "partage_code_echec",
        donneeConcernee: "code_partage:introuvable",
        adresseTechnique,
        justification: "Code de partage saisi introuvable, expire ou deja consomme.",
      });
      return { error: "Code invalide, expire ou déjà utilisé.", success: false };
    }

    const dateConsommation = new Date();
    const dateFinConsentement = new Date(
      dateConsommation.getTime() + DUREE_CONSENTEMENT_ISSU_CODE_HEURES * 60 * 60 * 1000
    );

    await prisma.$transaction(async (tx) => {
      await tx.codePartageDossier.update({
        where: { id: codeTrouve!.id },
        data: { consommeLe: dateConsommation, consommeParId: professionnel.id },
      });

      await tx.consentement.upsert({
        where: {
          patientId_acteurAutoriseId: {
            patientId: codeTrouve!.patientId,
            acteurAutoriseId: session.userId,
          },
        },
        create: {
          patientId: codeTrouve!.patientId,
          acteurAutoriseId: session.userId,
          typeAcces: "consultations",
          dateFin: dateFinConsentement,
          statut: "actif",
        },
        update: {
          typeAcces: "consultations",
          dateFin: dateFinConsentement,
          statut: "actif",
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "partage_code_reussi",
          donneeConcernee: `patient:${codeTrouve!.patientId}`,
          adresseTechnique,
          justification: `Consentement "consultations" obtenu par code de partage, expire le ${dateFinConsentement.toISOString()}.`,
        },
        tx
      );
    });

    return { error: null, success: true, patientId: codeTrouve.patientId };
  } catch (erreur) {
    console.error("Erreur lors de la consommation du code de partage :", erreur);
    return {
      error: "Une erreur est survenue lors de la validation du code. Veuillez reessayer.",
      success: false,
    };
  }
}
