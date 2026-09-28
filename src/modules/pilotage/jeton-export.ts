/**
 * Jeton de ré-authentification des exports de pilotage (F-PIL-05, RG-PIL-40
 * et fenêtre de 5 minutes de RG-AUTH-53 du pack).
 *
 * Avant ce jeton, la ré-authentification par mot de passe n'était vérifiée
 * que dans l'écran : les routes de téléchargement acceptaient n'importe quel
 * motif passé en paramètre d'URL, donc un GET direct avec un simple cookie de
 * session contournait le mot de passe et falsifiait le motif journalisé.
 *
 * Le jeton est produit par verifierExportPilotageAction APRÈS vérification du
 * mot de passe, puis exigé par les routes. Il est signé (HMAC-SHA256 dérivé de
 * NEXTAUTH_SECRET, comme la clé de vérification d'ordonnance) et embarque le
 * motif : les routes lisent le motif dans le jeton vérifié, jamais dans
 * l'URL. Il est lié à l'utilisateur, à la session (une déconnexion ou une
 * fermeture à distance l'invalide de fait) et à la portée (national ou
 * établissement). Valable 5 minutes, réutilisable dans ce délai (PDF puis
 * CSV avec une seule confirmation).
 *
 * Contexte HMAC propre ("jeton-export-pilotage"), distinct de ceux de
 * l'export patient (F-CIT-13), de l'export du journal d'audit (F-AUD-01) et
 * de la re-authentification de signature d'ordonnance (F-PRE-04) : un jeton
 * de l'un ne vaut jamais pour un autre (voir jeton-export.test.ts). Il est
 * exige par les routes /api/pilotage/export/{csv,pdf} et par
 * exporterRepartitionCSV (analytics/actions.ts, portee "national").
 *
 * Module sans "use server" : ses fonctions sont synchrones et ne doivent pas
 * être des points d'entrée.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import type { MotifExport, PorteeExportPilotage } from "./exports-constantes";

export const DUREE_VALIDITE_JETON_EXPORT_SECONDES = 5 * 60;

export interface ContenuJetonExport {
  utilisateurId: string;
  sessionId: string;
  portee: PorteeExportPilotage;
  motif: MotifExport;
  motifTexte?: string;
}

interface ContenuSigne {
  u: string;
  s: string;
  p: PorteeExportPilotage;
  m: MotifExport;
  t: string;
  e: number;
}

function signer(donneeBase64: string): string {
  return createHmac("sha256", `${getEnv().NEXTAUTH_SECRET}:jeton-export-pilotage`).update(donneeBase64).digest("base64url");
}

function egalConstant(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

/** `maintenantMs` est injectable pour les tests. */
export function creerJetonExport(contenu: ContenuJetonExport, maintenantMs: number = Date.now()): string {
  const signe: ContenuSigne = {
    u: contenu.utilisateurId,
    s: contenu.sessionId,
    p: contenu.portee,
    m: contenu.motif,
    t: contenu.motifTexte ?? "",
    e: Math.floor(maintenantMs / 1000) + DUREE_VALIDITE_JETON_EXPORT_SECONDES,
  };
  const donnee = Buffer.from(JSON.stringify(signe), "utf8").toString("base64url");
  return `${donnee}.${signer(donnee)}`;
}

/**
 * Renvoie le contenu si le jeton est authentique, non expiré et lié à cet
 * utilisateur, cette session et cette portée ; null dans tous les autres cas
 * (aucune distinction entre les causes, pour ne rien apprendre à un
 * appelant qui devine).
 */
export function verifierJetonExport(
  jeton: string | null | undefined,
  attendu: { utilisateurId: string; sessionId: string; portee: PorteeExportPilotage },
  maintenantMs: number = Date.now()
): ContenuJetonExport | null {
  if (!jeton) return null;

  const morceaux = jeton.split(".");
  if (morceaux.length !== 2) return null;
  const [donnee, signature] = morceaux;

  if (!egalConstant(signature, signer(donnee))) return null;

  let signe: ContenuSigne;
  try {
    signe = JSON.parse(Buffer.from(donnee, "base64url").toString("utf8")) as ContenuSigne;
  } catch {
    return null;
  }

  if (typeof signe.e !== "number" || Math.floor(maintenantMs / 1000) > signe.e) return null;
  if (signe.u !== attendu.utilisateurId || signe.s !== attendu.sessionId || signe.p !== attendu.portee) return null;

  return {
    utilisateurId: signe.u,
    sessionId: signe.s,
    portee: signe.p,
    motif: signe.m,
    motifTexte: signe.t || undefined,
  };
}
