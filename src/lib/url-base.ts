import { headers } from "next/headers";

/**
 * Adresse publique de la plateforme, pour construire les liens envoyes par
 * e-mail (invitation, etc.). APP_URL (ex. https://beninhealth.example.bj), si
 * elle est definie, fait foi : c'est la seule valeur a l'abri d'un en-tete Host
 * forge. Sans elle, l'adresse est deduite de la requete (acceptable derriere un
 * proxy de confiance, a eviter en production).
 */
export async function urlDeBase(): Promise<string> {
  const configuree = process.env.APP_URL?.trim().replace(/\/+$/, "");

  if (configuree) {
    return configuree;
  }

  const entetes = await headers();
  const hote = entetes.get("x-forwarded-host") ?? entetes.get("host") ?? "localhost:3000";
  const protocole = entetes.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(hote) ? "http" : "https");

  return `${protocole}://${hote}`;
}
