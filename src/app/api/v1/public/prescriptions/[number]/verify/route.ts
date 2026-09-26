/**
 * API publique de verification d'ordonnance (F-PRE-06 du pack, chapitre 11).
 * Aucune authentification requise (role "Tout le monde"). RG-PRE-41 : 30
 * requetes par minute et par adresse IP.
 */

import { NextResponse } from "next/server";
import { verifierOrdonnancePublique } from "@/modules/prescription/verification-publique";
import { verifierEtIncrementerDebit } from "@/lib/limite-debit";

const LIMITE_PAR_MINUTE = 30;
const FENETRE_MS = 60_000;

function adresseIpDepuisRequete(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "inconnue";
}

export async function GET(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const adresseIp = adresseIpDepuisRequete(request);
  const { autorise } = verifierEtIncrementerDebit(`verify-ordonnance:${adresseIp}`, LIMITE_PAR_MINUTE, FENETRE_MS);
  if (!autorise) {
    return NextResponse.json({ error: "Trop de vérifications. Réessayez dans une minute." }, { status: 429 });
  }

  const { number } = await params;
  const url = new URL(request.url);
  const cle = url.searchParams.get("k");

  const resultat = await verifierOrdonnancePublique(number, cle);
  if (!resultat) {
    return NextResponse.json({ error: "Ordonnance introuvable." }, { status: 404 });
  }

  return NextResponse.json(resultat);
}
