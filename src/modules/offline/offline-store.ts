/**
 * Orchestration du mode hors ligne cote client (F-COM-01, F-COM-08) :
 * combine crypto-client.ts (chiffrement), indexeddb-client.ts (stockage) et
 * uuid-v7.ts (identifiants). Module client uniquement ("use client" dans les
 * pages qui l'importent) : jamais execute cote serveur.
 *
 * La cle AES-GCM derivee du PIN n'est jamais persistee (RG-OFF-01) : elle
 * vit en memoire JS le temps de la session terrain (variable de module),
 * perdue a chaque rechargement de page, recalculee au prochain deverrouillage.
 */

"use client";

import {
  type EnveloppeChiffree,
  chiffrer,
  dechiffrer,
  deriverClePin,
  genererSel,
  selDeLEnveloppe,
} from "./crypto-client";
import {
  type EntreeFileAttente,
  ajouterEnFileAttente,
  ecrireInstantaneChiffre,
  ecrireMeta,
  effacerDonneesNonSynchronisables,
  indexedDbDisponible,
  lireInstantaneChiffre,
  lireMeta,
  listerFileAttente,
  marquerRejetee,
  retirerDeFileAttente,
} from "./indexeddb-client";
import { genererUuidV7 } from "./uuid-v7";
import { doitEffacerApresEchecsPin } from "./regles-expiration";

/** Valeur connue chiffree au moment de la definition du PIN, pour verifier un futur PIN saisi sans jamais stocker la cle elle-meme. */
const CANARI = { verification: "bhip-terrain-pin-ok" } as const;

let cleSession: CryptoKey | null = null;
let selSession: Uint8Array | null = null;

export function sessionDeverrouillee(): boolean {
  return cleSession !== null;
}

export function verrouiller(): void {
  cleSession = null;
  selSession = null;
}

/** F-COM-01, etape 3 : premiere definition du PIN sur cet appareil. */
export async function initialiserPin(pin: string): Promise<void> {
  const sel = genererSel();
  const cle = await deriverClePin(pin, sel);
  const canariChiffre = await chiffrer(cle, sel, CANARI);

  await ecrireMeta("canari", canariChiffre);
  await ecrireMeta("compteurEchecsPin", 0);

  cleSession = cle;
  selSession = sel;
}

export type ResultatDeverrouillage =
  | { statut: "ok" }
  | { statut: "pin_incorrect"; echecsRestants: number }
  | { statut: "verrouille_donnees_effacees" }
  | { statut: "aucun_pin_defini" };

/** F-COM-01/RG-COM-02 : tentative de deverrouillage avec le PIN saisi. */
export async function deverrouillerAvecPin(pin: string): Promise<ResultatDeverrouillage> {
  const canari = await lireMeta<EnveloppeChiffree>("canari");
  if (!canari) {
    return { statut: "aucun_pin_defini" };
  }

  const sel = selDeLEnveloppe(canari);
  const cle = await deriverClePin(pin, sel);

  try {
    await dechiffrer(cle, canari);
  } catch {
    const compteurActuel = (await lireMeta<number>("compteurEchecsPin")) ?? 0;
    const nouveauCompteur = compteurActuel + 1;

    if (doitEffacerApresEchecsPin(nouveauCompteur)) {
      // RG-COM-02 : 5 PIN errones => efface les donnees locales non
      // synchronisables (l'instantane), jamais la file d'attente.
      await effacerDonneesNonSynchronisables();
      return { statut: "verrouille_donnees_effacees" };
    }

    await ecrireMeta("compteurEchecsPin", nouveauCompteur);
    return { statut: "pin_incorrect", echecsRestants: 5 - nouveauCompteur };
  }

  await ecrireMeta("compteurEchecsPin", 0);
  cleSession = cle;
  selSession = sel;
  return { statut: "ok" };
}

function exigerCleSession(): { cle: CryptoKey; sel: Uint8Array } {
  if (!cleSession || !selSession) {
    throw new Error("Session verrouillee : deverrouillez avec le PIN avant d'acceder aux donnees hors ligne.");
  }
  return { cle: cleSession, sel: selSession };
}

