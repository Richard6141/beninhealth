/**
 * Re-authentification par mot de passe avant la signature d'une ordonnance
 * (F-PRE-04 du pack, RG-PRE-30) : "sauf si elle a eu lieu depuis moins de
 * 5 minutes" et "3 echecs -> deconnexion de la session". Module pur, pas de
 * "use server" (consomme par un fichier "use server" qui ne peut exporter
 * que des fonctions async).
 *
 * Reutilise lib/limite-debit.ts (deja utilise pour RG-PRE-41, F-PRE-06) pour
 * le compteur d'echecs, meme principe qu'identity/limitation-connexion.ts
 * (verrouillage de connexion) : compteurs en memoire du processus, meme
 * limite assumee deja documentee dans ces deux fichiers (pas partage entre
 * plusieurs instances, a remplacer par un compteur en base ou Redis avant
 * un deploiement multi-instance).
 *
 * La fenetre de grace de 5 minutes (dernier succes) est un Map separe : ce
 * n'est pas un compteur d'evenements a limiter mais un simple horodatage a
 * comparer, hors du perimetre de limite-debit.ts.
 */

import { limiteAtteinte, enregistrerEvenement } from "@/lib/limite-debit";

const FENETRE_GRACE_MS = 5 * 60 * 1000;
/** Fenetre de reference pour le compteur d'echecs : large, la vraie limite est le COMPTE, pas le temps (voir troisiemeEchecReauthentification). */
const FENETRE_ECHECS_MS = 30 * 60 * 1000;
export const ECHECS_MAX_REAUTHENTIFICATION = 3;

const dernierSuccesParUtilisateur = new Map<string, number>();

function cleEchec(userId: string): string {
  return `prescription:reauth:${userId}`;
}

/** RG-PRE-30 : vrai si une re-authentification a reussi il y a moins de 5 minutes pour cet utilisateur. */
export function reauthentificationRecente(userId: string): boolean {
  const dernierSucces = dernierSuccesParUtilisateur.get(userId);
  return dernierSucces !== undefined && Date.now() - dernierSucces < FENETRE_GRACE_MS;
}

/** A appeler apres un mot de passe verifie valide : ouvre la fenetre de grace de 5 minutes. */
export function enregistrerReauthentificationReussie(userId: string): void {
  dernierSuccesParUtilisateur.set(userId, Date.now());
}

/**
 * A appeler AVANT de verifier le mot de passe : si deja a la limite (3
 * echecs precedents), refuse sans meme comparer le mot de passe fourni.
 */
export function reauthentificationBloquee(userId: string): boolean {
  return limiteAtteinte(cleEchec(userId), ECHECS_MAX_REAUTHENTIFICATION, FENETRE_ECHECS_MS);
}

/**
 * A appeler apres un mot de passe incorrect. Renvoie vrai si CET echec est
 * le 3e (ou plus) : l'appelant doit alors deconnecter la session
 * (destroySession), pas seulement refuser la signature.
 */
export function enregistrerEchecReauthentification(userId: string): boolean {
  enregistrerEvenement(cleEchec(userId), FENETRE_ECHECS_MS);
  return limiteAtteinte(cleEchec(userId), ECHECS_MAX_REAUTHENTIFICATION, FENETRE_ECHECS_MS);
}
