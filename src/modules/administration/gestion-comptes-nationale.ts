"use server";

/**
 * Gestion nationale des comptes (F-ADM-05 du pack, volet plateforme) :
 * recherche, fiche, suspension, reactivation, reinitialisation du second
 * facteur, invitation d'un administrateur. Reserve a admin_national, par une
 * permission dediee (`compte_plateforme`) verifiee AVANT toute lecture ou
 * ecriture. Jamais de donnee medicale, jamais de hash de mot de passe ni de
 * secret TOTP renvoyes.
 *
 * RG-ADM-30 (quatre yeux) : toute action sur un compte administrateur, et toute
 * invitation d'administrateur, est enregistree "en attente" et ne s'execute
 * qu'apres approbation par un AUTRE administrateur (table
 * ActionAdministrateurEnAttente, validite 72 h). Les gardes (pas sur son
 * propre compte, pas le dernier administrateur actif, statuts coherents) sont
 * dans gestion-comptes-nationale-regles.ts et rejoues a l'approbation.
 *
 * Une suspension ferme toutes les sessions du compte (SessionActive) et
 * getSession() relit le statut a chaque requete : effet immediat. Meme
 * mecanisme que la suspension d'un membre du personnel (F-ETA-04) et que le
 * refus d'un professionnel (F-ADM-03).
 *
 * Limites assumees : pas de role auditeur distinct (rattache a admin_national,
 * l'invitation cree un compte admin_national) ; le mot de passe temporaire
 * d'un administrateur invite est montre une fois a l'approbateur, sans
 * changement force a la premiere connexion ; les affiliations ne sont pas
 * modifiees par une suspension nationale (le statut du compte suffit a bloquer
 * tout acces).
 */

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { journaliser } from "@/modules/audit/journaliser";
import { supprimerCodesSecours } from "@/modules/identity/codes-secours-mfa";
import { emettreInvitation, envoyerInvitation } from "@/modules/identity/invitations";
import { creerNotification } from "@/modules/notification/creer";
import { normaliserNumeroOrdre } from "@/modules/identity/identite-professionnelle";
import {
  DUREE_VALIDITE_DEMANDE_HEURES,
  LIBELLES_TYPE_ACTION,
  ROLE_ADMINISTRATEUR,
  exigeDoubleValidation,
  verifierActionSurCompte,
  verifierDecisionSurDemande,
  verifierRenvoiInvitation,
  type ContexteCible,
  type TypeActionCompte,
} from "./gestion-comptes-nationale-regles";

const ROUNDS_BCRYPT = 12;
const RESULTATS_MAX = 25;

class ErreurMetier extends Error {}

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

type SessionComptePlateforme = Awaited<ReturnType<typeof getSessionComptePlateforme>>;

/** Session de l'appelant si son role detient la permission dediee sur cette action, sinon null. Aucune lecture avant ce controle. */
async function getSessionComptePlateforme(action: "read" | "create" | "update") {
  const session = await getSession();
  if (!session || !session.roles.some((role) => can(role, action, "compte_plateforme"))) {
    return null;
  }
  return session;
}

export interface CompteRecherche {
  id: string;
  nomComplet: string;
  email: string;
  telephone: string;
  roles: string[];
  statut: string;
  mfaActif: boolean;
  etablissementNom: string | null;
  profession: string | null;
  numeroOrdre: string | null;
}

export interface FicheCompte extends CompteRecherche {
  derniereConnexion: string | null;
  statutValidationProfessionnel: string | null;
  sessionsActives: { appareil: string; navigateur: string; derniereActivite: string }[];
  affiliations: { etablissementNom: string; roleNom: string; statut: string }[];
  dernieresConnexions: string[];
  actionEnAttente: boolean;
  estAdministrateur: boolean;
}

export interface ActionEnAttenteResume {
  id: string;
  type: TypeActionCompte;
  libelleType: string;
  cibleNomComplet: string | null;
  demandePar: string;
  motif: string;
  dateDemande: string;
  expireLe: string;
  estDemandeParMoi: boolean;
}

