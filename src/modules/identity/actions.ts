"use server";

/**
 * Server Actions du module identity : inscription patient, connexion,
 * deconnexion. Contrat d'integration Phase 2, consomme par les ecrans
 * src/app/connexion et src/app/inscription (autre agent).
 *
 * Principes appliques (voir src/security/README.md) : mot de passe hache
 * (bcryptjs, 12 rounds), jamais de mot de passe en clair stocke ou journalise,
 * message d'erreur volontairement generique a la connexion (ne revele jamais
 * si un email existe), traçabilite systematique (JournalAudit) des evenements
 * d'authentification.
 */

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, getSession, destroySession } from "@/lib/session";
import { getEnv } from "@/lib/env";
import { verifierCodeMfaPourConnexion } from "@/modules/identity/mfa";
import type { NomRole } from "@/types";

/**
 * Etat renvoye par chaque Server Action de ce module, consomme via useActionState.
 * mfaRequis/preAuthToken (Phase 7) : uniquement renvoyes par loginAction quand le
 * compte a la double authentification active ; l'ecran doit alors afficher une
 * deuxieme etape (code a 6 chiffres) et soumettre preAuthToken tel quel a
 * verifierMfaEtConnecterAction, sans jamais le modifier ni le decoder cote client.
 */
export interface AuthActionState {
  error: string | null;
  mfaRequis?: boolean;
  preAuthToken?: string;
}

const DUREE_PRE_AUTH_MFA = "5m";
const TYPE_JETON_PRE_AUTH_MFA = "mfa_pending";

function cleSecretePreAuth(): Uint8Array {
  return new TextEncoder().encode(getEnv().NEXTAUTH_SECRET);
}

/** Redirige vers l'espace correspondant aux roles fournis (meme logique pour loginAction et la validation MFA). */
function redirigerSelonRoles(roles: NomRole[]): never {
  if (roles.includes("patient")) {
    redirect("/app/patient");
  }
  if (roles.includes("admin_national")) {
    redirect("/app/ministere");
  }
  if (roles.includes("admin_etablissement")) {
    redirect("/app/etablissement");
  }
  redirect("/app/medecin");
}

const ROUNDS_BCRYPT = 12;

const schemaInscriptionPatient = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire."),
  prenom: z.string().trim().min(1, "Le prenom est obligatoire."),
  email: z.email("Adresse email invalide."),
  telephone: z.string().trim().min(1, "Le numero de telephone est obligatoire."),
  motDePasse: z.string().min(8, "Le mot de passe doit contenir au moins 8 caracteres."),
  dateNaissance: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de naissance invalide (format attendu : AAAA-MM-JJ)."),
  sexe: z.enum(["M", "F"], { message: "Sexe invalide (M ou F attendu)." }),
});

const schemaConnexion = z.object({
  email: z.email("Adresse email invalide."),
  motDePasse: z.string().min(1, "Le mot de passe est obligatoire."),
});

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    const adresse =
      listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? null;
    return adresse ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/** Genere un identifiant sante court et lisible, ex : "BJ-SANTE-3F9A21C4". */
