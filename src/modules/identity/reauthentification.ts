/**
 * Re-authentification par mot de passe (et, si active, second facteur MFA)
 * avant un acte sensible : signature d'ordonnance (F-PRE-04, RG-PRE-30),
 * export de mes donnees personnelles (F-CIT-13). Module pur, pas de
 * "use server" (consomme par des fichiers "use server" qui ne peuvent
 * exporter que des fonctions async).
 *
 * RG-AUTH-53 : "mot de passe (+ code MFA si actif) confirme, les actes
 * sensibles suivants dans les 5 minutes ne le redemandent pas". Auparavant,
 * deux implementations independantes existaient (prescription/
 * reauthentification.ts pour F-PRE-04, patient/jeton-export-donnees.ts pour
 * F-CIT-13), chacune avec sa propre fenetre cloisonnee a son seul type
 * d'acte, et aucune des deux ne verifiait de code MFA meme quand la MFA est
 * active sur le compte. Ce module remplace la premiere et est desormais
 * partage : la fenetre de grace est globale par utilisateur, tous actes
 * sensibles confondus (signer une ordonnance puis exporter ses donnees dans
 * les 5 minutes qui suivent ne redemande plus rien deux fois).
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

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { limiteAtteinte, enregistrerEvenement } from "@/lib/limite-debit";
import { verifierSecondFacteur } from "./mfa-totp";

const FENETRE_GRACE_MS = 5 * 60 * 1000;
/** Fenetre de reference pour le compteur d'echecs : large, la vraie limite est le COMPTE, pas le temps (voir troisiemeEchecReauthentification). */
const FENETRE_ECHECS_MS = 30 * 60 * 1000;
export const ECHECS_MAX_REAUTHENTIFICATION = 3;

const dernierSuccesParUtilisateur = new Map<string, number>();

function cleEchec(userId: string): string {
  return `reauthentification:${userId}`;
}

/** RG-AUTH-53 : vrai si une re-authentification a reussi il y a moins de 5 minutes pour cet utilisateur, quel qu'ait ete l'acte sensible d'origine. */
export function reauthentificationRecente(userId: string): boolean {
  const dernierSucces = dernierSuccesParUtilisateur.get(userId);
  return dernierSucces !== undefined && Date.now() - dernierSucces < FENETRE_GRACE_MS;
}

/** A appeler apres un mot de passe (et code MFA si actif) verifies valides : ouvre la fenetre de grace de 5 minutes pour tout acte sensible. */
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
 * A appeler apres un echec (mot de passe ou code MFA incorrect). Renvoie vrai
 * si CET echec est le 3e (ou plus) : l'appelant doit alors deconnecter la
 * session (destroySession), pas seulement refuser l'acte.
 */
export function enregistrerEchecReauthentification(userId: string): boolean {
  enregistrerEvenement(cleEchec(userId), FENETRE_ECHECS_MS);
  return limiteAtteinte(cleEchec(userId), ECHECS_MAX_REAUTHENTIFICATION, FENETRE_ECHECS_MS);
}

/**
 * Reservee aux tests (meme convention que viderCompteursDebit dans
 * lib/limite-debit.ts) : vide la fenetre de grace en memoire, pour qu'un
 * succes enregistre dans un test ne fuite pas vers le suivant (le Map est un
 * singleton du module, partage par tous les appelants du meme processus).
 */
export function viderReauthentifications(): void {
  dernierSuccesParUtilisateur.clear();
}

export type MotifEchecReauthentification =
  | "compte_introuvable"
  | "mot_de_passe_incorrect"
  | "code_mfa_requis"
  | "code_mfa_incorrect";

export type ResultatReauthentification =
  | { valide: true }
  | { valide: false; motif: MotifEchecReauthentification };

/**
 * RG-AUTH-53 : verifie le mot de passe puis, SI ET SEULEMENT SI la MFA est
 * active sur ce compte, un second facteur (code TOTP ou code de secours, via
 * verifierSecondFacteur deja existant dans mfa-totp.ts, aucune duplication de
 * la logique TOTP). Ne touche ni au compteur d'echecs ni a la fenetre de
 * grace : a l'appelant de le faire (enregistrerEchecReauthentification /
 * enregistrerReauthentificationReussie), pour rester utilisable par un
 * appelant qui a deja verifie reauthentificationBloquee avant. Le libelle du
 * message d'erreur reste au choix de l'appelant (contexte different selon
 * l'acte : signature d'ordonnance, export de donnees, etc.), ce module ne
 * renvoie qu'un motif.
 */
export async function motDePasseEtCodeMfaValides(
  userId: string,
  motDePasse: string,
  codeMfa: string
): Promise<ResultatReauthentification> {
  const utilisateur = await prisma.user.findUnique({
    where: { id: userId },
    select: { motDePasseHash: true, mfaActif: true },
  });

  if (!utilisateur) {
    return { valide: false, motif: "compte_introuvable" };
  }

  const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.motDePasseHash);

  if (!motDePasseValide) {
    return { valide: false, motif: "mot_de_passe_incorrect" };
  }

  if (!utilisateur.mfaActif) {
    return { valide: true };
  }

  if (codeMfa.trim().length === 0) {
    return { valide: false, motif: "code_mfa_requis" };
  }

  const moyen = await verifierSecondFacteur(userId, codeMfa);

  return moyen !== null ? { valide: true } : { valide: false, motif: "code_mfa_incorrect" };
}
