/**
 * Gestion de la session d'authentification (Phase 2, etendu F-AUTH-09).
 *
 * La session est un JWT (jose, HS256) signe avec getEnv().NEXTAUTH_SECRET,
 * pose dans un cookie httpOnly nomme "session". Ce module est le seul point
 * d'ecriture/lecture de ce cookie : aucun autre fichier ne doit manipuler le
 * cookie "session" directement.
 *
 * Ne pas importer ce module depuis middleware.ts : le middleware tourne en
 * edge runtime et verifie le JWT lui-meme avec jose, sans dependre de
 * next/headers ni de getEnv(). Consequence acceptee (voir F-AUTH-09,
 * docs/coordination-agents.md) : une session fermee a distance reste
 * acceptee par le middleware (signature JWT toujours valide) mais est
 * rejetee par getSession() ci-dessous des la page suivante, qui redirige
 * alors vers /connexion (CA-1 du pack : "a sa requete suivante").
 *
 * F-AUTH-09 (gerer ses appareils et sessions) ajoute une table
 * `SessionActive` en base : chaque JWT emis embarque desormais un
 * `sessionId` correspondant a une ligne de cette table, ce qui permet de
 * fermer UNE session precise (suppression de sa ligne) sans invalider les
 * autres, contrairement a un simple compteur de version global. Retro-
 * compatibilite : un JWT emis avant ce changement (sans sessionId) reste
 * accepte tel quel (sessionId vide dans le payload retourne), simplement
 * non listable/fermable depuis /app/securite tant que l'utilisateur ne
 * s'est pas reconnecte.
 */

import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { nomCookieSession } from "@/lib/nom-cookie-session";
import { reglesDeSession, sessionExpiree } from "@/lib/regles-session";
import { rolesEffectifs } from "@/modules/identity/espaces-regles";
import type { NomRole } from "@/types";

/** Contenu utile encode dans le JWT de session. */
export interface SessionPayload {
  userId: string;
  /**
   * Roles appliques a la session. F-AUTH-07 : si l'utilisateur a choisi un
   * espace actif, c'est le seul role de ce tableau (lu en base, jamais
   * transmis par le navigateur, RG-AUTH-60) ; sinon tous les roles du compte.
   */
  roles: NomRole[];
  /** Id de la ligne SessionActive correspondante ; chaine vide pour un JWT emis avant F-AUTH-09 (retro-compatibilite, voir en-tete). */
  sessionId: string;
}

/** Session ouverte mais restreinte a l'activation du second facteur (F-AUTH-06, CA-1) : getSession() renvoie null tant qu'il n'est pas active. */
export interface SessionActivationMfa extends SessionPayload {
  activationMfaRequise: boolean;
}

/** Cle du drapeau qui rend le second facteur obligatoire pour tous les roles sauf patient (F-AUTH-06). */
const CLE_DRAPEAU_MFA_OBLIGATOIRE = "securite.mfa_obligatoire";

/** Throttle de la mise a jour de "derniere activite" : evite une ecriture en base a chaque navigation (precision de la limite d'inactivite : 1 minute). */
const INTERVALLE_MISE_A_JOUR_ACTIVITE_MS = 60 * 1000;

function cleSecrete(): Uint8Array {
  return new TextEncoder().encode(getEnv().NEXTAUTH_SECRET);
}

function estUnRoleValide(valeur: unknown): valeur is NomRole {
  return (
    typeof valeur === "string" &&
    [
      "patient",
      "medecin",
      "infirmier",
      "agent_communautaire",
      "pharmacien",
      "laboratoire",
      "admin_etablissement",
      "admin_national",
    ].includes(valeur)
  );
}

/** Heuristique simple a partir du User-Agent, aucune dependance externe. Limite assumee : pas de detection fine (modele d'appareil, version exacte), suffisant pour l'affichage informatif de F-AUTH-09. */
function analyserAppareil(userAgent: string): { appareil: string; navigateur: string } {
  let appareil = "Ordinateur";
  if (/iPad|Tablet/i.test(userAgent)) {
    appareil = "Tablette";
  } else if (/Mobile|Android|iPhone/i.test(userAgent)) {
    appareil = "Mobile";
  }

  let navigateur = "Autre";
  if (/Edg\//i.test(userAgent)) {
    navigateur = "Edge";
  } else if (/Firefox\//i.test(userAgent)) {
    navigateur = "Firefox";
  } else if (/Chrome\//i.test(userAgent)) {
    navigateur = "Chrome";
  } else if (/Safari\//i.test(userAgent)) {
    navigateur = "Safari";
  }

  return { appareil, navigateur };
}

async function contexteRequeteCourante(): Promise<{ userAgent: string; adresseIp: string }> {
  try {
    const listeEntetes = await headers();
    return {
      userAgent: listeEntetes.get("user-agent") ?? "inconnu",
      adresseIp: listeEntetes.get("x-forwarded-for")?.split(",")[0]?.trim() ?? listeEntetes.get("x-real-ip") ?? "inconnue",
    };
  } catch {
    return { userAgent: "inconnu", adresseIp: "inconnue" };
  }
}

/** Appareil et navigateur de la requete courante (User-Agent), pour l'affichage et la detection d'un nouvel appareil. */
export async function appareilCourant(): Promise<{ appareil: string; navigateur: string }> {
  const { userAgent } = await contexteRequeteCourante();
  return analyserAppareil(userAgent);
}

/**
 * Signe un JWT de session et le pose dans un cookie httpOnly. Cree aussi la
 * ligne SessionActive correspondante (F-AUTH-09), a partir du User-Agent et de
 * l'adresse IP de la requete courante. La duree maximale du JWT et la nature
 * du cookie suivent les regles du profil (regles-session.ts, F-AUTH-02) : sur
 * un appareil partage, le cookie disparait a la fermeture du navigateur.
 */
