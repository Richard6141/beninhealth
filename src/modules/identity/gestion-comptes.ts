"use server";

/**
 * Server Actions du module identity : provisionnement de la hierarchie
 * organisationnelle reelle (Phase 6).
 *
 * Regle metier : tout repose sur un etablissement. Les etablissements ne sont
 * crees que par le ministere (role admin_national), qui cree en meme temps le
 * compte administrateur de cet etablissement (role admin_etablissement).
 * Ce compte administrateur cree ensuite lui-meme les comptes du personnel de
 * son etablissement (medecin, infirmier, agent_communautaire, pharmacien,
 * laboratoire). Aucune auto-inscription pour ces roles (a la difference du
 * patient, voir src/modules/identity/actions.ts).
 *
 * Principes appliques, identiques a src/modules/identity/actions.ts : Zero
 * Trust (chaque fonction verifie elle-meme le role de l'appelant, jamais
 * seulement l'ecran), mot de passe hache (bcryptjs, 12 rounds), mot de passe
 * temporaire genere aleatoirement (node:crypto, jamais Math.random), jamais
 * stocke ni journalise en clair, et tracabilite systematique (JournalAudit)
 * de toute creation ou modification de compte.
 */

import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { NomRole, TypeEtablissement } from "@/types";

/**
 * Etat renvoye par chaque Server Action de ce module, consomme via
 * useActionState.
 */
export interface GestionCompteActionState {
  error: string | null;
  success: boolean;
  /** Present uniquement en cas de succes de creation de compte : mot de passe
   * temporaire en clair, a communiquer une seule fois a la personne concernee.
   * Jamais stocke en clair ni journalise. */
  motDePasseTemporaire?: string;
}

/** Etablissement avec les indicateurs de gestion utiles au ministere. */
export interface EtablissementDetail {
  id: string;
  nom: string;
  type: string;
  localisation: string;
  nombreProfessionnels: number;
  adminNomComplet: string | null;
}

/** Membre du personnel d'un etablissement, tel qu'affiche a son administrateur. */
export interface MembrePersonnel {
  userId: string;
  nomComplet: string;
  role: string;
  specialite: string;
  statutValidation: string;
  email: string;
}

const ROUNDS_BCRYPT = 12;

/**
 * Specialite conventionnelle du ProfessionnelSante rattachant un compte
 * admin_etablissement a son etablissement. Meme convention que
 * prisma/seed.ts (compte admin.etablissement.demo).
 */
const SPECIALITE_ADMINISTRATION = "Administration";

const TYPES_ETABLISSEMENT_CONNUS = [
  "centre_sante",
  "hopital",
  "laboratoire",
  "pharmacie",
] as const satisfies readonly TypeEtablissement[];

/**
 * Roles que peut creer un compte admin_etablissement pour son propre
 * etablissement. Exclut volontairement admin_etablissement, admin_national
 * et patient : ce ne sont pas des comptes que cette fonction doit pouvoir
 * creer (voir contexte metier en tete de fichier).
 */
const ROLES_CREABLES_PAR_ETABLISSEMENT = [
  "medecin",
  "infirmier",
  "agent_communautaire",
  "pharmacien",
  "laboratoire",
] as const satisfies readonly NomRole[];

/**
 * Convertit un champ texte de FormData en nombre valide. Zod v4 a un souci de
 * typage entre `.pipe()` et `z.coerce.number()` (le type d'entree "unknown"
 * du schema coerce n'est pas reconnu comme compatible avec la sortie string
 * du schema precedent) : on passe donc par `.transform()` avec verification
 * manuelle plutot que par `.pipe(z.coerce.number())`.
 */
function schemaNombreObligatoire(messageObligatoire: string, messageInvalide: string) {
  return z
    .string()
    .trim()
    .min(1, messageObligatoire)
    .transform((valeur, ctx) => {
      const nombre = Number(valeur);
      if (Number.isNaN(nombre)) {
        ctx.addIssue({ code: "custom", message: messageInvalide });
        return z.NEVER;
      }
      return nombre;
    });
}

