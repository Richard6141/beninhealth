"use server";

/**
 * F-AUTH-07 du pack, "Choisir son espace actif". Un compte peut etre citoyen
 * et professionnel (ou administrateur) : chaque role est un espace, et
 * l'utilisateur doit toujours savoir dans lequel il agit. Le choix est
 * enregistre dans la session cote serveur (SessionActive.espaceActif, lu par
 * getSession(), RG-AUTH-60) : jamais transmis par le navigateur, jamais dans
 * l'URL. Le changement est trace dans JournalAudit (CONTEXT_SWITCH du pack).
 *
 * Limite assumee (voir espaces-regles.ts) : un espace est un role, un compte
 * n'a qu'un profil professionnel donc qu'un etablissement.
 */

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import type { NomRole } from "@/types";
import {
  LIBELLES_ESPACE,
  accueilDeLEspace,
  estNomRole,
  estRoleProfessionnel,
  type EspaceUtilisateur,
} from "./espaces-regles";

export interface ChangementEspaceState {
  error: string | null;
  success: boolean;
  /** Page d'accueil de l'espace choisi, a ouvrir apres le changement. */
  redirection?: string;
}

const ORDRE_ESPACES = [
  "patient",
  "medecin",
  "infirmier",
  "agent_communautaire",
  "pharmacien",
  "laboratoire",
  "admin_etablissement",
  "admin_national",
] as const;

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/** Roles du compte lus en base (source de verite : session.roles ne contient que l'espace actif une fois un espace choisi). */
async function rolesDuCompte(userId: string): Promise<NomRole[]> {
  const lignes = await prisma.userRole.findMany({ where: { userId }, select: { nom: true } });
  return lignes.map((ligne) => ligne.nom).filter(estNomRole);
}

/** Espaces du compte connecte, dans un ordre stable, avec l'espace actif marque. Vide sans session. */
export async function getMesEspaces(): Promise<EspaceUtilisateur[]> {
  const session = await getSession();

  if (!session) {
    return [];
  }

  const rolesDuCompteLus = await rolesDuCompte(session.userId);
  // Le role qui pilote le menu (layout) est le premier des roles de la session.
  const actif = session.roles[0] ?? null;
  const aUnRoleProfessionnel = rolesDuCompteLus.some((role) => estRoleProfessionnel(role));

  const professionnel = aUnRoleProfessionnel
    ? await prisma.professionnelSante.findUnique({
        where: { userId: session.userId },
        select: { etablissement: { select: { nom: true } } },
      })
    : null;

  return ORDRE_ESPACES.filter((role) => rolesDuCompteLus.includes(role)).map((role) => ({
    role,
    libelle: LIBELLES_ESPACE[role],
    etablissementNom: estRoleProfessionnel(role) ? (professionnel?.etablissement.nom ?? null) : null,
    accueil: accueilDeLEspace(role),
    actif: role === actif,
  }));
}

/**
 * Change l'espace actif de la session courante. Verifie que le role est bien
 * un role du compte (jeton signe), et pour un espace professionnel que le
 * profil n'est pas refuse et que l'affiliation n'est pas suspendue ou
 * terminee. Le second facteur est deja passe pour qu'une session existe.
 */
export async function changerEspaceAction(
  prevState: ChangementEspaceState,
  formData: FormData
): Promise<ChangementEspaceState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expirée. Veuillez vous reconnecter.", success: false };
  }

  const demande = formData.get("espace");

  if (!estNomRole(demande) || !(await rolesDuCompte(session.userId)).includes(demande)) {
    return { error: "Cet espace n'existe pas pour votre compte.", success: false };
  }

  if (!session.sessionId) {
    return { error: "Votre session est ancienne : reconnectez-vous pour choisir un espace.", success: false };
  }

  const actuel = session.roles[0] ?? null;

  if (demande === actuel) {
    return { error: null, success: true, redirection: accueilDeLEspace(demande) };
  }

  if (estRoleProfessionnel(demande)) {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
      select: { id: true, statutValidation: true },
    });

    if (!professionnel || professionnel.statutValidation === "rejete") {
      return { error: "Votre profil professionnel n'est pas validé : cet espace est indisponible.", success: false };
    }

    const affiliations = await prisma.affiliationProfessionnelle.findMany({
      where: { professionnelId: professionnel.id, roleNom: demande },
      select: { statut: true },
    });

    if (affiliations.length > 0 && !affiliations.some((affiliation) => affiliation.statut === "active")) {
      return { error: "Votre affiliation à cet espace n'est plus active.", success: false };
    }
  }

  const adresseTechnique = await adresseTechniqueCourante();

  const modifiees = await prisma.$transaction(async (tx) => {
    const resultat = await tx.sessionActive.updateMany({
      where: { id: session.sessionId, userId: session.userId },
      data: { espaceActif: demande },
    });

    if (resultat.count !== 1) return false;

    await journaliser(
      {
        utilisateurId: session.userId,
        action: "changement_espace",
        donneeConcernee: `utilisateur:${session.userId}`,
        adresseTechnique,
        justification: `Espace actif : ${actuel ? LIBELLES_ESPACE[actuel] : "aucun"} vers ${LIBELLES_ESPACE[demande]}`,
      },
      tx
    );

    return true;
  });

  if (!modifiees) {
    return { error: "Votre session n'existe plus : reconnectez-vous.", success: false };
  }

  return { error: null, success: true, redirection: accueilDeLEspace(demande) };
}
