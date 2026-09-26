/**
 * Preuve de presentation d'une ordonnance a un pharmacien (F-PHA-02 du pack,
 * RG-PHA-02).
 *
 * Module SANS "use server". Un pharmacien n'ouvre une ordonnance que si le
 * patient la lui presente : la recherche par numero et annee de naissance
 * (RG-PHA-01) delivre alors un jeton signe, lie a CE pharmacien et a CETTE
 * ordonnance, valable DUREE_PRESENTATION_MS. Un jeton copie vers un autre
 * compte ne sert a rien (l'identifiant du compte est signe avec).
 *
 * Perimetre reduit assume : le pack cree une base d'acces ASSIGNMENT de 30
 * jours en base ; ici le jeton est sans etat (aucune migration) et, une fois
 * une premiere delivrance faite par la pharmacie, celle-ci retrouve l'ordonnance
 * sans nouveau jeton (elle figure dans son tableau de bord des ordonnances
 * partiellement delivrees).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

export const DUREE_PRESENTATION_MS = 12 * 60 * 60 * 1000;

function signer(utilisateurId: string, prescriptionId: string, expiration: number): string {
  return createHmac("sha256", `${getEnv().NEXTAUTH_SECRET}:presentation-ordonnance`)
    .update(`${utilisateurId}:${prescriptionId}:${expiration}`)
    .digest("base64url");
}

export function creerJetonPresentation(
  utilisateurId: string,
  prescriptionId: string,
  maintenant: Date = new Date()
): string {
  const expiration = maintenant.getTime() + DUREE_PRESENTATION_MS;
  return `${expiration}.${signer(utilisateurId, prescriptionId, expiration)}`;
}

export function jetonPresentationValide(
  jeton: string | null | undefined,
  utilisateurId: string,
  prescriptionId: string,
  maintenant: Date = new Date()
): boolean {
  if (!jeton) return false;

  const [texteExpiration, signature, reste] = jeton.split(".");
  if (reste !== undefined || !texteExpiration || !signature) return false;

  const expiration = Number(texteExpiration);
  if (!Number.isSafeInteger(expiration) || expiration < maintenant.getTime()) return false;

  const attendue = Buffer.from(signer(utilisateurId, prescriptionId, expiration));
  const recue = Buffer.from(signature);

  return attendue.length === recue.length && timingSafeEqual(attendue, recue);
}

const DECALAGE_BENIN_MS = 60 * 60 * 1000;

/** Debut du jour civil au Benin (UTC+1, sans heure d'ete) contenant cet instant. */
export function debutJourBenin(instant: Date): Date {
  const decale = new Date(instant.getTime() + DECALAGE_BENIN_MS);
  decale.setUTCHours(0, 0, 0, 0);
  return new Date(decale.getTime() - DECALAGE_BENIN_MS);
}

/** Debut du jour suivant au Benin : borne exclusive de la journee en cours. */
export function debutJourSuivantBenin(instant: Date): Date {
  return new Date(debutJourBenin(instant).getTime() + 24 * 60 * 60 * 1000);
}
