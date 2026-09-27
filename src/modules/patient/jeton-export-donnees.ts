/**
 * Preuve de re-authentification pour la copie des donnees personnelles
 * (F-CIT-13 du pack).
 *
 * Module SANS "use server". Les deux routes de telechargement
 * (/api/patient/export/json et /pdf) se contentaient de verifier la session :
 * l'etape "mot de passe" de la page n'etait donc qu'une politesse, un simple
 * GET direct avec le cookie de session livrait tout le dossier. Apres une
 * verification reussie du mot de passe, l'action delivre maintenant un jeton
 * signe, lie a CE compte et valable DUREE_JETON_EXPORT_MS ; les routes
 * l'exigent. Un jeton copie vers un autre compte ne sert a rien (l'identifiant
 * du compte est signe avec). Meme principe sans etat que
 * prescription/presentation.ts : aucune migration.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

export const DUREE_JETON_EXPORT_MS = 5 * 60 * 1000;

function signer(utilisateurId: string, expiration: number): string {
  return createHmac("sha256", `${getEnv().NEXTAUTH_SECRET}:export-donnees-patient`)
    .update(`${utilisateurId}:${expiration}`)
    .digest("base64url");
}

export function creerJetonExportDonnees(utilisateurId: string, maintenant: Date = new Date()): string {
  const expiration = maintenant.getTime() + DUREE_JETON_EXPORT_MS;
  return `${expiration}.${signer(utilisateurId, expiration)}`;
}

export function jetonExportDonneesValide(
  jeton: string | null | undefined,
  utilisateurId: string,
  maintenant: Date = new Date()
): boolean {
  if (!jeton) return false;

  const [texteExpiration, signature, reste] = jeton.split(".");
  if (reste !== undefined || !texteExpiration || !signature) return false;

  const expiration = Number(texteExpiration);
  if (!Number.isSafeInteger(expiration) || expiration < maintenant.getTime()) return false;

  const attendue = Buffer.from(signer(utilisateurId, expiration));
  const recue = Buffer.from(signature);

  return attendue.length === recue.length && timingSafeEqual(attendue, recue);
}
