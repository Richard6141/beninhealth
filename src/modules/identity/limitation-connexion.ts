/**
 * Limitation des essais de connexion (F-AUTH-02, RG-AUTH-12 du pack :
 * verrouillage apres 5 echecs en 15 minutes). Module serveur sans
 * "use server". Les compteurs sont en memoire du processus (voir
 * src/lib/limite-debit.ts) : suffisant contre un essai repete sur une
 * instance, pas partage entre plusieurs instances, a remplacer par un
 * compteur en base ou Redis lors d'un deploiement multi-instance.
 *
 * Meme reponse que le compte existe ou non : un email inconnu et un email
 * connu s'incrementent et se bloquent de la meme facon, sinon la limitation
 * elle-meme dirait quels comptes existent.
 */

import { headers } from "next/headers";
import { enregistrerEvenement, limiteAtteinte } from "@/lib/limite-debit";

const FENETRE_MS = 15 * 60 * 1000;
const FENETRE_24H_MS = 24 * 60 * 60 * 1000;
export const ECHECS_MAX_PAR_COMPTE = 5;
/** F-AUTH-02 : 10 echecs en 24 h verrouillent le compte pour 24 h. */
export const ECHECS_MAX_PAR_COMPTE_24H = 10;
export const ECHECS_MAX_PAR_ADRESSE = 30;
export const ECHECS_MFA_MAX_PAR_COMPTE = 5;

export const MESSAGE_TROP_DE_TENTATIVES = "Trop de tentatives. Réessayez dans 15 minutes ou réinitialisez votre mot de passe.";
/**
 * Corrige le 2026-09-29 : le tableau du pack (F-AUTH-02, 07-fiches-comptes.md)
 * distingue explicitement "5 echecs -> 15 minutes" de "10 echecs en 24h ->
 * 24 heures" avec un message different pour chaque ; jusqu'ici le meme
 * MESSAGE_TROP_DE_TENTATIVES ("Reessayez dans 15 minutes") etait renvoye dans
 * les deux cas, induisant en erreur un compte verrouille pour 24 heures.
 */
export const MESSAGE_COMPTE_VERROUILLE_24H =
  "Trop de tentatives. Ce compte est verrouillé pendant 24 heures. Vous pouvez réinitialiser votre mot de passe pour le débloquer immédiatement.";

export async function adresseDeLaRequete(): Promise<string | null> {
  try {
    const listeEntetes = await headers();
    const brute = listeEntetes.get("x-forwarded-for")?.split(",")[0]?.trim() ?? listeEntetes.get("x-real-ip");
    return brute && brute.length > 0 ? brute : null;
  } catch {
    return null;
  }
}

function cleCompte(email: string): string {
  return `connexion:compte:${email.trim().toLowerCase()}`;
}

function cleCompte24h(email: string): string {
  return `connexion:compte24h:${email.trim().toLowerCase()}`;
}

function cleAdresse(adresse: string): string {
  return `connexion:adresse:${adresse}`;
}

export function connexionBloquee(email: string, adresse: string | null): boolean {
  return (
    limiteAtteinte(cleCompte(email), ECHECS_MAX_PAR_COMPTE, FENETRE_MS) ||
    limiteAtteinte(cleCompte24h(email), ECHECS_MAX_PAR_COMPTE_24H, FENETRE_24H_MS) ||
    (adresse !== null && limiteAtteinte(cleAdresse(adresse), ECHECS_MAX_PAR_ADRESSE, FENETRE_MS))
  );
}

export type TypeVerrouillageCompte = "15min" | "24h" | null;

/**
 * Distingue lequel des deux verrous PROPRES AU COMPTE (pas le verrou par
 * adresse IP, mesure anti-abus generique hors du tableau du pack) est actif,
 * pour choisir le bon message et la bonne alerte (F-AUTH-02). Le verrou 24h
 * est verifie en premier : si les deux sont actifs a la fois (l'utilisateur a
 * attendu la fin de plusieurs verrous de 15 minutes avant d'accumuler 10
 * echecs sur 24h), c'est le plus severe qui prime.
 */
export function typeVerrouillageCompte(email: string): TypeVerrouillageCompte {
  if (limiteAtteinte(cleCompte24h(email), ECHECS_MAX_PAR_COMPTE_24H, FENETRE_24H_MS)) {
    return "24h";
  }
  if (limiteAtteinte(cleCompte(email), ECHECS_MAX_PAR_COMPTE, FENETRE_MS)) {
    return "15min";
  }
  return null;
}

export function enregistrerEchecConnexion(email: string, adresse: string | null): void {
  enregistrerEvenement(cleCompte(email), FENETRE_MS);
  enregistrerEvenement(cleCompte24h(email), FENETRE_24H_MS);
  if (adresse !== null) {
    enregistrerEvenement(cleAdresse(adresse), FENETRE_MS);
  }
}

function cleMfa(userId: string): string {
  return `connexion:mfa:${userId}`;
}

export function mfaBloquee(userId: string): boolean {
  return limiteAtteinte(cleMfa(userId), ECHECS_MFA_MAX_PAR_COMPTE, FENETRE_MS);
}

export function enregistrerEchecMfa(userId: string): void {
  enregistrerEvenement(cleMfa(userId), FENETRE_MS);
}