export interface GestionComptesNationaleState {
  error: string | null;
  success: boolean;
  /** Vrai quand l'action n'est pas executee mais enregistree, en attente d'un second administrateur. */
  enAttente?: boolean;
  /** Adresse a laquelle l'invitation d'activation a ete envoyee (F-AUTH-05 : plus de mot de passe temporaire). */
  invitationEnvoyeeA?: string;
  /** Lien d'activation, montre uniquement hors production ou pour un compte de demonstration. */
  lienInvitation?: string;
  /** Le compte est cree mais l'e-mail n'a pas pu partir : renvoyer l'invitation depuis la fiche du compte. */
  invitationNonEnvoyee?: boolean;
}

const SELECTION_COMPTE = {
  id: true,
  nom: true,
  prenom: true,
  email: true,
  telephone: true,
  statut: true,
  mfaActif: true,
  roles: { select: { nom: true } },
  professionnel: {
    select: {
      profession: true,
      numeroOrdre: true,
      statutValidation: true,
      etablissement: { select: { nom: true } },
    },
  },
} satisfies Prisma.UserSelect;

type CompteBrut = Prisma.UserGetPayload<{ select: typeof SELECTION_COMPTE }>;

function versCompteRecherche(compte: CompteBrut): CompteRecherche {
  return {
    id: compte.id,
    nomComplet: `${compte.prenom} ${compte.nom}`,
    email: compte.email,
    telephone: compte.telephone,
    roles: compte.roles.map((role) => role.nom),
    statut: compte.statut,
    mfaActif: compte.mfaActif,
    etablissementNom: compte.professionnel?.etablissement.nom ?? null,
    profession: compte.professionnel?.profession ?? null,
    numeroOrdre: compte.professionnel?.numeroOrdre ?? null,
  };
}

/**
 * Recherche de comptes : telephone ou e-mail exacts, numero d'Ordre exact, ou
 * nom (contient). Trois caracteres minimum, 25 resultats au plus. Null si
 * l'appelant n'a pas la permission. Le terme cherche n'est jamais ecrit au
 * journal (donnee personnelle), seul le nombre de resultats l'est.
 */
export async function rechercherComptesNationaux(critere: string): Promise<CompteRecherche[] | null> {
  const session = await getSessionComptePlateforme("read");
  if (!session) return null;

  const terme = critere.trim();
  if (terme.length < 3) return [];

  const ordre = normaliserNumeroOrdre(terme);
  const comptes = await prisma.user.findMany({
    where: {
      OR: [
        { email: { equals: terme, mode: "insensitive" } },
        { telephone: terme },
        { nom: { contains: terme, mode: "insensitive" } },
        { prenom: { contains: terme, mode: "insensitive" } },
        ...(ordre ? [{ professionnel: { numeroOrdre: ordre } }] : []),
      ],
    },
    select: SELECTION_COMPTE,
    orderBy: { nom: "asc" },
    take: RESULTATS_MAX,
  });

  await journaliser({
    utilisateurId: session.userId,
    action: "recherche_compte_plateforme",
    donneeConcernee: "compte_plateforme",
    adresseTechnique: await adresseTechniqueCourante(),
    justification: `Recherche de comptes (terme de ${terme.length} caracteres) : ${comptes.length} resultat(s).`,
  });

  return comptes.map(versCompteRecherche);
}

