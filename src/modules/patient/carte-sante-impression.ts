/**
 * Jetons de telechargement a usage unique pour le PDF imprimable de la carte
 * sante (F-CIT-05 du pack, etape 4 : "Bouton Imprimer ma carte (P1) : PDF au
 * format carte bancaire avec l'identifiant sante (sans QR dynamique)"). Meme
 * principe que src/modules/prescription/jetons-telechargement.ts (module
 * pur, pas de "use server" : consomme aussi bien par une Server Action que
 * par une route API classique), volontairement un fichier separe plutot
 * qu'une reutilisation du module prescription (domaine different, eviter de
 * partager un fichier entre deux fonctionnalites sans lien).
 *
 * Stockage en memoire (Map au niveau du module) : suffisant pour un jeton a
 * vie tres courte (60 secondes) sur ce deploiement mono-processus de
 * demonstration. Ne survivrait pas a un redemarrage du serveur ni a un
 * deploiement multi-instance : meme limite assumee que son equivalent
 * prescription.
 */

import { randomUUID } from "node:crypto";

const DUREE_JETON_MS = 60_000;

interface DonneesJeton {
  patientId: string;
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

/** Cree un jeton de telechargement pour la carte sante d'un patient, valide 60 secondes, a usage unique. */
export function creerJetonImpressionCarteSante(patientId: string): string {
  nettoyerJetonsExpires();
  const jeton = randomUUID();
  jetons.set(jeton, { patientId, expiration: Date.now() + DUREE_JETON_MS });
  return jeton;
}

/**
 * Consomme un jeton de telechargement de carte sante : renvoie l'identifiant
 * du patient et invalide immediatement le jeton (usage unique) s'il existe
 * et n'est pas expire ; renvoie null sinon (jeton inconnu, deja consomme, ou
 * expire). Pas de parametre de correspondance supplementaire (a la
 * difference du jeton d'ordonnance) : cette route n'a aucun identifiant dans
 * son chemin, le jeton porte lui-meme le patient concerne.
 */
export function consommerJetonImpressionCarteSante(jeton: string): string | null {
  nettoyerJetonsExpires();
  const donnees = jetons.get(jeton);

  if (!donnees) {
    return null;
  }

  jetons.delete(jeton);
  return donnees.expiration >= Date.now() ? donnees.patientId : null;
}
