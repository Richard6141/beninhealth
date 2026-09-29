/**
 * Wrapper minimal au-dessus de l'API IndexedDB native du navigateur (aucune
 * dependance npm, comme demande). Ce module ne s'execute que cote client
 * (l'ecran /terrain/preparation et /terrain/synchronisation sont des
 * Composants Client) : toute fonction ici suppose que `indexedDB` existe.
 *
 * Trois magasins (object stores) :
 * - "meta" : parametres non sensibles de l'appareil (sel PBKDF2, compteur
 *   d'echecs de PIN, date du dernier instantane, date de derniere
 *   synchronisation). Le sel n'est pas secret (voir crypto-client.ts).
 * - "instantane" : UNE enveloppe chiffree (EnveloppeChiffree) contenant tout
 *   l'instantane de l'aire (RG-OFF-01 : donnees de lecture, toujours
 *   chiffrees sur l'appareil).
 * - "file_attente" : les saisies creees hors ligne, en attente de
 *   synchronisation. Chaque saisie est stockee sous forme d'enveloppe
 *   chiffree (le contenu metier, potentiellement sensible) accompagnee de
 *   metadonnees non sensibles (uuid, type, statut) qui permettent d'afficher
 *   le compteur "X saisies en attente" (RG-OFF-04) sans dechiffrer.
 */

import type { EnveloppeChiffree } from "./crypto-client";

const NOM_BASE = "bhip-terrain";
const VERSION_BASE = 1;

const MAGASIN_META = "meta";
const MAGASIN_INSTANTANE = "instantane";
const MAGASIN_FILE_ATTENTE = "file_attente";

export interface EntreeFileAttente {
  uuidAppareil: string;
  type: "personne_communautaire";
  horodatageLocal: string; // ISO
  statut: "PENDING" | "REJECTED";
  messageErreur?: string;
  enveloppe: EnveloppeChiffree;
}

function estDisponible(): boolean {
  return typeof indexedDB !== "undefined";
}

function ouvrirBase(): Promise<IDBDatabase> {
  if (!estDisponible()) {
    return Promise.reject(new Error("IndexedDB indisponible sur cet environnement."));
  }

  return new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(NOM_BASE, VERSION_BASE);

    requete.onupgradeneeded = () => {
      const base = requete.result;
      if (!base.objectStoreNames.contains(MAGASIN_META)) {
        base.createObjectStore(MAGASIN_META, { keyPath: "cle" });
      }
      if (!base.objectStoreNames.contains(MAGASIN_INSTANTANE)) {
        base.createObjectStore(MAGASIN_INSTANTANE, { keyPath: "cle" });
      }
      if (!base.objectStoreNames.contains(MAGASIN_FILE_ATTENTE)) {
        base.createObjectStore(MAGASIN_FILE_ATTENTE, { keyPath: "uuidAppareil" });
      }
    };

    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error ?? new Error("Echec d'ouverture d'IndexedDB."));
  });
}

async function transaction<T>(
  magasin: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const base = await ouvrirBase();
  return new Promise((resoudre, rejeter) => {
    const tx = base.transaction(magasin, mode);
    const store = tx.objectStore(magasin);
    const requete = operation(store);
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error ?? new Error("Echec de l'operation IndexedDB."));
  });
}

async function tousLesElements<T>(magasin: string): Promise<T[]> {
  const base = await ouvrirBase();
  return new Promise((resoudre, rejeter) => {
    const tx = base.transaction(magasin, "readonly");
    const store = tx.objectStore(magasin);
    const requete = store.getAll();
    requete.onsuccess = () => resoudre(requete.result as T[]);
    requete.onerror = () => rejeter(requete.error ?? new Error("Echec de lecture IndexedDB."));
  });
}

/* --- meta (non chiffre, jamais de donnee de sante) --- */

export async function lireMeta<T>(cle: string): Promise<T | undefined> {
  const ligne = await transaction<{ cle: string; valeur: T } | undefined>(MAGASIN_META, "readonly", (store) =>
    store.get(cle)
  );
  return ligne?.valeur;
}

export async function ecrireMeta<T>(cle: string, valeur: T): Promise<void> {
  await transaction(MAGASIN_META, "readwrite", (store) => store.put({ cle, valeur }));
}

/* --- instantane (chiffre) --- */

export async function lireInstantaneChiffre(): Promise<EnveloppeChiffree | undefined> {
  const ligne = await transaction<{ cle: string; enveloppe: EnveloppeChiffree } | undefined>(
    MAGASIN_INSTANTANE,
    "readonly",
    (store) => store.get("aire")
  );
  return ligne?.enveloppe;
}

export async function ecrireInstantaneChiffre(enveloppe: EnveloppeChiffree): Promise<void> {
  await transaction(MAGASIN_INSTANTANE, "readwrite", (store) => store.put({ cle: "aire", enveloppe }));
}

/** RG-COM-03 : efface les donnees de LECTURE (instantane) apres 30 jours sans synchronisation. Ne touche jamais la file d'attente. */
export async function effacerInstantane(): Promise<void> {
  await transaction(MAGASIN_INSTANTANE, "readwrite", (store) => store.delete("aire"));
}

/* --- file d'attente (chiffree pour le contenu, metadonnees en clair) --- */

export async function listerFileAttente(): Promise<EntreeFileAttente[]> {
  return tousLesElements<EntreeFileAttente>(MAGASIN_FILE_ATTENTE);
}

export async function ajouterEnFileAttente(entree: EntreeFileAttente): Promise<void> {
  await transaction(MAGASIN_FILE_ATTENTE, "readwrite", (store) => store.put(entree));
}

/** RG-COM-20 : une saisie n'est retiree du stockage local qu'apres confirmation ACCEPTED ou DUPLICATE du serveur. */
export async function retirerDeFileAttente(uuidAppareil: string): Promise<void> {
  await transaction(MAGASIN_FILE_ATTENTE, "readwrite", (store) => store.delete(uuidAppareil));
}

export async function marquerRejetee(uuidAppareil: string, messageErreur: string): Promise<void> {
  const base = await ouvrirBase();
  await new Promise<void>((resoudre, rejeter) => {
    const tx = base.transaction(MAGASIN_FILE_ATTENTE, "readwrite");
    const store = tx.objectStore(MAGASIN_FILE_ATTENTE);
    const requeteLecture = store.get(uuidAppareil);
    requeteLecture.onsuccess = () => {
      const entree = requeteLecture.result as EntreeFileAttente | undefined;
      if (!entree) {
        resoudre();
        return;
      }
      const requeteEcriture = store.put({ ...entree, statut: "REJECTED", messageErreur });
      requeteEcriture.onsuccess = () => resoudre();
      requeteEcriture.onerror = () => rejeter(requeteEcriture.error ?? new Error("Echec d'ecriture IndexedDB."));
    };
    requeteLecture.onerror = () => rejeter(requeteLecture.error ?? new Error("Echec de lecture IndexedDB."));
  });
}

/**
 * RG-COM-02 : efface les donnees locales NON synchronisables (l'instantane
 * de lecture) apres 5 PIN errones. Les saisies en attente de synchronisation
 * restent chiffrees et conservees (elles seront envoyees apres
 * reconnexion) : cette fonction ne touche jamais la file d'attente.
 */
export async function effacerDonneesNonSynchronisables(): Promise<void> {
  await effacerInstantane();
  await ecrireMeta("compteurEchecsPin", 0);
}

export { estDisponible as indexedDbDisponible };