/** Fiche d'un compte : identite, roles, affiliations, sessions, second facteur, dernieres connexions. Sans aucune donnee medicale. */
export async function getFicheCompteNational(userId: string): Promise<FicheCompte | null> {
  const session = await getSessionComptePlateforme("read");
  if (!session || !userId) return null;

  const compte = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...SELECTION_COMPTE,
      derniereConnexion: true,
      sessionsActives: {
        select: { appareil: true, navigateur: true, derniereActivite: true },
        orderBy: { derniereActivite: "desc" },
        take: 10,
      },
      professionnel: {
        select: {
          profession: true,
          numeroOrdre: true,
          statutValidation: true,
          etablissement: { select: { nom: true } },
          affiliations: {
            select: { roleNom: true, statut: true, etablissement: { select: { nom: true } } },
            orderBy: { dateDebut: "desc" },
          },
        },
      },
    },
  });
  if (!compte) return null;

  const [connexions, enAttente] = await Promise.all([
    prisma.journalAudit.findMany({
      where: { utilisateurId: compte.id, action: "connexion" },
      orderBy: { date: "desc" },
      take: 5,
      select: { date: true },
    }),
    prisma.actionAdministrateurEnAttente.count({
      where: { cibleUserId: compte.id, statut: "en_attente", expireLe: { gt: new Date() } },
    }),
  ]);

  await journaliser({
    utilisateurId: session.userId,
    action: "consultation_fiche_compte_plateforme",
    donneeConcernee: `utilisateur:${compte.id}`,
    adresseTechnique: await adresseTechniqueCourante(),
    justification: "Consultation de la fiche d'un compte par l'administration nationale (F-ADM-05).",
  });

  return {
    ...versCompteRecherche(compte),
    derniereConnexion: compte.derniereConnexion ? compte.derniereConnexion.toISOString() : null,
    statutValidationProfessionnel: compte.professionnel?.statutValidation ?? null,
    sessionsActives: compte.sessionsActives.map((ligne) => ({
      appareil: ligne.appareil,
      navigateur: ligne.navigateur,
      derniereActivite: ligne.derniereActivite.toISOString(),
    })),
    affiliations: (compte.professionnel?.affiliations ?? []).map((affiliation) => ({
      etablissementNom: affiliation.etablissement.nom,
      roleNom: affiliation.roleNom,
      statut: affiliation.statut,
    })),
    dernieresConnexions: connexions.map((ligne) => ligne.date.toISOString()),
    actionEnAttente: enAttente > 0,
    estAdministrateur: compte.roles.some((role) => role.nom === ROLE_ADMINISTRATEUR),
  };
}

const schemaMotif = z.object({
  userId: z.string().trim().min(1, "Le compte est obligatoire."),
  motif: z.string().trim().min(10, "Le motif doit comporter au moins 10 caracteres.").max(500, "500 caracteres maximum."),
});

const schemaInvitation = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire.").max(100),
  prenom: z.string().trim().min(1, "Le prenom est obligatoire.").max(100),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide."),
  telephone: z.string().trim().min(8, "Le telephone est obligatoire.").max(30),
  motif: z.string().trim().min(10, "Le motif doit comporter au moins 10 caracteres.").max(500, "500 caracteres maximum."),
});

const schemaDecision = z.object({
  actionId: z.string().trim().min(1, "La demande est obligatoire."),
  motif: z.string().trim().max(500, "500 caracteres maximum.").optional().default(""),
});

async function chargerContexteCible(userId: string): Promise<ContexteCible | null> {
  const compte = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      statut: true,
      mfaActif: true,
      roles: { select: { nom: true } },
      professionnel: { select: { statutValidation: true } },
    },
  });
  if (!compte) return null;
  return {
    id: compte.id,
    roles: compte.roles.map((role) => role.nom),
    statut: compte.statut,
    mfaActif: compte.mfaActif,
    statutValidationProfessionnel: compte.professionnel?.statutValidation ?? null,
  };
}

function compterAdministrateursActifsAutres(cibleId: string): Promise<number> {
  return prisma.user.count({
    where: { id: { not: cibleId }, statut: "actif", roles: { some: { nom: ROLE_ADMINISTRATEUR } } },
  });
}

/** Mot de passe inutilisable : le compte reste "invite" jusqu'a ce que la personne choisisse le sien (F-AUTH-05). */
async function motDePasseInutilisableHache(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString("hex"), ROUNDS_BCRYPT);
}

/** Invitation a envoyer apres la validation de la transaction (jamais un e-mail pour une action annulee, RG-NOT-03). */
interface InvitationAEnvoyer {
  jeton: string;
  email: string;
  prenom: string;
}

interface ParametresAction {
  motif: string;
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
}

/**
 * Execute reellement l'action, dans la transaction de l'appelant. Ne verifie
 * PAS les gardes (fait par l'appelant, avant). Toute ecriture est
 * conditionnelle (statut attendu) : si le compte a change entre-temps,
 * l'action est refusee plutot qu'appliquee a un etat inattendu.
 */
