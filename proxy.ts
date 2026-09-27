/**
 * Proxy de protection des routes authentifiees (/app/*). Nom de fichier
 * impose par Next.js 16 (ancien "middleware.ts", deprecie).
 *
 * Premier filtre seulement : verifie la presence et la validite de la
 * signature du JWT de session avec jose, sans lire la base. La verification
 * de l'etat reel de la session (compte actif, session non revoquee) est faite
 * par getSession() (src/lib/session.ts), rappelee dans chaque page, action et
 * route API. Ne pas importer src/lib/session.ts ici.
 *
 * Le matcher ci-dessous restreint l'execution du proxy aux routes /app/*,
 * ce qui laisse passer librement /connexion, /inscription, /style-guide et
 * les assets Next.js (/_next/*) sans logique supplementaire. Les en-tetes de
 * securite de toutes les reponses sont definis dans next.config.ts.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { nomCookieSession } from "./src/lib/nom-cookie-session";

async function jetonDeSessionEstValide(jeton: string | undefined): Promise<boolean> {
  if (!jeton) {
    return false;
  }

  const secret = process.env.NEXTAUTH_SECRET;

  if (!secret) {
    return false;
  }

  try {
    await jwtVerify(jeton, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const jeton = request.cookies.get(nomCookieSession())?.value;

  if (await jetonDeSessionEstValide(jeton)) {
    return NextResponse.next();
  }

  const urlConnexion = new URL("/connexion", request.url);
  return NextResponse.redirect(urlConnexion);
}

export const config = {
  matcher: ["/app/:path*"],
};
