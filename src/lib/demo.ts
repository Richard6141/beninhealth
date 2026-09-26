import { getEnv } from "@/lib/env";

/**
 * Serveur de demonstration (variable DEMO_CODE_ECRAN=1).
 *
 * Les comptes du jeu de demonstration (prisma/seed.ts) ont des adresses
 * fictives en @benin-health.test qu'aucune boite ne recoit. Sur un serveur de
 * demonstration qui tourne en production, ces comptes ne pourraient donc jamais
 * recevoir leur code de connexion. Pour eux seuls, aucun e-mail n'est tente et
 * le code s'affiche a l'ecran, comme hors production. Les vrais comptes gardent
 * l'envoi par e-mail, et WhatsApp reel ne part que vers WAPY_NUMEROS_TEST (la
 * base de demonstration contient des numeros plausibles).
 */

const DOMAINE_DEMO = "@benin-health.test";

export function modeDemoActif(): boolean {
  return process.env.DEMO_CODE_ECRAN === "1";
}

/** Adresse fictive du jeu de demonstration, sur un serveur de demonstration. */
export function adresseDemoSansBoite(email: string): boolean {
  return modeDemoActif() && email.trim().toLowerCase().endsWith(DOMAINE_DEMO);
}

/** Le code envoye par e-mail peut-il etre montre a l'ecran pour cette adresse ? */
export function codeAfficheALEcran(email: string): boolean {
  return getEnv().NODE_ENV !== "production" || adresseDemoSansBoite(email);
}