async function executerAction(
  tx: Prisma.TransactionClient,
  params: {
    type: TypeActionCompte;
    cibleUserId: string | null;
    parametres: ParametresAction;
    acteurId: string;
    confirmeParSecondAdmin: boolean;
    adresseTechnique: string;
  }
): Promise<{ invitation?: InvitationAEnvoyer }> {
  const { type, cibleUserId, parametres, acteurId, confirmeParSecondAdmin, adresseTechnique } = params;
  const suffixe = confirmeParSecondAdmin ? " (confirmee par un second administrateur, RG-ADM-30)" : "";

  if (type === "suspension" && cibleUserId) {
    const modifies = await tx.user.updateMany({ where: { id: cibleUserId, statut: "actif" }, data: { statut: "suspendu" } });
    if (modifies.count !== 1) throw new ErreurMetier("Ce compte n'est plus actif : suspension impossible.");
    await tx.sessionActive.deleteMany({ where: { userId: cibleUserId } });
    await journaliser(
      {
        utilisateurId: acteurId,
        action: "suspension_compte_plateforme",
        donneeConcernee: `utilisateur:${cibleUserId}`,
        adresseTechnique,
        justification: `Compte suspendu, sessions fermees. Motif : ${parametres.motif}${suffixe}`,
      },
      tx
    );
    return {};
  }

  if (type === "reactivation" && cibleUserId) {
    const modifies = await tx.user.updateMany({ where: { id: cibleUserId, statut: "suspendu" }, data: { statut: "actif" } });
    if (modifies.count !== 1) throw new ErreurMetier("Ce compte n'est plus suspendu : reactivation impossible.");
    await journaliser(
      {
        utilisateurId: acteurId,
        action: "reactivation_compte_plateforme",
        donneeConcernee: `utilisateur:${cibleUserId}`,
        adresseTechnique,
        justification: `Compte reactive. Motif : ${parametres.motif}${suffixe}`,
      },
      tx
    );
    return {};
  }

  if (type === "reinitialisation_2fa" && cibleUserId) {
    const modifies = await tx.user.updateMany({
      where: { id: cibleUserId, mfaActif: true },
      data: { mfaSecret: null, mfaActif: false },
    });
    if (modifies.count !== 1) throw new ErreurMetier("Ce compte n'a plus de second facteur actif.");
    await supprimerCodesSecours(tx, cibleUserId);
    await tx.sessionActive.deleteMany({ where: { userId: cibleUserId } });
    await journaliser(
      {
        utilisateurId: acteurId,
        action: "reinitialisation_2fa_plateforme",
        donneeConcernee: `utilisateur:${cibleUserId}`,
        adresseTechnique,
        justification: `Second facteur reinitialise, sessions fermees (identite verifiee par appel ou en presentiel). Motif : ${parametres.motif}${suffixe}`,
      },
      tx
    );
    return {};
  }

  if (type === "invitation_admin" && parametres.email && parametres.nom && parametres.prenom && parametres.telephone) {
    const existant = await tx.user.findUnique({ where: { email: parametres.email }, select: { id: true } });
    if (existant) throw new ErreurMetier("Cette adresse e-mail est deja utilisee par un autre compte.");

    const cree = await tx.user.create({
      data: {
        nom: parametres.nom,
        prenom: parametres.prenom,
        email: parametres.email,
        telephone: parametres.telephone,
        motDePasseHash: await motDePasseInutilisableHache(),
        statut: "invite",
        roles: { create: { nom: ROLE_ADMINISTRATEUR } },
      },
      select: { id: true },
    });
    await journaliser(
      {
        utilisateurId: acteurId,
        action: "invitation_admin_plateforme",
        donneeConcernee: `utilisateur:${cree.id}`,
        adresseTechnique,
        justification: `Compte administrateur national cree au statut invite, invitation d'activation emise. Motif : ${parametres.motif}${suffixe}`,
      },
      tx
    );
    // Le jeton n'est jamais journalise ni stocke en clair : il ne sert qu'a l'e-mail d'invitation.
    const { jeton } = await emettreInvitation(tx, { userId: cree.id, creeParId: acteurId });
    return { invitation: { jeton, email: parametres.email, prenom: parametres.prenom } };
  }

  throw new ErreurMetier("Action inconnue ou incomplete.");
}

