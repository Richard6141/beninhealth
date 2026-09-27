/**
 * Nom du cookie de session (RG-SEC-03) : prefixe `__Host-` en production (le
 * navigateur refuse alors tout cookie de ce nom qui ne serait pas Secure, sans
 * attribut Domain et pose sur /), `session` en developpement local ou l'on
 * roule en HTTP. Module sans dependance, utilisable par proxy.ts (edge) comme
 * par src/lib/session.ts : ces deux fichiers doivent toujours lire le meme nom.
 */
export function nomCookieSession(): string {
  return process.env.NODE_ENV === "production" ? "__Host-session" : "session";
}
