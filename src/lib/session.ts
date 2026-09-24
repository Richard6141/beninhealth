/**
 * Gestion de la session d'authentification (Phase 2).
 *
 * La session est un JWT (jose, HS256) signe avec getEnv().NEXTAUTH_SECRET,
 * pose dans un cookie httpOnly nomme "session". Ce module est le seul point
 * d'ecriture/lecture de ce cookie : aucun autre fichier ne doit manipuler le
 * cookie "session" directement.
 *
 * Ne pas importer ce module depuis middleware.ts : le middleware tourne en
 * edge runtime et verifie le JWT lui-meme avec jose, sans dependre de
 * next/headers ni de getEnv().
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import type { NomRole } from "@/types";

/** Contenu utile encode dans le JWT de session. */
export interface SessionPayload {
  userId: string;
  roles: NomRole[];
}

const NOM_COOKIE_SESSION = "session";
const DUREE_SESSION = "7d";
const DUREE_SESSION_EN_SECONDES = 60 * 60 * 24 * 7;

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

/**
 * Signe un JWT de session et le pose dans un cookie httpOnly ("session").
 * Cookie secure en production, sameSite "lax", expiration alignee sur celle
 * du JWT (7 jours).
 */
export async function createSession(payload: SessionPayload): Promise<void> {
  const jeton = await new SignJWT({ userId: payload.userId, roles: payload.roles })
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
 * et valide, sinon null (cookie absent, JWT invalide ou expire). Ne leve
 * jamais d'exception.
 */
export async function getSession(): Promise<SessionPayload | null> {
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

    return { userId: payload.userId, roles };
  } catch {
    return null;
  }
}

/** Supprime le cookie "session" (deconnexion). */
export async function destroySession(): Promise<void> {
  const magasinCookies = await cookies();
  magasinCookies.delete(NOM_COOKIE_SESSION);
}
