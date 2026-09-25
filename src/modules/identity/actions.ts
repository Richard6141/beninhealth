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

import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, getSession, destroySession } from "@/lib/session";
import { getEnv } from "@/lib/env";
import { verifierCodeMfaPourConnexion } from "@/modules/identity/mfa";
import {
  CODES_IDENTIFIANT_PAR_ROLE,
  prefixeIdentifiant,
  prochainIdentifiant,
} from "@/modules/identity/identifiants";
import { can } from "@/security/permissions";
import { calculerDateFinConsentement } from "@/modules/patient/consentement-durees";
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

/** Longueur minimale de la justification quand un medecin force la creation malgre un doublon probable (F-CLI-03 / RG-CLI-21 du pack, calquee sur la meme regle pour le forcage d'une alerte allergie). */
const LONGUEUR_MIN_JUSTIFICATION_DOUBLON = 10;

const schemaCreationPatientParProfessionnel = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire."),
  prenom: z.string().trim().min(1, "Le prenom est obligatoire."),
  sexe: z.enum(["M", "F"], { message: "Sexe invalide (M ou F attendu)." }),
  dateNaissance: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de naissance invalide (format attendu : AAAA-MM-JJ)."),
  telephone: z.string().trim().optional().default(""),
  contactUrgenceNom: z.string().trim().optional().default(""),
  contactUrgenceTelephone: z.string().trim().optional().default(""),
  confirmerMalgreDoublon: z.coerce.boolean().optional().default(false),
  justificationDoublon: z.string().trim().optional().default(""),
});

/** Candidat de doublon (F-CLI-03 du pack) : uniquement des informations minimales, jamais le dossier complet. */
export interface CandidatDoublonPatient {
  initiales: string;
  anneeNaissance: number;
  sexe: string;
  telephoneMasque: string | null;
}

/** Etat renvoye par creerPatientParProfessionnelAction. */
export interface CreationPatientActionState {
  error: string | null;
  success: boolean;
  patientId?: string;
  identifiantSante?: string;
  nomComplet?: string;
  // Rempli quand un doublon probable existe et que confirmerMalgreDoublon
  // n'a pas ete transmis : le formulaire doit alors demander confirmation
  // avant de reessayer (RG-CLI-20/21 du pack).
  candidatDoublon?: CandidatDoublonPatient | null;
}

function normaliserPourComparaison(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Masque un numero de telephone pour n'en laisser voir que les 4 derniers chiffres (RG-CLI-3b du pack). */
function masquerTelephone(telephone: string): string | null {
  const chiffres = telephone.replace(/\D/g, "");
  if (chiffres.length < 4) return null;
  return `••••${chiffres.slice(-4)}`;
}

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
      const nombreExistant = await tx.patient.count({
        where: { identifiantSante: { startsWith: prefixeIdentifiant(CODES_IDENTIFIANT_PAR_ROLE.patient) } },
      });
      const identifiantSante = prochainIdentifiant(CODES_IDENTIFIANT_PAR_ROLE.patient, nombreExistant);

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
              identifiantSante,
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
 * Cree un dossier patient "sans compte" a l'initiative d'un professionnel
 * (F-CLI-03 du pack) : pour un patient qui n'a pas encore de compte sur la
 * plateforme et se presente en personne. Contrairement a registerPatientAction
 * (inscription volontaire, ouvre une session), cette action cree un compte
 * User placeholder (statut "sans_compte", email genere, mot de passe
 * aleatoire jamais communique - personne ne peut s'y connecter tant que le
 * patient ne "reclame" pas son compte, fonctionnalite non construite dans ce
 * MVP) et accorde immediatement au professionnel createur un Consentement
 * "dossier_complet" de 12 mois : sans cela, le patient qu'il vient de creer
 * lui resterait inaccessible (aucun moyen pour un compte sans connexion de
 * l'accorder lui-meme).
 *
 * RG-CLI-20/21 du pack : verification de doublon obligatoire avant creation.
 * Simplifiee par rapport au score de similarite du pack (section 18.3) : un
 * candidat est signale des que (nom, prenom, date de naissance) normalises
 * correspondent exactement a un patient existant. Si confirmerMalgreDoublon
 * n'est pas coche, la creation est refusee et le candidat est renvoye (initiales,
 * annee de naissance, sexe, telephone masque uniquement - jamais le dossier
 * complet, RG-CLI-3b). Une creation forcee malgre un candidat exige une
 * justification d'au moins 10 caracteres, tracee dans JournalAudit (tient lieu
 * de file de revue admin, RG-CLI-21, non construite dans ce MVP).
 */
