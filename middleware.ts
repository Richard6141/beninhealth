/**
 * Middleware de protection des routes authentifiees (/app/*).
 *
 * Tourne en edge runtime : verifie uniquement la presence et la validite du
 * JWT de session avec jose, sans dependre de Prisma ni de bcryptjs (non
 * disponibles en edge). La lecture/ecriture du cookie "session" en dehors de
 * ce fichier se fait via src/lib/session.ts.
 *
 * Le matcher ci-dessous restreint l'execution du middleware aux routes
 * /app/*, ce qui laisse passer librement /connexion, /inscription,
 * /style-guide et les assets Next.js (/_next/*) sans logique supplementaire.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const NOM_COOKIE_SESSION = "session";

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

export async function middleware(request: NextRequest) {
  const jeton = request.cookies.get(NOM_COOKIE_SESSION)?.value;

  if (await jetonDeSessionEstValide(jeton)) {
    return NextResponse.next();
  }

  const urlConnexion = new URL("/connexion", request.url);
  return NextResponse.redirect(urlConnexion);
}

export const config = {
  matcher: ["/app/:path*"],
};