const schemaCreationEtablissement = z.object({
  nom: z.string().trim().min(1, "Le nom de l'etablissement est obligatoire."),
  type: z.enum(TYPES_ETABLISSEMENT_CONNUS, { message: "Type d'etablissement invalide." }),
  localisation: z.string().trim().min(1, "La localisation est obligatoire."),
  latitude: schemaNombreObligatoire(
    "La latitude est obligatoire.",
    "La latitude doit etre un nombre valide."
  ),
  longitude: schemaNombreObligatoire(
    "La longitude est obligatoire.",
    "La longitude doit etre un nombre valide."
  ),
  capacite: schemaNombreObligatoire(
    "La capacite est obligatoire.",
    "La capacite doit etre un nombre entier."
  ).pipe(
    z
      .number()
      .int("La capacite doit etre un nombre entier.")
      .nonnegative("La capacite doit etre positive ou nulle.")
  ),
  servicesDisponibles: z.string().optional().default(""),
  adminNom: z.string().trim().min(1, "Le nom de l'administrateur est obligatoire."),
  adminPrenom: z.string().trim().min(1, "Le prenom de l'administrateur est obligatoire."),
  adminEmail: z.email("Adresse email de l'administrateur invalide."),
  adminTelephone: z.string().trim().min(1, "Le telephone de l'administrateur est obligatoire."),
});

const schemaCreationProfessionnel = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire."),
  prenom: z.string().trim().min(1, "Le prenom est obligatoire."),
  email: z.email("Adresse email invalide."),
  telephone: z.string().trim().min(1, "Le telephone est obligatoire."),
  role: z.enum(ROLES_CREABLES_PAR_ETABLISSEMENT, { message: "Role invalide." }),
  specialite: z.string().trim().min(1, "La specialite est obligatoire."),
  numeroProfessionnel: z.string().trim().min(1, "Le numero professionnel est obligatoire."),
});

const schemaChangementMotDePasse = z
  .object({
    motDePasseActuel: z.string().min(1, "Le mot de passe actuel est obligatoire."),
    nouveauMotDePasse: z
      .string()
      .min(8, "Le nouveau mot de passe doit contenir au moins 8 caracteres."),
    confirmationMotDePasse: z
      .string()
      .min(1, "La confirmation du mot de passe est obligatoire."),
  })
  .refine((donnees) => donnees.nouveauMotDePasse === donnees.confirmationMotDePasse, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmationMotDePasse"],
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

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

function estErreurContrainteUnique(erreur: unknown): boolean {
  return (
    erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002"
  );
}

const MAJUSCULES_LISIBLES = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sans I ni O (ambigus)
const MINUSCULES_LISIBLES = "abcdefghijkmnpqrstuvwxyz"; // sans l ni o (ambigus)
const CHIFFRES_LISIBLES = "23456789"; // sans 0 ni 1 (ambigus)
const TOUS_CARACTERES_LISIBLES = MAJUSCULES_LISIBLES + MINUSCULES_LISIBLES + CHIFFRES_LISIBLES;
const LONGUEUR_MOT_DE_PASSE_TEMPORAIRE = 12;

function caractereAleatoire(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)];
}

/**
 * Genere un mot de passe temporaire aleatoire et lisible (12 caracteres,
 * majuscules, minuscules et chiffres, sans caracteres ambigus). Utilise
 * node:crypto (randomInt), jamais Math.random. A communiquer une seule fois
 * a la personne concernee ; jamais stocke ni journalise en clair.
 */
