"use server";

/**
 * Carte sante numerique (F-CIT-05 du pack) : permet a l'accueil d'un
 * etablissement de verifier la presence recente du patient sans saisie,
 * via un QR a validite tres courte. Distinct du QR personnel permanent
 * deja existant (src/modules/verification/actions.ts, getMonQrCode) : ce
 * dernier encode une URL statique (/app/verification/[userId]) qui ne
 * prouve aucune fraicheur (un QR photographie une fois resterait valable
 * indefiniment, seul le controle de consentement protege la donnee
 * medicale derriere) - inadapte a l'objectif de F-CIT-05 ("prouver la
 * presence"), non modifie ici pour ne pas perturber cet usage different
 * (badge d'identite, sans exigence de fraicheur).
 *
 * RG-CIT-40 : jeton temporaire (5 minutes, usage unique), jamais
 * l'identifiant sante en clair ni de donnee medicale dans le QR lui-meme -
 * seul un jeton opaque y est encode. Store en memoire (meme technique que
 * src/modules/prescription/jetons-telechargement.ts, meme limite assumee :
 * ne survivrait pas a un redemarrage ni a une instance multiple).
 *
 * Perimetre reduit assume : pas de mode hors ligne (F-CIT-05, etape 3, QR
 * de secours identifiant seul) ni d'impression PDF (etape 4, P1) - les deux
 * supposent une infrastructure ou une priorite hors de portee ce soir.
 */

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";

const DUREE_JETON_MS = 5 * 60 * 1000;

interface DonneesJetonCarte {
  patientId: string;
  expiration: number;
}

const jetons = new Map<string, DonneesJetonCarte>();

function nettoyerJetonsExpires(): void {
  const maintenant = Date.now();
  for (const [jeton, donnees] of jetons) {
    if (donnees.expiration < maintenant) {
      jetons.delete(jeton);
    }
  }
}

async function urlAbsolue(chemin: string): Promise<string> {
  const listeEntetes = await headers();
  const hote = listeEntetes.get("host") ?? "localhost:3000";
  const protocole = listeEntetes.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
  return `${protocole}://${hote}${chemin}`;
}

export interface JetonCarteSante {
  dataUrlQr: string;
  expirationMs: number;
}

/**
 * Genere un nouveau jeton de carte sante pour le patient connecte (RG-CIT-40),
 * valable 5 minutes, usage unique. A rappeler par le client toutes les 5
 * minutes (ou apres consommation) pour renouveler le QR affiche.
 */
export async function genererJetonCarteSanteAction(): Promise<JetonCarteSante | null> {
  const session = await getSession();

  if (!session || !session.roles.includes("patient")) {
    return null;
  }

  const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

  if (!patient) {
    return null;
  }

  nettoyerJetonsExpires();
  const jeton = randomUUID();
  const expiration = Date.now() + DUREE_JETON_MS;
  jetons.set(jeton, { patientId: patient.id, expiration });

  const url = await urlAbsolue(`/app/carte-sante/verifier?jeton=${jeton}`);
  const dataUrlQr = await QRCode.toDataURL(url, { width: 240, margin: 1 });

  return { dataUrlQr, expirationMs: expiration };
}

export type StatutVerificationCarte =
  | { statut: "valide"; nomComplet: string; identifiantSante: string; dateNaissance: string; sexe: string }
  | { statut: "expire_ou_utilise" }
  | { statut: "refuse" };

/**
 * Consomme un jeton de carte sante (usage unique, RG-CIT-40/41) : la toute
 * premiere consultation reussie renvoie l'identite minimale du patient
 * (jamais de donnee medicale, jamais l'identifiant en clair transmis avant
 * cet appel), toute consultation suivante du meme jeton echoue (CA-1).
 * Reserve a un utilisateur authentifie de la plateforme (professionnel ou
 * administratif) : jamais un acces public anonyme.
 */
export async function verifierCarteSanteAction(jeton: string): Promise<StatutVerificationCarte> {
  const session = await getSession();

  if (!session) {
    return { statut: "refuse" };
  }

  nettoyerJetonsExpires();
  const donnees = jetons.get(jeton);

  if (!donnees || donnees.expiration < Date.now()) {
    return { statut: "expire_ou_utilise" };
  }

  jetons.delete(jeton);

  const patient = await prisma.patient.findUnique({
    where: { id: donnees.patientId },
    include: { user: true },
  });

  if (!patient) {
    return { statut: "expire_ou_utilise" };
  }

  const adresseTechnique = await (async () => {
    try {
      const listeEntetes = await headers();
      return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
    } catch {
      return "inconnue";
    }
  })();

  await journaliser({
    utilisateurId: session.userId,
    action: "verification_carte_sante",
    donneeConcernee: `patient:${patient.id}`,
    adresseTechnique,
    justification: "Verification de presence via la carte sante numerique (F-CIT-05).",
  });

  return {
    statut: "valide",
    nomComplet: `${patient.user.prenom} ${patient.user.nom}`,
    identifiantSante: patient.identifiantSante,
    dateNaissance: patient.dateNaissance.toISOString(),
    sexe: patient.sexe,
  };
}
