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
import type { NomRole } from "@/types";

/** Contenu utile encode dans le JWT de session. */
export interface SessionPayload {
  userId: string;
  roles: NomRole[];
  /** Id de la ligne SessionActive correspondante ; chaine vide pour un JWT emis avant F-AUTH-09 (retro-compatibilite, voir en-tete). */
  sessionId: string;
}

const NOM_COOKIE_SESSION = "session";
const DUREE_SESSION = "7d";
const DUREE_SESSION_EN_SECONDES = 60 * 60 * 24 * 7;
/** Throttle de la mise a jour de "derniere activite" : evite une ecriture en base a chaque navigation. */
const INTERVALLE_MISE_A_JOUR_ACTIVITE_MS = 5 * 60 * 1000;

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

/**
 * Signe un JWT de session et le pose dans un cookie httpOnly ("session").
 * Cree aussi la ligne SessionActive correspondante (F-AUTH-09), a partir du
 * User-Agent et de l'adresse IP de la requete courante.
 */
export async function createSession(payload: { userId: string; roles: NomRole[] }): Promise<void> {
  const { userAgent, adresseIp } = await contexteRequeteCourante();
  const { appareil, navigateur } = analyserAppareil(userAgent);

  const sessionActive = await prisma.sessionActive.create({
    data: { userId: payload.userId, appareil, navigateur, adresseIp },
  });

  const jeton = await new SignJWT({ userId: payload.userId, roles: payload.roles, sessionId: sessionActive.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(DUREE_SESSION)
    .sign(cleSecrete());

  const magasinCookies = await cookies();
  magasinCookies.set(NOM_COOKIE_SESSION, jeton, {
    httpOnly: true,
    secure: getEnv().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DUREE_SESSION_EN_SECONDES,
  });
}

/**
 * Lit et verifie le cookie "session". Retourne le payload s'il est present
 * et valide ET que la SessionActive correspondante existe toujours (pas
 * fermee a distance), sinon null. Ne leve jamais d'exception. Memoise pour
 * la duree d'une requete (React cache) : plusieurs composants serveur
 * peuvent l'appeler sans multiplier les lectures en base.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const magasinCookies = await cookies();
  const jeton = magasinCookies.get(NOM_COOKIE_SESSION)?.value;

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

    if (sessionId) {
      const sessionActive = await prisma.sessionActive.findUnique({ where: { id: sessionId } });
      if (!sessionActive) {
        return null;
      }
      if (Date.now() - sessionActive.derniereActivite.getTime() > INTERVALLE_MISE_A_JOUR_ACTIVITE_MS) {
        await prisma.sessionActive
          .update({ where: { id: sessionId }, data: { derniereActivite: new Date() } })
          .catch(() => {});
      }
    }

    return { userId: payload.userId, roles, sessionId };
  } catch {
    return null;
  }
});

/** Supprime le cookie "session" (deconnexion) et la SessionActive correspondante. */
export async function destroySession(): Promise<void> {
  const magasinCookies = await cookies();
  const jeton = magasinCookies.get(NOM_COOKIE_SESSION)?.value;
  magasinCookies.delete(NOM_COOKIE_SESSION);

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
