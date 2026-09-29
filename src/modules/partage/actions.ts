"use server";

/**
 * Server Actions du module partage : partage du dossier patient par code
 * temporaire (F-CIT-11 du pack). Le patient genere un code court (8
 * caracteres, format "XXXX-XXXX"), valable 10 minutes, usage unique. Le
 * professionnel (medecin ou infirmier valide, RG-CIT-91) le saisit pour
 * obtenir lui-meme un Consentement "consultations" (RG-CIT-90/91), sans que
 * le patient ait besoin de le chercher dans une liste au prealable.
 *
 * Le patient choisit le niveau d'acces (SUMMARY/FULL/FULL_SENSITIVE) et la
 * duree du consentement resultant au moment de generer le code, en
 * reutilisant exactement le meme mecanisme que F-CIT-10 (memes constantes
 * src/modules/patient/consentement-niveaux.ts et consentement-durees.ts,
 * meme regle serveur RG-ACC-13 : FULL_SENSITIVE refuse sans compte patient
 * verifie N2). Le typeAcces du consentement cree reste fixe a
 * "consultations" (le pack ne demande que le choix du niveau et de la duree
 * pour ce parcours, jamais du type d'acces) : ce depot n'a que deux types
 * reels ("dossier_complet"/"consultations", voir TYPES_ACCES_CONSULTATION
 * dans src/modules/clinical/actions.ts), jamais "dossier_complet" par
 * defaut pour un partage par code.
 *
 * Simplification assumee restante par rapport a la fiche complete du pack :
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
import { lireParametre } from "@/modules/administration/parametres-lecture";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { calculerDateFinConsentement, DUREES_CONSENTEMENT_CONNUES, type DureeConsentement } from "@/modules/patient/consentement-durees";
import {
  NIVEAU_VERIFICATION_MINIMAL_FULL_SENSITIVE,
  NIVEAUX_ACCES_CONNUS,
  type NiveauAccesConsentement,
} from "@/modules/patient/consentement-niveaux";

const ROUNDS_BCRYPT = 12;
const MAX_TENTATIVES_PAR_HEURE = 5;

// RG-CIT-90 : sans caracteres ambigus (pas de 0/O, 1/I/L).
const ALPHABET_CODE = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LONGUEUR_CODE = 8;
// Meme alphabet que la generation : une saisie hors alphabet ne peut correspondre a aucun code,
// inutile de la comparer par bcrypt a tous les codes actifs.
const FORMAT_CODE = new RegExp(`^[${ALPHABET_CODE}]{${LONGUEUR_CODE}}$`);

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

  return prisma.patient.findUnique({ where: { userId: session.userId }, include: { user: true } });
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

// Meme choix que F-CIT-10 (grantConsentAction) : niveau et duree valides
// contre les memes constantes, jamais une valeur inventee par ce parcours.
const schemaGenerationCode = z.object({
  niveauAcces: z.enum(NIVEAUX_ACCES_CONNUS, {
    message: "Choisissez un niveau d'accès.",
  }),
  duree: z.enum(DUREES_CONSENTEMENT_CONNUES, {
    message: "Choisissez une durée.",
  }),
});

/**
 * Genere un nouveau code de partage pour le patient connecte, invalide tout
 * code non consomme precedent (une seule demande active a la fois, meme
 * principe que creerEtEnvoyerCodeVerificationEmail). Le code en clair n'est
 * renvoye qu'a cet instant, jamais journalise, jamais relisible ensuite.
 *
 * F-CIT-11 ("comme F-CIT-10") : le patient choisit ici le niveau d'acces et
 * la duree du consentement que le code accordera. RG-ACC-13 (meme regle que
 * grantConsentAction, jamais contournee pour ce parcours) : le niveau
 * FULL_SENSITIVE est refuse si le compte du patient n'est pas verifie N2.
 */
export async function genererCodePartageAction(
  prevState: GenerationCodePartageState,
  formData: FormData
): Promise<GenerationCodePartageState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "code_partage"))) {
    return { error: "Action reservee aux patients.", success: false };
  }

  const validation = schemaGenerationCode.safeParse({
    niveauAcces: texte(formData, "niveauAcces"),
    duree: texte(formData, "duree"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Niveau ou durée invalide."),
      success: false,
    };
  }

  const { niveauAcces, duree } = validation.data;

  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return { error: "Aucun dossier patient associe a ce compte.", success: false };
  }

  // RG-ACC-13, meme regle que grantConsentAction (F-CIT-10) : jamais
  // contournee pour ce parcours de partage par code.
  if (niveauAcces === "FULL_SENSITIVE" && patient.user.niveauVerification !== NIVEAU_VERIFICATION_MINIMAL_FULL_SENSITIVE) {
    return {
      error:
        "Le niveau « Tout, y compris les informations sensibles » nécessite un compte vérifié (niveau N2). Faites vérifier votre identité avant de l'utiliser.",
      success: false,
    };
  }

  const code = genererCode();
  const codeHash = await bcrypt.hash(code, ROUNDS_BCRYPT);
  // F-ADM-07 : duree administrable, relue en base a chaque generation (RG-ADM-50).
  const dureeMinutes = await lireParametre("partage.code_duree_minutes");
  const expireLe = new Date(Date.now() + dureeMinutes * 60_000);

  try {
    const [, codeCree] = await prisma.$transaction([
      prisma.codePartageDossier.deleteMany({
        where: { patientId: patient.id, consommeLe: null },
      }),
      prisma.codePartageDossier.create({
        data: { patientId: patient.id, codeHash, expireLe, niveauAcces, duree },
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

    if (!FORMAT_CODE.test(codeNormalise)) {
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
    // F-CIT-11 ("comme F-CIT-10") : niveau et duree choisis par le patient a
    // la generation du code (schemaGenerationCode les a deja valides contre
    // NIVEAUX_ACCES_CONNUS/DUREES_CONSENTEMENT_CONNUES), jamais une valeur
    // fixe ici.
    const niveauAcces = codeTrouve.niveauAcces as NiveauAccesConsentement;
    const dateFinConsentement = calculerDateFinConsentement(codeTrouve.duree as DureeConsentement, dateConsommation);

    const accorde = await prisma.$transaction(async (tx) => {
      // Usage unique meme si deux professionnels saisissent le code en meme temps :
      // seule la premiere mise a jour trouve encore le code non consomme.
      const consomme = await tx.codePartageDossier.updateMany({
        where: { id: codeTrouve!.id, consommeLe: null },
        data: { consommeLe: dateConsommation, consommeParId: professionnel.id },
      });

      if (consomme.count !== 1) {
        return false;
      }

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
          niveauAcces,
          dateFin: dateFinConsentement,
          statut: "actif",
        },
        update: {
          typeAcces: "consultations",
          niveauAcces,
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
          justification: `Consentement "consultations" (niveau ${niveauAcces}) obtenu par code de partage, expire le ${dateFinConsentement.toISOString()}.`,
        },
        tx
      );

      return true;
    });

    if (!accorde) {
      return { error: "Code invalide, expire ou déjà utilisé.", success: false };
    }

    return { error: null, success: true, patientId: codeTrouve.patientId };
  } catch (erreur) {
    console.error("Erreur lors de la consommation du code de partage :", erreur);
    return {
      error: "Une erreur est survenue lors de la validation du code. Veuillez reessayer.",
      success: false,
    };
  }
}
