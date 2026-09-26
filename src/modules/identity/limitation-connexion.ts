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
export const ECHECS_MAX_PAR_COMPTE = 5;
export const ECHECS_MAX_PAR_ADRESSE = 30;
export const ECHECS_MFA_MAX_PAR_COMPTE = 5;

export const MESSAGE_TROP_DE_TENTATIVES = "Trop de tentatives. Réessayez dans 15 minutes.";

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

function cleAdresse(adresse: string): string {
  return `connexion:adresse:${adresse}`;
}

export function connexionBloquee(email: string, adresse: string | null): boolean {
  return (
    limiteAtteinte(cleCompte(email), ECHECS_MAX_PAR_COMPTE, FENETRE_MS) ||
    (adresse !== null && limiteAtteinte(cleAdresse(adresse), ECHECS_MAX_PAR_ADRESSE, FENETRE_MS))
  );
}

export function enregistrerEchecConnexion(email: string, adresse: string | null): void {
  enregistrerEvenement(cleCompte(email), FENETRE_MS);
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