function genererIdentifiantSante(): string {
  const suffixe = randomUUID().replace(/-/g, "").toUpperCase().slice(0, 8);
  return `BJ-SANTE-${suffixe}`;
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

function estErreurContrainteUnique(erreur: unknown): boolean {
  return (
    erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002"
  );
}

/**
 * Inscription d'un nouveau patient : cree le compte User, le role "patient"
 * et le profil Patient minimal en une transaction, ouvre la session, puis
 * redirige vers l'espace patient.
 */
export async function registerPatientAction(
  prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const validation = schemaInscriptionPatient.safeParse({
    nom: formData.get("nom"),
    prenom: formData.get("prenom"),
    email: formData.get("email"),
    telephone: formData.get("telephone"),
    motDePasse: formData.get("motDePasse"),
    dateNaissance: formData.get("dateNaissance"),
    sexe: formData.get("sexe"),
  });

  if (!validation.success) {
    return { error: premierMessageErreur(validation.error, "Donnees d'inscription invalides.") };
  }

  const donnees = validation.data;
  const dateNaissance = new Date(donnees.dateNaissance);

  if (Number.isNaN(dateNaissance.getTime())) {
    return { error: "Date de naissance invalide." };
  }

  const compteExistant = await prisma.user.findUnique({ where: { email: donnees.email } });

  if (compteExistant) {
    return { error: "Un compte existe deja avec cet email." };
  }

  let userId: string;

  try {
    const motDePasseHash = await bcrypt.hash(donnees.motDePasse, ROUNDS_BCRYPT);
    const adresseTechnique = await adresseTechniqueCourante();

    const utilisateurCree = await prisma.$transaction(async (tx) => {
      const utilisateur = await tx.user.create({
        data: {
          nom: donnees.nom,
          prenom: donnees.prenom,
          email: donnees.email,
          telephone: donnees.telephone,
          motDePasseHash,
          statut: "actif",
          roles: {
            create: [{ nom: "patient" }],
          },
          patient: {
            create: {
              identifiantSante: genererIdentifiantSante(),
              dateNaissance,
              sexe: donnees.sexe,
              groupeSanguin: "inconnu",
              contactsUrgence: "[]",
            },
          },
        },
      });

      await tx.journalAudit.create({
        data: {
          utilisateurId: utilisateur.id,
          action: "creation",
          donneeConcernee: `patient:${utilisateur.id}`,
          adresseTechnique,
          justification: "Inscription patient",
        },
      });

      return utilisateur;
    });

    userId = utilisateurCree.id;
  } catch (erreur) {
    if (estErreurContrainteUnique(erreur)) {
      return { error: "Un compte existe deja avec cet email." };
    }

    console.error("Erreur lors de l'inscription patient :", erreur);
    return { error: "Une erreur est survenue lors de l'inscription. Veuillez reessayer." };
  }

  await createSession({ userId, roles: ["patient"] });
  redirect("/app/patient");
}

/**
 * Connexion par email et mot de passe. Message d'erreur volontairement
 * generique dans tous les cas d'echec (email inconnu, mot de passe errone,
 * compte non actif) pour ne jamais reveler l'existence d'un compte.
 */
export async function loginAction(
  prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const MESSAGE_ERREUR_GENERIQUE = "Identifiants incorrects.";

  const validation = schemaConnexion.safeParse({
    email: formData.get("email"),
    motDePasse: formData.get("motDePasse"),
  });

  if (!validation.success) {
    return { error: MESSAGE_ERREUR_GENERIQUE };
  }

  const { email, motDePasse } = validation.data;

  let roles: NomRole[];
  let userId: string;

  try {
    const utilisateur = await prisma.user.findUnique({
      where: { email },
      include: { roles: true },
    });

    if (!utilisateur || utilisateur.statut !== "actif") {
      return { error: MESSAGE_ERREUR_GENERIQUE };
    }

    const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.motDePasseHash);

    if (!motDePasseValide) {
      return { error: MESSAGE_ERREUR_GENERIQUE };
    }

    roles = utilisateur.roles.map((role) => role.nom as NomRole);
    userId = utilisateur.id;

    // Double authentification (Phase 7) : mot de passe correct mais MFA active
    // sur ce compte, on ne cree pas encore de session. On emet un jeton de
    // pre-authentification de courte duree (5 minutes, jamais pose en cookie,
    // uniquement transmis dans un champ cache du formulaire de code) que
    // verifierMfaEtConnecterAction devra presenter avec un code TOTP valide
    // pour obtenir la session reelle.
    if (utilisateur.mfaActif) {
      const preAuthToken = await new SignJWT({ userId, type: TYPE_JETON_PRE_AUTH_MFA })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(DUREE_PRE_AUTH_MFA)
        .sign(cleSecretePreAuth());

      return { error: null, mfaRequis: true, preAuthToken };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { derniereConnexion: new Date() },
      }),
      prisma.journalAudit.create({
        data: {
          utilisateurId: userId,
          action: "connexion",
          donneeConcernee: `utilisateur:${userId}`,
          adresseTechnique,
          justification: "Connexion reussie",
        },
      }),
    ]);

    await createSession({ userId, roles });
  } catch (erreur) {
    console.error("Erreur lors de la connexion :", erreur);
    return { error: MESSAGE_ERREUR_GENERIQUE };
  }

  redirigerSelonRoles(roles);
}

/**
 * Deuxieme etape de connexion pour un compte avec la double authentification
 * active : verifie le jeton de pre-authentification emis par loginAction
 * (signature, expiration, type) puis le code TOTP saisi, avant de creer la
 * session reelle. Message d'erreur volontairement generique, comme loginAction.
 */
export async function verifierMfaEtConnecterAction(
  prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const MESSAGE_ERREUR_GENERIQUE = "Code incorrect ou session expiree. Veuillez vous reconnecter.";

  const preAuthToken = formData.get("preAuthToken");
  const code = formData.get("code");

  if (typeof preAuthToken !== "string" || typeof code !== "string") {
    return { error: MESSAGE_ERREUR_GENERIQUE };
  }

  let userId: string;

  try {
    const { payload } = await jwtVerify(preAuthToken, cleSecretePreAuth());

    if (payload.type !== TYPE_JETON_PRE_AUTH_MFA || typeof payload.userId !== "string") {
      return { error: MESSAGE_ERREUR_GENERIQUE };
    }

    userId = payload.userId;
  } catch {
    return { error: MESSAGE_ERREUR_GENERIQUE };
  }

  const codeValide = await verifierCodeMfaPourConnexion(userId, code);

  if (!codeValide) {
    return { error: MESSAGE_ERREUR_GENERIQUE };
  }

  let roles: NomRole[];

  try {
    const utilisateur = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true },
    });

    if (!utilisateur || utilisateur.statut !== "actif") {
      return { error: MESSAGE_ERREUR_GENERIQUE };
    }

    roles = utilisateur.roles.map((role) => role.nom as NomRole);
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { derniereConnexion: new Date() },
      }),
      prisma.journalAudit.create({
        data: {
          utilisateurId: userId,
          action: "connexion",
          donneeConcernee: `utilisateur:${userId}`,
          adresseTechnique,
          justification: "Connexion reussie (double authentification validee)",
        },
      }),
    ]);

    await createSession({ userId, roles });
  } catch (erreur) {
    console.error("Erreur lors de la validation MFA :", erreur);
    return { error: MESSAGE_ERREUR_GENERIQUE };
  }

  redirigerSelonRoles(roles);
}

/**
 * Deconnexion : journalise l'evenement si une session valide existe, detruit
 * le cookie de session puis redirige vers l'ecran de connexion.
 */
export async function logoutAction(): Promise<void> {
  const session = await getSession();

  if (session) {
    try {
      const adresseTechnique = await adresseTechniqueCourante();
      await prisma.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "deconnexion",
          donneeConcernee: `utilisateur:${session.userId}`,
          adresseTechnique,
          justification: "Deconnexion utilisateur",
        },
      });
    } catch (erreur) {
      console.error("Erreur lors de l'ecriture du journal d'audit (deconnexion) :", erreur);
    }
  }

  await destroySession();
  redirect("/connexion");
}