/** Notification de la personne concernee, apres le commit (une notification manquee ne defait pas l'action). */
async function notifierApresAction(type: TypeActionCompte, cibleUserId: string | null): Promise<void> {
  if (type === "reinitialisation_2fa" && cibleUserId) {
    await creerNotification(
      cibleUserId,
      "second_facteur_reinitialise",
      "Le second facteur de votre compte a ete reinitialise par un administrateur. Vous devrez le configurer de nouveau.",
      "/app/securite",
      { codeCatalogue: "N-2FA-RESET" }
    );
  }
}

/**
 * Point commun des trois actions sur un compte existant : permission, saisie,
 * gardes, puis execution directe ou enregistrement d'une demande en attente
 * (RG-ADM-30).
 */
async function demanderOuExecuterActionSurCompte(
  type: Exclude<TypeActionCompte, "invitation_admin">,
  formData: FormData,
  session: SessionComptePlateforme
): Promise<GestionComptesNationaleState> {
  if (!session) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaMotif.safeParse({ userId: formData.get("userId"), motif: formData.get("motif") });
  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }
  const { userId, motif } = validation.data;

  if (type === "reinitialisation_2fa" && !formData.get("identiteVerifiee")) {
    return {
      error: "Confirmez que l'identite de la personne a ete verifiee par appel ou en presentiel avant de reinitialiser son second facteur.",
      success: false,
    };
  }

  try {
    const cible = await chargerContexteCible(userId);
    if (!cible) return { error: "Compte introuvable.", success: false };

    const erreurGarde = verifierActionSurCompte({
      type,
      acteurId: session.userId,
      cible,
      nombreAdminsActifsAutres: await compterAdministrateursActifsAutres(cible.id),
    });
    if (erreurGarde) return { error: erreurGarde, success: false };

    const adresseTechnique = await adresseTechniqueCourante();

    if (exigeDoubleValidation(type, cible)) {
      const doublon = await prisma.actionAdministrateurEnAttente.count({
        where: { type, cibleUserId: cible.id, statut: "en_attente", expireLe: { gt: new Date() } },
      });
      if (doublon > 0) {
        return { error: "Une demande identique est deja en attente de confirmation.", success: false };
      }

      const expireLe = new Date(Date.now() + DUREE_VALIDITE_DEMANDE_HEURES * 60 * 60 * 1000);
      await prisma.$transaction(async (tx) => {
        const demande = await tx.actionAdministrateurEnAttente.create({
          data: { type, cibleUserId: cible.id, parametres: { motif }, demandeParId: session.userId, expireLe },
          select: { id: true },
        });
        await journaliser(
          {
            utilisateurId: session.userId,
            action: "demande_action_admin_plateforme",
            donneeConcernee: `utilisateur:${cible.id}`,
            adresseTechnique,
            justification: `${LIBELLES_TYPE_ACTION[type]} demandee sur un compte administrateur, en attente d'un second administrateur (demande ${demande.id}). Motif : ${motif}`,
          },
          tx
        );
      });
      return { error: null, success: true, enAttente: true };
    }

    await prisma.$transaction((tx) =>
      executerAction(tx, {
        type,
        cibleUserId: cible.id,
        parametres: { motif },
        acteurId: session.userId,
        confirmeParSecondAdmin: false,
        adresseTechnique,
      })
    );
    await notifierApresAction(type, cible.id);
    return { error: null, success: true };
  } catch (erreur) {
    if (erreur instanceof ErreurMetier) return { error: erreur.message, success: false };
    console.error("Erreur lors de l'action sur un compte :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

/** Suspend un compte (motif obligatoire) : effet immediat, sessions fermees. Sur un administrateur : demande en attente d'un second administrateur. */
export async function suspendreCompteAction(
  prevState: GestionComptesNationaleState,
  formData: FormData
): Promise<GestionComptesNationaleState> {
  const session = await getSessionComptePlateforme("update");
  return demanderOuExecuterActionSurCompte("suspension", formData, session);
}

/** Reactive un compte suspendu. Sur un administrateur : demande en attente d'un second administrateur. */
export async function reactiverCompteAction(
  prevState: GestionComptesNationaleState,
  formData: FormData
): Promise<GestionComptesNationaleState> {
  const session = await getSessionComptePlateforme("update");
  return demanderOuExecuterActionSurCompte("reactivation", formData, session);
}

/** Reinitialise le second facteur d'un compte (identite verifiee, motif, notification). Sur un administrateur : demande en attente. */
export async function reinitialiserSecondFacteurAction(
  prevState: GestionComptesNationaleState,
  formData: FormData
): Promise<GestionComptesNationaleState> {
  const session = await getSessionComptePlateforme("update");
  return demanderOuExecuterActionSurCompte("reinitialisation_2fa", formData, session);
}

/**
 * Envoie l'invitation d'activation d'un administrateur national. Le compte existe
 * deja (statut "invite") meme si l'envoi echoue : l'invitation peut alors etre
 * renvoyee depuis la fiche du compte.
 */
async function envoyerInvitationAdministrateur(invitation: InvitationAEnvoyer): Promise<Pick<GestionComptesNationaleState, "invitationEnvoyeeA" | "lienInvitation" | "invitationNonEnvoyee">> {
  try {
    const { lienAffichable } = await envoyerInvitation({
      email: invitation.email,
      prenom: invitation.prenom,
      etablissement: null,
      role: "administrateur national",
      jeton: invitation.jeton,
    });
    return { invitationEnvoyeeA: invitation.email, lienInvitation: lienAffichable ?? undefined };
  } catch (erreur) {
    console.error("Envoi de l'invitation impossible :", erreur);
    return { invitationNonEnvoyee: true };
  }
}

/**
 * Renvoie l'invitation d'un compte qui ne l'a pas encore activee (F-AUTH-05) : la
 * precedente est annulee. L'adresse e-mail ne change pas, donc pas de second
 * administrateur ; l'action est journalisee.
 */
export async function renvoyerInvitationCompteAction(
  prevState: GestionComptesNationaleState,
  formData: FormData
): Promise<GestionComptesNationaleState> {
  const session = await getSessionComptePlateforme("update");
  if (!session) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const userId = formData.get("userId");
  if (typeof userId !== "string" || userId.trim().length === 0) {
    return { error: "Le compte est obligatoire.", success: false };
  }

  try {
    const compte = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        prenom: true,
        email: true,
        statut: true,
        roles: { select: { nom: true } },
        professionnel: { select: { etablissement: { select: { nom: true } } } },
      },
    });
    if (!compte) return { error: "Compte introuvable.", success: false };

    const erreurGarde = verifierRenvoiInvitation({ acteurId: session.userId, cible: compte });
    if (erreurGarde) return { error: erreurGarde, success: false };

    const adresseTechnique = await adresseTechniqueCourante();
    const { jeton } = await prisma.$transaction(async (tx) => {
      const invitation = await emettreInvitation(tx, { userId: compte.id, creeParId: session.userId });
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "renvoi_invitation_compte_plateforme",
          donneeConcernee: "utilisateur:" + compte.id,
          adresseTechnique,
          justification: "Invitation d'activation renvoyee, la precedente est annulee.",
        },
        tx
      );
      return invitation;
    });

    try {
      const { lienAffichable } = await envoyerInvitation({
        email: compte.email,
        prenom: compte.prenom,
        etablissement: compte.professionnel?.etablissement.nom ?? null,
        role: compte.roles[0]?.nom ?? "utilisateur",
        jeton,
      });
      return { error: null, success: true, invitationEnvoyeeA: compte.email, lienInvitation: lienAffichable ?? undefined };
    } catch (erreur) {
      console.error("Envoi de l'invitation impossible :", erreur);
      return { error: "L'invitation a ete renouvelee mais l'e-mail n'a pas pu partir. Reessayez dans un instant.", success: false };
    }
  } catch (erreur) {
    console.error("Erreur lors du renvoi d'une invitation :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

/** Demande l'invitation d'un administrateur national : toujours en attente d'un second administrateur (RG-ADM-30). */
export async function inviterAdministrateurAction(
  prevState: GestionComptesNationaleState,
  formData: FormData
): Promise<GestionComptesNationaleState> {
  const session = await getSessionComptePlateforme("create");
  if (!session) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaInvitation.safeParse({
    nom: formData.get("nom"),
    prenom: formData.get("prenom"),
    email: formData.get("email"),
    telephone: formData.get("telephone"),
    motif: formData.get("motif"),
  });
  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }
  const invitation = validation.data;

  try {
    if (await prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true } })) {
      return { error: "Cette adresse e-mail est deja utilisee par un autre compte.", success: false };
    }

    const doublon = await prisma.actionAdministrateurEnAttente.count({
      where: { type: "invitation_admin", statut: "en_attente", expireLe: { gt: new Date() }, parametres: { path: ["email"], equals: invitation.email } },
    });
    if (doublon > 0) {
      return { error: "Une invitation pour cette adresse est deja en attente de confirmation.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const expireLe = new Date(Date.now() + DUREE_VALIDITE_DEMANDE_HEURES * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      const demande = await tx.actionAdministrateurEnAttente.create({
        data: { type: "invitation_admin", cibleUserId: null, parametres: invitation, demandeParId: session.userId, expireLe },
        select: { id: true },
      });
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "demande_action_admin_plateforme",
          donneeConcernee: `demande:${demande.id}`,
          adresseTechnique,
          justification: `Invitation d'un administrateur national demandee, en attente d'un second administrateur. Motif : ${invitation.motif}`,
        },
        tx
      );
    });

    return { error: null, success: true, enAttente: true };
  } catch (erreur) {
    console.error("Erreur lors de la demande d'invitation :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

/** Demandes en attente de confirmation par un second administrateur (non expirees, la plus ancienne d'abord). */
export async function getActionsEnAttente(): Promise<ActionEnAttenteResume[] | null> {
  const session = await getSessionComptePlateforme("read");
  if (!session) return null;

  const demandes = await prisma.actionAdministrateurEnAttente.findMany({
    where: { statut: "en_attente", expireLe: { gt: new Date() } },
    orderBy: { dateDemande: "asc" },
  });
  if (demandes.length === 0) return [];

  const idsUtilisateurs = [...new Set(demandes.flatMap((demande) => [demande.demandeParId, demande.cibleUserId].filter((id): id is string => id !== null)))];
  const utilisateurs = await prisma.user.findMany({
    where: { id: { in: idsUtilisateurs } },
    select: { id: true, nom: true, prenom: true },
  });
  const nomComplet = new Map(utilisateurs.map((utilisateur) => [utilisateur.id, `${utilisateur.prenom} ${utilisateur.nom}`]));

  return demandes.map((demande) => {
    const type = demande.type as TypeActionCompte;
    const parametres = demande.parametres as unknown as ParametresAction;
    return {
      id: demande.id,
      type,
      libelleType: LIBELLES_TYPE_ACTION[type] ?? demande.type,
      cibleNomComplet:
        demande.cibleUserId !== null
          ? (nomComplet.get(demande.cibleUserId) ?? null)
          : parametres.prenom && parametres.nom
            ? `${parametres.prenom} ${parametres.nom} (nouveau compte)`
            : null,
      demandePar: nomComplet.get(demande.demandeParId) ?? "Administrateur",
      motif: parametres.motif ?? "",
      dateDemande: demande.dateDemande.toISOString(),
      expireLe: demande.expireLe.toISOString(),
      estDemandeParMoi: demande.demandeParId === session.userId,
    };
  });
}

/** Approuve une demande en attente : un AUTRE administrateur que le demandeur, gardes rejoues, execution atomique. */
export async function approuverActionEnAttenteAction(
  prevState: GestionComptesNationaleState,
  formData: FormData
): Promise<GestionComptesNationaleState> {
  const session = await getSessionComptePlateforme("update");
  if (!session) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaDecision.safeParse({ actionId: formData.get("actionId"), motif: formData.get("motif") ?? undefined });
  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  try {
    const demande = await prisma.actionAdministrateurEnAttente.findUnique({ where: { id: validation.data.actionId } });
    if (!demande) return { error: "Demande introuvable.", success: false };

    const erreurDecision = verifierDecisionSurDemande({
      statut: demande.statut,
      demandeParId: demande.demandeParId,
      decideurId: session.userId,
      expireLe: demande.expireLe,
      maintenant: new Date(),
    });
    if (erreurDecision) return { error: erreurDecision, success: false };

    const type = demande.type as TypeActionCompte;

    // Les gardes sont rejoues a l'approbation : le compte a pu changer depuis la demande.
    if (type !== "invitation_admin") {
      const cible = demande.cibleUserId ? await chargerContexteCible(demande.cibleUserId) : null;
      if (!cible) return { error: "Le compte vise n'existe plus.", success: false };
      const erreurGarde = verifierActionSurCompte({
        type,
        acteurId: session.userId,
        cible,
        nombreAdminsActifsAutres: await compterAdministrateursActifsAutres(cible.id),
      });
      if (erreurGarde) return { error: erreurGarde, success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    const resultat = await prisma.$transaction(async (tx) => {
      const reclamation = await tx.actionAdministrateurEnAttente.updateMany({
        where: { id: demande.id, statut: "en_attente" },
        data: { statut: "approuvee", decideParId: session.userId, dateDecision: new Date() },
      });
      if (reclamation.count !== 1) throw new ErreurMetier("Cette demande a deja ete traitee.");

      const execution = await executerAction(tx, {
        type,
        cibleUserId: demande.cibleUserId,
        parametres: demande.parametres as unknown as ParametresAction,
        acteurId: session.userId,
        confirmeParSecondAdmin: true,
        adresseTechnique,
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "approbation_action_admin_plateforme",
          donneeConcernee: `demande:${demande.id}`,
          adresseTechnique,
          justification: `${LIBELLES_TYPE_ACTION[type]} approuvee (demandee par ${demande.demandeParId}).`,
        },
        tx
      );
      return execution;
    });

    await notifierApresAction(type, demande.cibleUserId);
    if (resultat.invitation) {
      return { ...(await envoyerInvitationAdministrateur(resultat.invitation)), error: null, success: true };
    }
    return { error: null, success: true };
  } catch (erreur) {
    if (erreur instanceof ErreurMetier) return { error: erreur.message, success: false };
    console.error("Erreur lors de l'approbation d'une demande :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

/** Refuse une demande en attente (un AUTRE administrateur que le demandeur) : rien n'est execute. */
export async function refuserActionEnAttenteAction(
  prevState: GestionComptesNationaleState,
  formData: FormData
): Promise<GestionComptesNationaleState> {
  const session = await getSessionComptePlateforme("update");
  if (!session) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaDecision.safeParse({ actionId: formData.get("actionId"), motif: formData.get("motif") ?? undefined });
  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }
  if (validation.data.motif.length < 5) {
    return { error: "Le motif du refus doit comporter au moins 5 caracteres.", success: false };
  }

  try {
    const demande = await prisma.actionAdministrateurEnAttente.findUnique({ where: { id: validation.data.actionId } });
    if (!demande) return { error: "Demande introuvable.", success: false };

    const erreurDecision = verifierDecisionSurDemande({
      statut: demande.statut,
      demandeParId: demande.demandeParId,
      decideurId: session.userId,
      expireLe: demande.expireLe,
      maintenant: new Date(),
    });
    if (erreurDecision) return { error: erreurDecision, success: false };

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      const reclamation = await tx.actionAdministrateurEnAttente.updateMany({
        where: { id: demande.id, statut: "en_attente" },
        data: { statut: "refusee", decideParId: session.userId, dateDecision: new Date(), motifDecision: validation.data.motif },
      });
      if (reclamation.count !== 1) throw new ErreurMetier("Cette demande a deja ete traitee.");

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "refus_action_admin_plateforme",
          donneeConcernee: `demande:${demande.id}`,
          adresseTechnique,
          justification: `${LIBELLES_TYPE_ACTION[demande.type as TypeActionCompte] ?? demande.type} refusee. Motif : ${validation.data.motif}`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    if (erreur instanceof ErreurMetier) return { error: erreur.message, success: false };
    console.error("Erreur lors du refus d'une demande :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