export async function creerPatientParProfessionnelAction(
  prevState: CreationPatientActionState,
  formData: FormData
): Promise<CreationPatientActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  // RBAC (voir src/security/permissions.ts) : la creation d'un dossier
  // patient est reservee aux roles qui peuvent aussi creer une consultation
  // (medecin) - meme perimetre que F-CLI-03 du pack (DOCTOR, NURSE,
  // RECEPTIONIST, CHW), reduit ici au seul role realiste de ce depot.
  if (!session.roles.some((role) => can(role, "create", "consultation"))) {
    return { error: "Action reservee aux medecins.", success: false };
  }

  const validation = schemaCreationPatientParProfessionnel.safeParse({
    nom: formData.get("nom"),
    prenom: formData.get("prenom"),
    sexe: formData.get("sexe"),
    dateNaissance: formData.get("dateNaissance"),
    telephone: formData.get("telephone"),
    contactUrgenceNom: formData.get("contactUrgenceNom"),
    contactUrgenceTelephone: formData.get("contactUrgenceTelephone"),
    confirmerMalgreDoublon: formData.get("confirmerMalgreDoublon"),
    justificationDoublon: formData.get("justificationDoublon"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de patient invalides."),
      success: false,
    };
  }

  const donnees = validation.data;
  const dateNaissance = new Date(donnees.dateNaissance);

  if (Number.isNaN(dateNaissance.getTime()) || dateNaissance > new Date()) {
    return { error: "Date de naissance invalide.", success: false };
  }

  if (donnees.confirmerMalgreDoublon && donnees.justificationDoublon.length < LONGUEUR_MIN_JUSTIFICATION_DOUBLON) {
    return {
      error: `La justification doit comporter au moins ${LONGUEUR_MIN_JUSTIFICATION_DOUBLON} caracteres.`,
      success: false,
    };
  }

  const nomNormalise = normaliserPourComparaison(donnees.nom);
  const prenomNormalise = normaliserPourComparaison(donnees.prenom);

  try {
    // RG-CLI-20 : verification de doublon obligatoire, refaite cote serveur
    // (jamais uniquement cote client) avant toute ecriture.
    if (!donnees.confirmerMalgreDoublon) {
      const patientsExistants = await prisma.patient.findMany({
        where: { dateNaissance },
        include: { user: true },
      });

      const candidat = patientsExistants.find(
        (patient) =>
          normaliserPourComparaison(patient.user.nom) === nomNormalise &&
          normaliserPourComparaison(patient.user.prenom) === prenomNormalise
      );

      if (candidat) {
        return {
          error: "Un patient correspondant a deja un dossier. Verifiez avant de continuer.",
          success: false,
          candidatDoublon: {
            initiales: `${candidat.user.prenom.charAt(0)}${candidat.user.nom.charAt(0)}`.toUpperCase(),
            anneeNaissance: candidat.dateNaissance.getFullYear(),
            sexe: candidat.sexe,
            telephoneMasque: masquerTelephone(candidat.user.telephone),
          },
        };
      }
    }

    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const motDePasseAleatoire = randomUUID() + randomUUID();
    const motDePasseHash = await bcrypt.hash(motDePasseAleatoire, ROUNDS_BCRYPT);
    const emailPlaceholder = `sans-compte.${randomUUID()}@interne.benin-health.local`;
    const adresseTechnique = await adresseTechniqueCourante();
    const contactsUrgence = donnees.contactUrgenceNom
      ? JSON.stringify([
          { nom: donnees.contactUrgenceNom, telephone: donnees.contactUrgenceTelephone, lienParente: "" },
        ])
      : "[]";

    const resultat = await prisma.$transaction(async (tx) => {
      const nombreExistant = await tx.patient.count({
        where: { identifiantSante: { startsWith: prefixeIdentifiant(CODES_IDENTIFIANT_PAR_ROLE.patient) } },
      });
      const identifiantSante = prochainIdentifiant(CODES_IDENTIFIANT_PAR_ROLE.patient, nombreExistant);

      const utilisateur = await tx.user.create({
        data: {
          nom: donnees.nom,
          prenom: donnees.prenom,
          email: emailPlaceholder,
          telephone: donnees.telephone || "inconnu",
          motDePasseHash,
          statut: "sans_compte",
          roles: { create: [{ nom: "patient" }] },
          patient: {
            create: {
              identifiantSante,
              dateNaissance,
              sexe: donnees.sexe,
              groupeSanguin: "inconnu",
              contactsUrgence,
            },
          },
        },
        include: { patient: true },
      });

      const dateDebut = new Date();

      await tx.consentement.create({
        data: {
          patientId: utilisateur.patient!.id,
          acteurAutoriseId: session.userId,
          typeAcces: "dossier_complet",
          statut: "actif",
          dateDebut,
          dateFin: calculerDateFinConsentement("12mois", dateDebut),
        },
      });

      await tx.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "creation_patient_par_professionnel",
          donneeConcernee: `patient:${utilisateur.patient!.id}`,
          adresseTechnique,
          justification: donnees.confirmerMalgreDoublon
            ? `Dossier cree malgre un doublon probable : ${donnees.justificationDoublon}`
            : "Dossier patient cree sans compte, aucun doublon probable detecte.",
        },
      });

      return { patientId: utilisateur.patient!.id, identifiantSante };
    });

    revalidatePath("/app/medecin/patients");

    return {
      error: null,
      success: true,
      patientId: resultat.patientId,
      identifiantSante: resultat.identifiantSante,
      nomComplet: `${donnees.prenom} ${donnees.nom}`,
    };
  } catch (erreur) {
    console.error("Erreur lors de la creation du patient par un professionnel :", erreur);
    return {
      error: "Une erreur est survenue lors de la creation du dossier. Veuillez reessayer.",
      success: false,
    };
  }
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