export async function createSession(payload: {
  userId: string;
  roles: NomRole[];
  appareilPartage?: boolean;
}): Promise<void> {
  const { userAgent, adresseIp } = await contexteRequeteCourante();
  const { appareil, navigateur } = analyserAppareil(userAgent);
  const appareilPartage = payload.appareilPartage === true;
  const regles = reglesDeSession(payload.roles, appareilPartage);

  const sessionActive = await prisma.sessionActive.create({
    data: { userId: payload.userId, appareil, navigateur, adresseIp, appareilPartage },
  });

  const jeton = await new SignJWT({ userId: payload.userId, roles: payload.roles, sessionId: sessionActive.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + regles.dureeMaxSecondes)
    .sign(cleSecrete());

  const magasinCookies = await cookies();
  magasinCookies.set(nomCookieSession(), jeton, {
    httpOnly: true,
    secure: getEnv().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(regles.cookiePersistant ? { maxAge: regles.dureeMaxSecondes } : {}),
  });
}

/**
 * Lit et verifie le cookie "session". Retourne la session s'il est present et
 * valide ET que la SessionActive correspondante existe toujours (pas fermee a
 * distance), sinon null, avec un indicateur d'activation obligatoire du second
 * facteur. Ne leve jamais d'exception. Memoise pour la duree d'une requete
 * (React cache) : plusieurs composants serveur peuvent l'appeler sans
 * multiplier les lectures en base.
 */
const lireSessionComplete = cache(async (): Promise<SessionActivationMfa | null> => {
  const magasinCookies = await cookies();
  const jeton = magasinCookies.get(nomCookieSession())?.value;

  if (!jeton) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(jeton, cleSecrete());
    const roles = Array.isArray(payload.roles) ? payload.roles.filter(estUnRoleValide) : [];

    if (typeof payload.userId !== "string" || roles.length === 0) {
      return null;
    }

    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";

    // Un compte qui n'est plus "actif" (suspendu, fin d'affiliation, ferme,
    // fusionne) perd son acces a la requete suivante, sans attendre
    // l'expiration du JWT : la signature seule ne dit rien de l'etat du compte.
    let statutCompte: string | undefined;
    let mfaActif = false;
    let espaceChoisi: string | null = null;

    if (sessionId) {
      const sessionActive = await prisma.sessionActive.findUnique({
        where: { id: sessionId },
        include: { user: { select: { statut: true, mfaActif: true } } },
      });
      if (!sessionActive || sessionActive.userId !== payload.userId) {
        return null;
      }
      // F-AUTH-02 : duree maximale et inactivite selon le profil (regles-session.ts).
      if (
        sessionExpiree({
          creeeLe: sessionActive.dateCreation,
          derniereActivite: sessionActive.derniereActivite,
          roles,
          appareilPartage: sessionActive.appareilPartage,
        })
      ) {
        await prisma.sessionActive.delete({ where: { id: sessionId } }).catch(() => {});
        return null;
      }
      statutCompte = sessionActive.user.statut;
      mfaActif = sessionActive.user.mfaActif;
      espaceChoisi = sessionActive.espaceActif;
      if (Date.now() - sessionActive.derniereActivite.getTime() > INTERVALLE_MISE_A_JOUR_ACTIVITE_MS) {
        await prisma.sessionActive
          .update({ where: { id: sessionId }, data: { derniereActivite: new Date() } })
          .catch(() => {});
      }
    } else {
      const utilisateur = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { statut: true, mfaActif: true },
      });
      statutCompte = utilisateur?.statut;
      mfaActif = utilisateur?.mfaActif ?? false;
    }

    if (statutCompte !== "actif") {
      return null;
    }

    // F-AUTH-06 (CA-1) : un compte non patient sans second facteur ne peut rien
    // faire d'autre que l'activer, quand le drapeau est actif. La lecture du
    // drapeau n'a lieu que pour ces comptes.
    let activationMfaRequise = false;

    if (!mfaActif && roles.some((role) => role !== "patient")) {
      const drapeau = await prisma.fonctionnaliteActivable.findUnique({
        where: { cle: CLE_DRAPEAU_MFA_OBLIGATOIRE },
        select: { actif: true },
      });
      activationMfaRequise = drapeau?.actif === true;
    }

    const rolesAppliques = rolesEffectifs(roles, espaceChoisi);

    return { userId: payload.userId, roles: rolesAppliques, sessionId, activationMfaRequise };
  } catch {
    return null;
  }
});

/** Session complete : null si absente, invalide, ou restreinte a l'activation du second facteur. */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const session = await lireSessionComplete();

  if (!session || session.activationMfaRequise) {
    return null;
  }

  return { userId: session.userId, roles: session.roles, sessionId: session.sessionId };
});

/**
 * Session valide, y compris celle qui ne peut qu'activer son second facteur.
 * Reservee a l'ecran et aux actions d'activation (F-AUTH-06) : tout le reste
 * de l'application passe par getSession().
 */
export const getSessionPourActivationMfa = lireSessionComplete;

/** Supprime le cookie "session" (deconnexion) et la SessionActive correspondante. */
export async function destroySession(): Promise<void> {
  const magasinCookies = await cookies();
  const jeton = magasinCookies.get(nomCookieSession())?.value;
  magasinCookies.delete(nomCookieSession());

  if (!jeton) return;

  try {
    const { payload } = await jwtVerify(jeton, cleSecrete());
    if (typeof payload.sessionId === "string" && payload.sessionId) {
      await prisma.sessionActive.delete({ where: { id: payload.sessionId } }).catch(() => {});
    }
  } catch {
    // Jeton deja invalide : rien de plus a nettoyer en base.
  }
}