/** F-COM-01, etape 4 : telecharge et chiffre l'instantane de l'aire de l'agent. */
export async function telechargerEtChiffrerInstantane(): Promise<{ nombrePersonnes: number }> {
  const { cle, sel } = exigerCleSession();

  const reponse = await fetch("/api/v1/community/area/snapshot");
  if (!reponse.ok) {
    throw new Error("Echec du telechargement de l'instantane de l'aire.");
  }
  const instantane = await reponse.json();

  const enveloppe = await chiffrer(cle, sel, instantane);
  await ecrireInstantaneChiffre(enveloppe);
  await ecrireMeta("dateInstantane", new Date().toISOString());
  await ecrireMeta("dateDerniereSynchronisation", new Date().toISOString());

  return { nombrePersonnes: Array.isArray(instantane?.personnes) ? instantane.personnes.length : 0 };
}

export async function lireInstantaneDechiffre<T = unknown>(): Promise<T | null> {
  const { cle } = exigerCleSession();
  const enveloppe = await lireInstantaneChiffre();
  if (!enveloppe) return null;
  return dechiffrer<T>(cle, enveloppe);
}

export interface PayloadPersonneCommunautaireHorsLigne {
  nom: string;
  prenom: string;
  sexe: "M" | "F";
  dateNaissance: string;
  dateNaissanceApproximative: boolean;
  villageQuartier: string;
  chefMenage: string | null;
}

/** F-COM-02 hors ligne : met en file d'attente une nouvelle personne, chiffree, avec un UUID v7 genere sur l'appareil (RG-OFF-02). */
export async function mettreEnFileAttentePersonne(payload: PayloadPersonneCommunautaireHorsLigne): Promise<string> {
  const { cle, sel } = exigerCleSession();

  const uuidAppareil = genererUuidV7();
  const horodatageLocal = new Date().toISOString();
  const enveloppe = await chiffrer(cle, sel, payload);

  const entree: EntreeFileAttente = {
    uuidAppareil,
    type: "personne_communautaire",
    horodatageLocal,
    statut: "PENDING",
    enveloppe,
  };

  await ajouterEnFileAttente(entree);
  return uuidAppareil;
}

export async function nombreEnAttente(): Promise<number> {
  const file = await listerFileAttente();
  return file.filter((entree) => entree.statut === "PENDING").length;
}

export interface ResultatSynchronisationClient {
  acceptees: number;
  dupliquees: number;
  enRevue: number;
  rejetees: number;
}

/**
 * F-COM-08 : envoie les saisies en attente par lots de 50 (RG-OFF-02),
 * dechiffre localement chaque payload pour l'envoi (le transport est protege
 * par HTTPS, le chiffrement local protege le stockage sur l'appareil), et
 * applique RG-COM-20 (retrait local seulement apres ACCEPTED/DUPLICATE ; une
 * saisie REVIEW a bien ete creee cote serveur, elle est donc retiree aussi ;
 * seule REJECTED reste en file pour correction).
 */
export async function synchroniser(): Promise<ResultatSynchronisationClient> {
  const { cle } = exigerCleSession();
  const file = await listerFileAttente();
  const enAttente = file.filter((entree) => entree.statut === "PENDING");

  const resultat: ResultatSynchronisationClient = { acceptees: 0, dupliquees: 0, enRevue: 0, rejetees: 0 };

  const TAILLE_LOT = 50;
  for (let debut = 0; debut < enAttente.length; debut += TAILLE_LOT) {
    const lot = enAttente.slice(debut, debut + TAILLE_LOT);

    const saisies = await Promise.all(
      lot.map(async (entree) => ({
        uuidAppareil: entree.uuidAppareil,
        type: entree.type,
        horodatageLocal: entree.horodatageLocal,
        payload: await dechiffrer(cle, entree.enveloppe),
      }))
    );

    const reponse = await fetch("/api/v1/sync/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saisies }),
    });

    if (!reponse.ok) {
      throw new Error("Echec de l'envoi du lot de synchronisation.");
    }

    const { resultats } = (await reponse.json()) as {
      resultats: { uuidAppareil: string; statut: "ACCEPTED" | "DUPLICATE" | "REVIEW" | "REJECTED"; message: string }[];
    };

    for (const item of resultats) {
      if (item.statut === "ACCEPTED" || item.statut === "DUPLICATE" || item.statut === "REVIEW") {
        await retirerDeFileAttente(item.uuidAppareil);
        if (item.statut === "ACCEPTED") resultat.acceptees += 1;
        else if (item.statut === "DUPLICATE") resultat.dupliquees += 1;
        else resultat.enRevue += 1;
      } else {
        await marquerRejetee(item.uuidAppareil, item.message);
        resultat.rejetees += 1;
      }
    }
  }

  await ecrireMeta("dateDerniereSynchronisation", new Date().toISOString());
  return resultat;
}

export { indexedDbDisponible };