/**
 * Systeme de profil (page "Mon profil") : consultation et modification des
 * informations personnelles, changement de mot de passe, televersement de
 * la photo de profil. Meme principe Zero Trust que le reste du module :
 * l'utilisateur cible est toujours derive de getSession().userId, jamais
 * d'un id transmis par le client.
 */

export interface ProfilActionState {
  error: string | null;
  success: boolean;
}

export interface MonProfil {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  avatarUrl: string | null;
  roles: NomRole[];
  /**
   * Identifiant public de la personne connectee (identifiantSante pour un
   * patient, numeroProfessionnel pour un professionnel/admin_etablissement),
   * format BJ-SANTE-<CODE>-0001 (voir src/modules/identity/identifiants.ts).
   * Null pour un role sans identifiant propre (ex. admin_national, voir
   * limite documentee dans identifiants.ts).
   */
  identifiant: string | null;
}

/** Profil complet de l'utilisateur connecte, pour l'ecran "Mon profil" et l'en-tete de l'espace authentifie. */
export async function getMonProfil(): Promise<MonProfil | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const utilisateur = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { roles: true, patient: true, professionnel: true },
  });

  if (!utilisateur) {
    return null;
  }

  return {
    nom: utilisateur.nom,
    prenom: utilisateur.prenom,
    email: utilisateur.email,
    telephone: utilisateur.telephone,
    avatarUrl: utilisateur.avatarUrl,
    roles: utilisateur.roles.map((role) => role.nom as NomRole),
    identifiant: utilisateur.patient?.identifiantSante ?? utilisateur.professionnel?.numeroProfessionnel ?? null,
  };
}

