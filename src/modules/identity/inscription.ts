"use server";

/**
 * Inscription d'un citoyen (F-AUTH-01) en deux temps : le formulaire cree une
 * inscription EN ATTENTE et envoie un code a 6 chiffres par e-mail ; le compte,
 * le dossier patient et l'identifiant sante ne sont crees qu'apres la saisie du
 * bon code (RG-AUTH-04). Le code est valable 10 minutes, stocke hache, 5 essais
 * au plus ; un nouveau code annule le precedent (RG-AUTH-03).
 *
 * Aucune fuite d'information (CA-3) : que l'adresse ou le telephone soient deja
 * pris ou non, la reponse a la premiere etape est la meme (l'ecran de saisie du
 * code) ; c'est la seconde etape qui echoue de facon generique.
 *
 * Ecart assume par rapport au pack : le code part par e-mail, pas par SMS (le
 * fournisseur SMS n'est pas en production) et l'e-mail reste obligatoire parce
 * que la connexion l'utilise comme identifiant.
 */

import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { envoyerEmail } from "@/lib/mail";
import { codeAfficheALEcran } from "@/lib/demo";
import { verifierEtIncrementerDebit } from "@/lib/limite-debit";
import { normaliserTelephoneBenin } from "@/lib/telephone";
import { createSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { VERSION_CONDITIONS } from "./conditions";
import { genererIdentifiantSante } from "./identifiant-sante";
import { adresseDeLaRequete } from "./limitation-connexion";
import { LONGUEUR_MIN_CITOYEN, evaluerMotDePasse } from "./politique-mot-de-passe";

export interface InscriptionActionState {
  error: string | null;
  /** Etape a afficher : le formulaire, ou la saisie du code. */
  etape?: "formulaire" | "code";
  inscriptionToken?: string;
  emailMasque?: string;
  /** Code en clair, uniquement hors production (voir codeAfficheALEcran). */
  codeDemo?: string;
  message?: string;
}

const ROUNDS_BCRYPT = 12;
const DUREE_INSCRIPTION_MS = 30 * 60 * 1000;
const DUREE_CODE_MS = 10 * 60 * 1000;
const ESSAIS_MAX = 5;
const DELAI_ENTRE_ENVOIS_MS = 60 * 1000;
const ENVOIS_MAX_PAR_HEURE = 5;
const ENVOIS_MAX_PAR_JOUR = 10;
const ENVOIS_MAX_PAR_HEURE_ET_ADRESSE = 20;
const HEURE_MS = 60 * 60 * 1000;
const JOUR_MS = 24 * HEURE_MS;
const AGE_MINIMUM = 15;
const AGE_MAXIMUM = 120;
const TYPE_JETON = "inscription_pending";

const MESSAGE_TROP_DE_DEMANDES = "Trop de demandes. Réessayez dans 1 heure.";
const MESSAGE_ENVOI_GENERIQUE =
  "Si cette adresse n'a pas encore de compte, un code vient d'être envoyé. Sinon, connectez-vous ou utilisez « Mot de passe oublié ».";
const MESSAGE_CODE_INVALIDE = "Code incorrect ou expiré. Recommencez l'inscription si le problème continue.";
const MESSAGE_ANCIEN_FORMAT_TELEPHONE = "Les numéros béninois comptent désormais 10 chiffres et commencent par 01.";
const MESSAGE_DATE_NAISSANCE = "Vérifiez la date de naissance.";
const MESSAGE_MOINS_DE_15_ANS =
  "Les enfants de moins de 15 ans sont suivis depuis le compte d'un parent. Demandez à votre parent de vous ajouter.";

const LETTRES = /^[\p{L}][\p{L}\s'’.-]*$/u;

const schemaInscription = z.object({
  nom: z
    .string()
    .trim()
    .min(1, "Le nom est obligatoire.")
    .max(60, "Le nom ne doit pas dépasser 60 caractères.")
    .regex(LETTRES, "Le nom ne doit contenir que des lettres, espaces, tirets et apostrophes."),
  prenom: z
    .string()
    .trim()
    .min(1, "Le prénom est obligatoire.")
    .max(80, "Les prénoms ne doivent pas dépasser 80 caractères.")
    .regex(LETTRES, "Le prénom ne doit contenir que des lettres, espaces, tirets et apostrophes."),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Adresse e-mail invalide.")),
  telephone: z.string().trim().min(1, "Le numéro de téléphone est obligatoire."),
  motDePasse: z.string().min(1, "Le mot de passe est obligatoire."),
  dateNaissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, MESSAGE_DATE_NAISSANCE),
  sexe: z.enum(["M", "F"], { message: "Sexe invalide (M ou F attendu)." }),
  conditions: z.literal("on", { message: "Vous devez accepter les conditions d'utilisation et la politique de confidentialité." }),
});

function cleSecrete(): Uint8Array {
  return new TextEncoder().encode(getEnv().NEXTAUTH_SECRET);
}

async function signerJeton(inscriptionId: string): Promise<string> {
  return new SignJWT({ inscriptionId, type: TYPE_JETON })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("35m")
    .sign(cleSecrete());
}

async function lireJeton(jeton: unknown): Promise<string | null> {
  if (typeof jeton !== "string") return null;

  try {
    const { payload } = await jwtVerify(jeton, cleSecrete());
    return payload.type === TYPE_JETON && typeof payload.inscriptionId === "string" ? payload.inscriptionId : null;
  } catch {
    return null;
  }
}

function genererCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** "jeanne.doe@example.com" devient "j•••••@example.com". */
function masquerEmail(email: string): string {
  const [local, domaine] = email.split("@");
  return `${local.slice(0, 1)}•••••@${domaine}`;
}

/** Age en annees revolues a la date du jour (dates en UTC, sans dependre du fuseau du serveur). */
function ageEnAnnees(naissance: Date, maintenant = new Date()): number {
  let age = maintenant.getUTCFullYear() - naissance.getUTCFullYear();
  const anniversairePasse =
    maintenant.getUTCMonth() > naissance.getUTCMonth() ||
    (maintenant.getUTCMonth() === naissance.getUTCMonth() && maintenant.getUTCDate() >= naissance.getUTCDate());

  if (!anniversairePasse) age -= 1;

  return age;
}

function nomEnMajuscules(nom: string): string {
  return nom.replace(/\s+/g, " ").toUpperCase();
}

function prenomsCapitalises(prenoms: string): string {
  return prenoms
    .replace(/\s+/g, " ")
    .split(" ")
    .map((mot) => mot.charAt(0).toLocaleUpperCase("fr") + mot.slice(1).toLocaleLowerCase("fr"))
    .join(" ");
}

/** Renvoie le telephone normalise (+22901XXXXXXXX) ou un message d'erreur (RG-AUTH-01). */
function controlerTelephone(saisie: string): { telephone: string } | { erreur: string } {
  const chiffres = saisie.replace(/\D/g, "");

  if (chiffres.length === 8) {
    return { erreur: MESSAGE_ANCIEN_FORMAT_TELEPHONE };
  }

  const normalise = normaliserTelephoneBenin(saisie);

  return normalise
    ? { telephone: normalise }
    : { erreur: "Numéro de téléphone invalide. Exemple : +229 01 97 12 34 56." };
}

function gabaritEmailInscription(code: string): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1d2530;">
      <p>Voici votre code pour créer votre espace santé sur la Plateforme d'Intelligence Sanitaire du Bénin :</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 0.1em; color: #0a3764;">${code}</p>
      <p>Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail :
      aucun compte ne sera créé.</p>
    </div>
  `.trim();
}

async function envoyerCode(email: string, code: string): Promise<void> {
  try {
    await envoyerEmail({ to: email, subject: "Votre code d'inscription", html: gabaritEmailInscription(code) });
  } catch (erreur) {
    // En production, un code qui ne peut pas etre livre doit faire echouer la
    // demande. Hors production (relais SMTP local absent), le code s'affiche a l'ecran.
    if (getEnv().NODE_ENV === "production") {
      throw erreur;
    }
    console.error("Envoi du code d'inscription impossible (hors production, code affiche a l'ecran) :", erreur);
  }
}

/** Limites d'envoi par adresse e-mail et par adresse technique (RG-AUTH-03). */
function envoiAutorise(email: string, adresse: string | null): boolean {
  const parHeure = verifierEtIncrementerDebit(`inscription:email:heure:${email}`, ENVOIS_MAX_PAR_HEURE, HEURE_MS);
  const parJour = verifierEtIncrementerDebit(`inscription:email:jour:${email}`, ENVOIS_MAX_PAR_JOUR, JOUR_MS);
  const parAdresse =
    adresse === null ||
    verifierEtIncrementerDebit(`inscription:adresse:${adresse}`, ENVOIS_MAX_PAR_HEURE_ET_ADRESSE, HEURE_MS).autorise;

  return parHeure.autorise && parJour.autorise && parAdresse;
}

/**
 * Etape 1 : controle le formulaire, cree l'inscription en attente et envoie le
 * code. La reponse est la meme que l'adresse ou le telephone soient deja pris.
 */
export async function demarrerInscriptionAction(
  prevState: InscriptionActionState,
  formData: FormData
): Promise<InscriptionActionState> {
  const validation = schemaInscription.safeParse({
    nom: formData.get("nom"),
    prenom: formData.get("prenom"),
    email: formData.get("email"),
    telephone: formData.get("telephone"),
    motDePasse: formData.get("motDePasse"),
    dateNaissance: formData.get("dateNaissance"),
    sexe: formData.get("sexe"),
    conditions: formData.get("conditions"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Données d'inscription invalides.", etape: "formulaire" };
  }

  const donnees = validation.data;
  const dateNaissance = new Date(`${donnees.dateNaissance}T00:00:00.000Z`);

  if (Number.isNaN(dateNaissance.getTime()) || dateNaissance.toISOString().slice(0, 10) !== donnees.dateNaissance) {
    return { error: MESSAGE_DATE_NAISSANCE, etape: "formulaire" };
  }

  const age = ageEnAnnees(dateNaissance);

  if (age < 0 || age > AGE_MAXIMUM) {
    return { error: MESSAGE_DATE_NAISSANCE, etape: "formulaire" };
  }

  if (age < AGE_MINIMUM) {
    return { error: MESSAGE_MOINS_DE_15_ANS, etape: "formulaire" };
  }

  const telephone = controlerTelephone(donnees.telephone);

  if ("erreur" in telephone) {
    return { error: telephone.erreur, etape: "formulaire" };
  }

  const erreurMotDePasse = evaluerMotDePasse(donnees.motDePasse, {
    minimum: LONGUEUR_MIN_CITOYEN,
    contexte: { telephone: telephone.telephone, dateNaissance, email: donnees.email },
  });

  if (erreurMotDePasse) {
    return { error: erreurMotDePasse, etape: "formulaire" };
  }

  const adresse = await adresseDeLaRequete();

  if (!envoiAutorise(donnees.email, adresse)) {
    return { error: MESSAGE_TROP_DE_DEMANDES, etape: "formulaire" };
  }

  try {
    // Meme travail (hachage compris) que le compte existe ou non : ni la
    // reponse ni le temps de reponse ne dependent de l'existence du compte.
    const motDePasseHash = await bcrypt.hash(donnees.motDePasse, ROUNDS_BCRYPT);
    const code = genererCode();
    const codeHash = await bcrypt.hash(code, ROUNDS_BCRYPT);

    const compteExistant = await prisma.user.findFirst({
      where: { OR: [{ email: donnees.email }, { telephone: telephone.telephone, statut: "actif" }] },
      select: { id: true },
    });

    let inscriptionId: string = randomUUID();

    if (!compteExistant) {
      const maintenant = new Date();

      await prisma.inscriptionEnAttente.deleteMany({
        where: { OR: [{ email: donnees.email }, { expireLe: { lt: new Date(maintenant.getTime() - JOUR_MS) } }] },
      });

      const creee = await prisma.inscriptionEnAttente.create({
        data: {
          email: donnees.email,
          telephone: telephone.telephone,
          nom: nomEnMajuscules(donnees.nom),
          prenom: prenomsCapitalises(donnees.prenom),
          dateNaissance,
          sexe: donnees.sexe,
          motDePasseHash,
          conditionsVersion: VERSION_CONDITIONS,
          codeHash,
          expireLe: new Date(maintenant.getTime() + DUREE_INSCRIPTION_MS),
        },
      });

      inscriptionId = creee.id;
      await envoyerCode(donnees.email, code);
    }

    return {
      error: null,
      etape: "code",
      message: MESSAGE_ENVOI_GENERIQUE,
      inscriptionToken: await signerJeton(inscriptionId),
      emailMasque: masquerEmail(donnees.email),
      codeDemo: !compteExistant && codeAfficheALEcran(donnees.email) ? code : undefined,
    };
  } catch (erreur) {
    console.error("Erreur lors du demarrage de l'inscription :", erreur);
    return { error: "Une erreur est survenue. Veuillez réessayer.", etape: "formulaire" };
  }
}

/**
 * Etape 2 : verifie le code et cree le compte, le dossier patient et
 * l'identifiant sante dans une seule transaction, puis ouvre la session.
 */
export async function verifierCodeInscriptionAction(
  prevState: InscriptionActionState,
  formData: FormData
): Promise<InscriptionActionState> {
  const jeton = formData.get("inscriptionToken");
  const inscriptionId = await lireJeton(jeton);
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const etatCode = (message: string): InscriptionActionState => ({
    error: message,
    etape: "code",
    inscriptionToken: typeof jeton === "string" ? jeton : undefined,
    emailMasque: prevState.emailMasque,
  });

  if (!inscriptionId || !/^\d{6}$/.test(code)) {
    return etatCode(inscriptionId ? "Le code doit contenir 6 chiffres." : MESSAGE_CODE_INVALIDE);
  }

  let userId: string;

  try {
    const inscription = await prisma.inscriptionEnAttente.findUnique({ where: { id: inscriptionId } });

    if (!inscription || inscription.expireLe.getTime() < Date.now()) {
      return etatCode(MESSAGE_CODE_INVALIDE);
    }

    if (Date.now() - inscription.dernierEnvoiLe.getTime() > DUREE_CODE_MS) {
      return etatCode("Ce code a expiré. Touchez « Renvoyer le code ».");
    }

    const codeValide = await bcrypt.compare(code, inscription.codeHash);

    if (!codeValide) {
      const essais = inscription.essais + 1;

      if (essais >= ESSAIS_MAX) {
        await prisma.inscriptionEnAttente.delete({ where: { id: inscription.id } });
        return { error: "Trop d'essais. Votre inscription est annulée : recommencez.", etape: "formulaire" };
      }

      await prisma.inscriptionEnAttente.update({ where: { id: inscription.id }, data: { essais } });
      return etatCode(`Code incorrect. Il vous reste ${ESSAIS_MAX - essais} essai${ESSAIS_MAX - essais > 1 ? "s" : ""}.`);
    }

    const adresseTechnique = (await adresseDeLaRequete()) ?? "inconnue";
    let cree: { id: string } | null = null;

    for (let tentative = 0; tentative < 5 && !cree; tentative++) {
      try {
        cree = await prisma.$transaction(async (tx) => {
          const utilisateur = await tx.user.create({
            data: {
              nom: inscription.nom,
              prenom: inscription.prenom,
              email: inscription.email,
              telephone: inscription.telephone,
              motDePasseHash: inscription.motDePasseHash,
              statut: "actif",
              conditionsVersion: inscription.conditionsVersion,
              conditionsAccepteesLe: new Date(),
              roles: { create: [{ nom: "patient" }] },
              patient: {
                create: {
                  identifiantSante: genererIdentifiantSante(),
                  dateNaissance: inscription.dateNaissance,
                  sexe: inscription.sexe,
                  groupeSanguin: "inconnu",
                  contactsUrgence: "[]",
                },
              },
            },
          });

          await journaliser(
            {
              utilisateurId: utilisateur.id,
              action: "creation",
              donneeConcernee: `patient:${utilisateur.id}`,
              adresseTechnique,
              justification: `Inscription patient, code verifie, conditions ${inscription.conditionsVersion} acceptees`,
            },
            tx
          );
          await tx.inscriptionEnAttente.delete({ where: { id: inscription.id } });

          return utilisateur;
        });
      } catch (erreur) {
        const contrainte = erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002";
        const cible = contrainte ? String((erreur.meta as { target?: unknown } | undefined)?.target ?? "") : "";

        // Collision d'identifiant sante (tres improbable) : on retire un autre tirage.
        if (contrainte && cible.includes("identifiantSante")) continue;
        // Compte apparu entre-temps avec la meme adresse : reponse generique.
        if (contrainte) {
          await prisma.inscriptionEnAttente.deleteMany({ where: { id: inscription.id } });
          return etatCode(MESSAGE_CODE_INVALIDE);
        }
        throw erreur;
      }
    }

    if (!cree) {
      return etatCode("Une erreur est survenue. Veuillez réessayer.");
    }

    userId = cree.id;
  } catch (erreur) {
    console.error("Erreur lors de la creation du compte apres verification du code :", erreur);
    return etatCode("Une erreur est survenue. Veuillez réessayer.");
  }

  await createSession({ userId, roles: ["patient"] });
  redirect("/app/patient/bienvenue");
}

/** Renvoie un nouveau code (l'ancien est annule) : 60 s minimum entre deux envois, 5 par heure. */
export async function renvoyerCodeInscriptionAction(
  prevState: InscriptionActionState,
  formData: FormData
): Promise<InscriptionActionState> {
  const jeton = formData.get("inscriptionToken");
  const inscriptionId = await lireJeton(jeton);
  const etatCode = (message: string | null, extra: Partial<InscriptionActionState> = {}): InscriptionActionState => ({
    error: message,
    etape: "code",
    inscriptionToken: typeof jeton === "string" ? jeton : undefined,
    emailMasque: prevState.emailMasque,
    ...extra,
  });

  if (!inscriptionId) {
    return etatCode(MESSAGE_CODE_INVALIDE);
  }

  try {
    const inscription = await prisma.inscriptionEnAttente.findUnique({ where: { id: inscriptionId } });

    // Reponse identique si l'inscription n'existe pas (compte deja pris) : rien n'est envoye.
    if (!inscription || inscription.expireLe.getTime() < Date.now()) {
      return etatCode(null, { message: "Si l'adresse est valide, un nouveau code vient d'être envoyé." });
    }

    const attente = DELAI_ENTRE_ENVOIS_MS - (Date.now() - inscription.dernierEnvoiLe.getTime());

    if (attente > 0) {
      return etatCode(`Patientez encore ${Math.ceil(attente / 1000)} secondes avant de demander un nouveau code.`);
    }

    if (!envoiAutorise(inscription.email, await adresseDeLaRequete())) {
      return etatCode(MESSAGE_TROP_DE_DEMANDES);
    }

    const code = genererCode();
    const codeHash = await bcrypt.hash(code, ROUNDS_BCRYPT);

    await prisma.inscriptionEnAttente.update({
      where: { id: inscription.id },
      data: { codeHash, essais: 0, envois: { increment: 1 }, dernierEnvoiLe: new Date() },
    });
    await envoyerCode(inscription.email, code);

    return etatCode(null, {
      message: "Un nouveau code vient d'être envoyé.",
      codeDemo: codeAfficheALEcran(inscription.email) ? code : undefined,
    });
  } catch (erreur) {
    console.error("Erreur lors du renvoi du code d'inscription :", erreur);
    return etatCode("Une erreur est survenue. Veuillez réessayer.");
  }
}