function genererMotDePasseTemporaire(): string {
  const caracteresObligatoires = [
    caractereAleatoire(MAJUSCULES_LISIBLES),
    caractereAleatoire(MINUSCULES_LISIBLES),
    caractereAleatoire(CHIFFRES_LISIBLES),
  ];

  const nombreCaracteresRestants =
    LONGUEUR_MOT_DE_PASSE_TEMPORAIRE - caracteresObligatoires.length;
  const caracteresRestants = Array.from({ length: nombreCaracteresRestants }, () =>
    caractereAleatoire(TOUS_CARACTERES_LISIBLES)
  );

  const motDePasse = [...caracteresObligatoires, ...caracteresRestants];

  // Melange Fisher-Yates (avec randomInt) pour eviter un motif previsible
  // (ex : toujours une majuscule en premiere position).
  for (let indice = motDePasse.length - 1; indice > 0; indice -= 1) {
    const autreIndice = randomInt(indice + 1);
    [motDePasse[indice], motDePasse[autreIndice]] = [
      motDePasse[autreIndice],
      motDePasse[indice],
    ];
  }

  return motDePasse.join("");
}

/** Genere un numero professionnel court et lisible pour un compte administrateur d'etablissement. */
function genererNumeroProfessionnelAdmin(): string {
  const suffixe = randomUUID().replace(/-/g, "").toUpperCase().slice(0, 8);
  return `BJ-ADM-${suffixe}`;
}

/** Convertit le contenu d'une zone de texte (une entree par ligne) en tableau JSON. */
function servicesDisponiblesEnJSON(valeurBrute: string): string {
  const services = valeurBrute
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.length > 0);
  return JSON.stringify(services);
}

/**
 * Liste tous les etablissements avec, pour chacun, le nombre de
 * ProfessionnelSante rattaches et le nom complet de son administrateur.
 * Reserve au role admin_national : renvoie une liste vide si l'appelant n'a
 * pas ce role (Zero Trust, verifie ici et non seulement cote ecran).
 */
export async function listEtablissementsDetail(): Promise<EtablissementDetail[]> {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_national")) {
    return [];
  }

  const etablissements = await prisma.etablissementSanitaire.findMany({
    include: {
      professionnels: {
        include: { user: true },
      },
    },
    orderBy: { nom: "asc" },
  });

  return etablissements.map((etablissement) => {
    const admin = etablissement.professionnels.find(
      (professionnel) => professionnel.specialite === SPECIALITE_ADMINISTRATION
    );

    return {
      id: etablissement.id,
      nom: etablissement.nom,
      type: etablissement.type,
      localisation: etablissement.localisation,
      nombreProfessionnels: etablissement.professionnels.length,
      adminNomComplet: admin ? `${admin.user.prenom} ${admin.user.nom}` : null,
    };
  });
}

/**
 * Cree un etablissement et, dans la meme transaction, le compte
 * administrateur unique de cet etablissement (role admin_etablissement).
 * Reserve au role admin_national : verifie le role de l'appelant dans la
 * fonction elle-meme (Zero Trust), pas seulement cote ecran.
 */
