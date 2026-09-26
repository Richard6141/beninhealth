/**
 * Jetons de telechargement a usage unique pour le PDF d'une ordonnance
 * (F-CIT-06 du pack, RG-CIT-50 : "chaque telechargement DOIT passer par une
 * URL temporaire (60 secondes) generee APRES controle d'acces"). Module pur
 * (pas de "use server", export non-async) : un fichier "use server" ne peut
 * exporter que des fonctions async (contrainte Next.js deja rencontree ce
 * soir ailleurs dans ce depot, voir src/modules/administration/parametres.ts),
 * or ce module est consomme aussi bien par une Server Action
 * (src/modules/prescription/telechargement.ts) que par une route API classique
 * (src/app/api/patient/prescriptions/[id]/telecharger/route.ts).
 *
 * Stockage en memoire (Map au niveau du module) : suffisant pour un jeton a
 * vie tres courte (60 secondes) sur ce deploiement mono-processus de
 * demonstration. Ne survivrait pas a un redemarrage du serveur ni a un
 * deploiement multi-instance : a remplacer par un stockage partage (Redis,
 * table dediee) avant tout usage en production distribuee.
 */

import { randomUUID } from "node:crypto";

const DUREE_JETON_MS = 60_000;

interface DonneesJeton {
  prescriptionId: string;
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

/** Cree un jeton de telechargement pour une prescription, valide 60 secondes, a usage unique. */
export function creerJetonTelechargement(prescriptionId: string): string {
  nettoyerJetonsExpires();
  const jeton = randomUUID();
  jetons.set(jeton, { prescriptionId, expiration: Date.now() + DUREE_JETON_MS });
  return jeton;
}

/**
 * Consomme un jeton de telechargement : renvoie true et invalide
 * immediatement le jeton (usage unique) s'il existe, correspond a la
 * prescription demandee et n'est pas expire ; renvoie false sinon (jeton
 * inconnu, deja consomme, expire, ou associe a une autre prescription).
 * CA-1 du pack : une URL reutilisee apres 60 secondes renvoie une erreur.
 */
export function consommerJetonTelechargement(prescriptionId: string, jeton: string): boolean {
  nettoyerJetonsExpires();
  const donnees = jetons.get(jeton);

  if (!donnees || donnees.prescriptionId !== prescriptionId) {
    return false;
  }

  jetons.delete(jeton);
  return donnees.expiration >= Date.now();
}
