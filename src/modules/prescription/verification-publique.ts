/**
 * Verification publique d'une ordonnance par QR code (F-PRE-06, chapitre 11
 * du pack). Contrairement au jeton de telechargement de F-CIT-06 (usage
 * unique, 60 secondes, store en memoire), la cle de verification imprimee
 * sur le QR doit rester valable aussi longtemps que le papier existe : elle
 * est donc deterministe (HMAC derive du secret de session existant,
 * NEXTAUTH_SECRET, jamais stockee ni generee a part), pas un jeton en base
 * ni en memoire. RG-PRE-40 : sans cle valide, l'ordonnance est "introuvable"
 * (le numero seul ne suffit jamais a verifier).
 *
 * RG-PRE-05 (aucune donnee patient/medicament sur cette page publique) est
 * assure structurellement : cette fonction ne renvoie jamais le patient, les
 * lignes de prescription ni le motif, seulement les 6 champs de l'affichage
 * minimal du pack.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";

/** Duree de validite par defaut d'une ordonnance (parametre du pack, section 11 : "3 mois par defaut [DECISION a confirmer avec la reglementation pharmaceutique]"). */
const JOURS_VALIDITE_ORDONNANCE = 90;

function cleHmac(numero: string, prescriptionId: string): string {
  const hmac = createHmac("sha256", `${getEnv().NEXTAUTH_SECRET}:verification-ordonnance`);
  hmac.update(`${numero}:${prescriptionId}`);
  return hmac.digest("base64url").slice(0, 16);
}

/** Cle a encoder dans le QR (imprimee sur le PDF, section 11.2 du pack). */
export function genererCleVerificationOrdonnance(numero: string, prescriptionId: string): string {
  return cleHmac(numero, prescriptionId);
}

function clesEgalesConstant(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export type StatutAffichePublic = "valable" | "delivree" | "annulee" | "expiree";

export interface OrdonnanceVerifiee {
  numero: string;
  dateEmission: string;
  prescripteurNomComplet: string;
  etablissementNom: string;
  statutAffiche: StatutAffichePublic;
  /** Present uniquement si statutAffiche === "valable". */
  dateValidite?: string;
}

/**
 * Verifie le couple (numero, cle) et renvoie l'affichage minimal public si
 * valide, null sinon (RG-PRE-40 : cle absente/incorrecte OU numero inconnu
 * renvoient le meme null, jamais de distinction qui aiderait a deviner un
 * numero valide par tatonnement).
 */
export async function verifierOrdonnancePublique(numero: string, cle: string | null): Promise<OrdonnanceVerifiee | null> {
  if (!cle) return null;

  const prescription = await prisma.prescription.findUnique({
    where: { numero },
    select: {
      id: true,
      numero: true,
      date: true,
      statut: true,
      medecinPrescripteur: {
        select: {
          user: { select: { nom: true, prenom: true } },
          etablissement: { select: { nom: true } },
        },
      },
    },
  });

  if (!prescription) return null;

  const cleAttendue = cleHmac(prescription.numero, prescription.id);
  if (!clesEgalesConstant(cle, cleAttendue)) return null;

  const dateValidite = new Date(prescription.date);
  dateValidite.setDate(dateValidite.getDate() + JOURS_VALIDITE_ORDONNANCE);
  const expiree = new Date() > dateValidite;

  let statutAffiche: StatutAffichePublic;
  if (prescription.statut === "annulee") {
    statutAffiche = "annulee";
  } else if (prescription.statut === "delivree") {
    statutAffiche = "delivree";
  } else if (expiree) {
    statutAffiche = "expiree";
  } else {
    statutAffiche = "valable";
  }

  return {
    numero: prescription.numero,
    dateEmission: prescription.date.toISOString().slice(0, 10),
    prescripteurNomComplet: `${prescription.medecinPrescripteur.user.prenom} ${prescription.medecinPrescripteur.user.nom}`,
    etablissementNom: prescription.medecinPrescripteur.etablissement.nom,
    statutAffiche,
    dateValidite: statutAffiche === "valable" ? dateValidite.toISOString().slice(0, 10) : undefined,
  };
}