export async function creerEtablissementAction(
  prevState: GestionCompteActionState,
  formData: FormData
): Promise<GestionCompteActionState> {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_national")) {
    return { error: "Action reservee au ministere.", success: false };
  }

  const validation = schemaCreationEtablissement.safeParse({
    nom: formData.get("nom"),
    type: formData.get("type"),
    localisation: formData.get("localisation"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    capacite: formData.get("capacite"),
    servicesDisponibles: formData.get("servicesDisponibles"),
    adminNom: formData.get("adminNom"),
    adminPrenom: formData.get("adminPrenom"),
    adminEmail: formData.get("adminEmail"),
    adminTelephone: formData.get("adminTelephone"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees d'etablissement invalides."),
      success: false,
    };
  }

  const donnees = validation.data;

  const compteExistant = await prisma.user.findUnique({
    where: { email: donnees.adminEmail },
  });

  if (compteExistant) {
    return { error: "Un compte existe deja avec cet email.", success: false };
  }

  const motDePasseTemporaire = genererMotDePasseTemporaire();

  try {
    const motDePasseHash = await bcrypt.hash(motDePasseTemporaire, ROUNDS_BCRYPT);
    const adresseTechnique = await adresseTechniqueCourante();
    const servicesJSON = servicesDisponiblesEnJSON(donnees.servicesDisponibles);

    await prisma.$transaction(async (tx) => {
      const etablissement = await tx.etablissementSanitaire.create({
        data: {
          nom: donnees.nom,
          type: donnees.type,
          localisation: donnees.localisation,
          latitude: donnees.latitude,
          longitude: donnees.longitude,
          servicesDisponibles: servicesJSON,
          capacite: donnees.capacite,
        },
      });

      await tx.user.create({
        data: {
          nom: donnees.adminNom,
          prenom: donnees.adminPrenom,
          email: donnees.adminEmail,
          telephone: donnees.adminTelephone,
          motDePasseHash,
          statut: "actif",
          roles: { create: [{ nom: "admin_etablissement" }] },
          professionnel: {
            create: {
              specialite: SPECIALITE_ADMINISTRATION,
              numeroProfessionnel: genererNumeroProfessionnelAdmin(),
              etablissementId: etablissement.id,
              statutValidation: "valide",
            },
          },
        },
      });

      await tx.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "creation",
          donneeConcernee: `etablissement:${etablissement.id}`,
          adresseTechnique,
          justification: "Creation d'etablissement et de son compte administrateur",
        },
      });
    });
  } catch (erreur) {
    if (estErreurContrainteUnique(erreur)) {
      return { error: "Un compte existe deja avec cet email.", success: false };
    }

    console.error("Erreur lors de la creation de l'etablissement :", erreur);
    return {
      error: "Une erreur est survenue lors de la creation. Veuillez reessayer.",
      success: false,
    };
  }

  return { error: null, success: true, motDePasseTemporaire };
}

/**
 * Liste le personnel (hors compte administrateur lui-meme) de l'etablissement
 * de l'appelant. Reserve au role admin_etablissement : l'etablissement est
 * deduit du ProfessionnelSante (specialite "Administration") rattache a
 * getSession().userId, jamais transmis par le client. Renvoie une liste vide
 * si l'appelant n'a pas ce role ou pas de ProfessionnelSante.
 */
export async function listPersonnelEtablissement(): Promise<MembrePersonnel[]> {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_etablissement")) {
    return [];
  }

  const adminProfil = await prisma.professionnelSante.findUnique({
    where: { userId: session.userId },
  });

  if (!adminProfil) {
    return [];
  }

  const personnel = await prisma.professionnelSante.findMany({
    where: {
      etablissementId: adminProfil.etablissementId,
      specialite: { not: SPECIALITE_ADMINISTRATION },
    },
    include: { user: { include: { roles: true } } },
    orderBy: { user: { nom: "asc" } },
  });

  return personnel.map((professionnel) => ({
    userId: professionnel.userId,
    nomComplet: `${professionnel.user.prenom} ${professionnel.user.nom}`,
    role: professionnel.user.roles.map((role) => role.nom).join(", "),
    specialite: professionnel.specialite,
    statutValidation: professionnel.statutValidation,
    email: professionnel.user.email,
  }));
}

/**
 * Cree un compte de personnel (medecin, infirmier, agent_communautaire,
 * pharmacien ou laboratoire) rattache a l'etablissement de l'appelant.
 * Reserve au role admin_etablissement, verifie ici (Zero Trust). Le
 * professionnel cree est directement "valide" : l'admin d'etablissement fait
 * foi de la validite du compte qu'il cree.
 */
