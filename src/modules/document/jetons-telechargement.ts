/**
 * Jetons de telechargement a usage unique pour un document medical (F-CIT-06
 * du pack, RG-CIT-50 : "chaque telechargement DOIT passer par une URL
 * temporaire (60 secondes) generee APRES controle d'acces"). Meme patron que
 * src/modules/prescription/jetons-telechargement.ts (module pur, pas de
 * "use server", export non-async : consomme aussi bien par une Server Action
 * que par une route API classique).
 *
 * Stockage en memoire (Map au niveau du module) : suffisant pour un jeton a
 * vie tres courte (60 secondes) sur ce deploiement mono-processus de
 * demonstration. Ne survivrait pas a un redemarrage du serveur ni a un
 * deploiement multi-instance : meme limite assumee que le module miroir.
 *
 * Volontairement un module distinct de celui des ordonnances : un jeton de
 * document ne doit jamais pouvoir etre confondu avec un jeton d'ordonnance
 * (deux Map separees, deux espaces d'identifiants).
 */

import { randomUUID } from "node:crypto";

const DUREE_JETON_MS = 60_000;

interface DonneesJeton {
  documentId: string;
  expiration: number;
}

const jetons = new Map<string, DonneesJeton>();

function nettoyerJetonsExpires(): void {
  const maintenant = Date.now();
  for (const [jeton, donnees] of jetons) {
    if (donnees.expiration < maintenant) {
      jetons.delete(jeton);
    }
  }
}

/** Cree un jeton de telechargement pour un document medical, valide 60 secondes, a usage unique. */
export function creerJetonTelechargementDocument(documentId: string): string {
  nettoyerJetonsExpires();
  const jeton = randomUUID();
  jetons.set(jeton, { documentId, expiration: Date.now() + DUREE_JETON_MS });
  return jeton;
}

/**
 * Consomme un jeton de telechargement de document : renvoie true et invalide
 * immediatement le jeton (usage unique) s'il existe, correspond au document
 * demande et n'est pas expire ; renvoie false sinon (jeton inconnu, deja
 * consomme, expire, ou associe a un autre document). CA-1 du pack : une URL
 * reutilisee apres 60 secondes renvoie une erreur.
 */
export function consommerJetonTelechargementDocument(documentId: string, jeton: string): boolean {
  nettoyerJetonsExpires();
  const donnees = jetons.get(jeton);

  if (!donnees || donnees.documentId !== documentId) {
    return false;
  }

  jetons.delete(jeton);
  return donnees.expiration >= Date.now();
}
