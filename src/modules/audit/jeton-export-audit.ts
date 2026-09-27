/**
 * Preuve de re-authentification pour l'export CSV du journal d'audit
 * (F-AUD-01 du pack). Meme principe que
 * src/modules/patient/jeton-export-donnees.ts (F-CIT-13) : sans etat, jeton
 * signe HMAC lie a CE compte, valable DUREE_JETON_EXPORT_AUDIT_MS. Module
 * distinct (contexte HMAC different) plutot que reutilise tel quel : les
 * deux exports n'ont ni le meme acteur (patient contre admin_national/
 * admin_etablissement), ni le meme contenu, un jeton de l'un ne doit jamais
 * valoir pour l'autre.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

export const DUREE_JETON_EXPORT_AUDIT_MS = 5 * 60 * 1000;

function signer(utilisateurId: string, expiration: number): string {
  return createHmac("sha256", `${getEnv().NEXTAUTH_SECRET}:export-journal-audit`)
    .update(`${utilisateurId}:${expiration}`)
    .digest("base64url");
}

export function creerJetonExportAudit(utilisateurId: string, maintenant: Date = new Date()): string {
  const expiration = maintenant.getTime() + DUREE_JETON_EXPORT_AUDIT_MS;
  return `${expiration}.${signer(utilisateurId, expiration)}`;
}

export function jetonExportAuditValide(
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