const schemaProfil = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire."),
  prenom: z.string().trim().min(1, "Le prenom est obligatoire."),
  telephone: z.string().trim().min(1, "Le numero de telephone est obligatoire."),
});

/** Met a jour nom, prenom et telephone. L'email n'est volontairement pas modifiable ici. */
export async function mettreAJourProfilAction(
  prevState: ProfilActionState,
  formData: FormData
): Promise<ProfilActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree, veuillez vous reconnecter.", success: false };
  }

  const validation = schemaProfil.safeParse({
    nom: formData.get("nom"),
    prenom: formData.get("prenom"),
    telephone: formData.get("telephone"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de profil invalides."),
      success: false,
    };
  }

  try {
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.userId },
        data: validation.data,
      }),
      prisma.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "modification_profil",
          donneeConcernee: `utilisateur:${session.userId}`,
          adresseTechnique,
          justification: "Mise a jour des informations personnelles",
        },
      }),
    ]);
  } catch (erreur) {
    console.error("Erreur lors de la mise a jour du profil :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }

  revalidatePath("/app/profil");
  return { error: null, success: true };
}

const DOSSIER_AVATARS = path.join(process.cwd(), "public", "uploads", "avatars");
const TAILLE_MAX_AVATAR_OCTETS = 3 * 1024 * 1024;
const EXTENSIONS_AVATAR_AUTORISEES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Televersement de la photo de profil : fichier stocke localement sous
 * public/uploads/avatars (jamais envoye vers un service tiers), nomme
 * d'apres l'id utilisateur pour remplacer automatiquement l'avatar
 * precedent. Extension deduite du type MIME reel du fichier, jamais du nom
 * fourni par le navigateur.
 */
export async function televerserAvatarAction(
  prevState: ProfilActionState,
  formData: FormData
): Promise<ProfilActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree, veuillez vous reconnecter.", success: false };
  }

  const fichier = formData.get("avatar");

  if (!(fichier instanceof File) || fichier.size === 0) {
    return { error: "Veuillez choisir une image.", success: false };
  }

  const extension = EXTENSIONS_AVATAR_AUTORISEES[fichier.type];

  if (!extension) {
    return {
      error: "Format d'image non pris en charge (PNG, JPEG ou WebP attendu).",
      success: false,
    };
  }

  if (fichier.size > TAILLE_MAX_AVATAR_OCTETS) {
    return { error: "L'image depasse la taille maximale de 3 Mo.", success: false };
  }

  try {
    await mkdir(DOSSIER_AVATARS, { recursive: true });

    const fichiersExistants = await readdir(DOSSIER_AVATARS);
    await Promise.all(
      fichiersExistants
        .filter((nom) => nom.startsWith(`${session.userId}.`))
        .map((nom) => unlink(path.join(DOSSIER_AVATARS, nom)))
    );

    const nomFichier = `${session.userId}.${extension}`;
    const octets = Buffer.from(await fichier.arrayBuffer());
    await writeFile(path.join(DOSSIER_AVATARS, nomFichier), octets);

    const avatarUrl = `/uploads/avatars/${nomFichier}`;
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.userId },
        data: { avatarUrl },
      }),
      prisma.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "televersement_avatar",
          donneeConcernee: `utilisateur:${session.userId}`,
          adresseTechnique,
          justification: "Televersement d'une nouvelle photo de profil",
        },
      }),
    ]);
  } catch (erreur) {
    console.error("Erreur lors du televersement de l'avatar :", erreur);
    return {
      error: "Une erreur est survenue lors du televersement. Veuillez reessayer.",
      success: false,
    };
  }

  revalidatePath("/app/profil");
  revalidatePath("/app", "layout");
  return { error: null, success: true };
}