export async function creerProfessionnelAction(
  prevState: GestionCompteActionState,
  formData: FormData
): Promise<GestionCompteActionState> {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_etablissement")) {
    return { error: "Action reservee aux administrateurs d'etablissement.", success: false };
  }

  const adminProfil = await prisma.professionnelSante.findUnique({
    where: { userId: session.userId },
  });

  if (!adminProfil) {
    return { error: "Action reservee aux administrateurs d'etablissement.", success: false };
  }

  const validation = schemaCreationProfessionnel.safeParse({
    nom: formData.get("nom"),
    prenom: formData.get("prenom"),
    email: formData.get("email"),
    telephone: formData.get("telephone"),
    role: formData.get("role"),
    specialite: formData.get("specialite"),
    numeroProfessionnel: formData.get("numeroProfessionnel"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de personnel invalides."),
      success: false,
    };
  }

  const donnees = validation.data;

  const [compteExistant, numeroExistant] = await Promise.all([
    prisma.user.findUnique({ where: { email: donnees.email } }),
    prisma.professionnelSante.findUnique({
      where: { numeroProfessionnel: donnees.numeroProfessionnel },
    }),
  ]);

  if (compteExistant) {
    return { error: "Un compte existe deja avec cet email.", success: false };
  }

  if (numeroExistant) {
    return { error: "Ce numero professionnel est deja utilise.", success: false };
  }

  const motDePasseTemporaire = genererMotDePasseTemporaire();

  try {
    const motDePasseHash = await bcrypt.hash(motDePasseTemporaire, ROUNDS_BCRYPT);
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      const nouvelUtilisateur = await tx.user.create({
        data: {
          nom: donnees.nom,
          prenom: donnees.prenom,
          email: donnees.email,
          telephone: donnees.telephone,
          motDePasseHash,
          statut: "actif",
          roles: { create: [{ nom: donnees.role }] },
        },
      });

      const professionnel = await tx.professionnelSante.create({
        data: {
          userId: nouvelUtilisateur.id,
          specialite: donnees.specialite,
          numeroProfessionnel: donnees.numeroProfessionnel,
          etablissementId: adminProfil.etablissementId,
          statutValidation: "valide",
        },
      });

      await tx.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "creation",
          donneeConcernee: `professionnel:${professionnel.id}`,
          adresseTechnique,
          justification: "Creation de compte professionnel par l'administrateur d'etablissement",
        },
      });
    });
  } catch (erreur) {
    if (estErreurContrainteUnique(erreur)) {
      return {
        error: "Un compte existe deja avec cet email ou ce numero professionnel.",
        success: false,
      };
    }

    console.error("Erreur lors de la creation du professionnel :", erreur);
    return {
      error: "Une erreur est survenue lors de la creation. Veuillez reessayer.",
      success: false,
    };
  }

  return { error: null, success: true, motDePasseTemporaire };
}

/**
 * Changement de mot de passe par l'utilisateur connecte lui-meme, quel que
 * soit son role. Verifie le mot de passe actuel avant toute modification.
 */
export async function changerMotDePasseAction(
  prevState: GestionCompteActionState,
  formData: FormData
): Promise<GestionCompteActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Vous devez etre connecte pour changer votre mot de passe.", success: false };
  }

  const validation = schemaChangementMotDePasse.safeParse({
    motDePasseActuel: formData.get("motDePasseActuel"),
    nouveauMotDePasse: formData.get("nouveauMotDePasse"),
    confirmationMotDePasse: formData.get("confirmationMotDePasse"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(
        validation.error,
        "Donnees de changement de mot de passe invalides."
      ),
      success: false,
    };
  }

  const { motDePasseActuel, nouveauMotDePasse } = validation.data;

  try {
    const utilisateur = await prisma.user.findUnique({ where: { id: session.userId } });

    if (!utilisateur) {
      return { error: "Compte introuvable.", success: false };
    }

    const motDePasseActuelValide = await bcrypt.compare(
      motDePasseActuel,
      utilisateur.motDePasseHash
    );

    if (!motDePasseActuelValide) {
      return { error: "Le mot de passe actuel est incorrect.", success: false };
    }

    const nouveauMotDePasseHash = await bcrypt.hash(nouveauMotDePasse, ROUNDS_BCRYPT);
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.userId },
        data: { motDePasseHash: nouveauMotDePasseHash },
      }),
      prisma.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "modification",
          donneeConcernee: `utilisateur:${session.userId}`,
          adresseTechnique,
          justification: "Changement de mot de passe",
        },
      }),
    ]);
  } catch (erreur) {
    console.error("Erreur lors du changement de mot de passe :", erreur);
    return {
      error: "Une erreur est survenue lors du changement de mot de passe. Veuillez reessayer.",
      success: false,
    };
  }

  return { error: null, success: true };
}
