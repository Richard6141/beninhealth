"use server";

/**
 * Module verification : fiche d'identite affichee apres le scan du QR code
 * personnel d'un compte (voir getMonQrCode, consomme par
 * src/app/app/profil/FormulaireQrCode.tsx, et getFicheVerification, consomme
 * par src/app/app/verification/[userId]/page.tsx).
 *
 * Zero Trust : l'id cible transmis dans l'URL (encode dans le QR, donc
 * potentiellement partage ou photographie par n'importe qui) n'est jamais
 * fiable en soi. Deux niveaux de contenu selon le type de compte cible :
 * - Patient : donnees medicales, visibles uniquement par le patient
 *   lui-meme ou par un professionnel detenant un Consentement actif pour lui
 *   (authentification obligatoire, jamais d'acces sans compte ni sans
 *   consentement, choix explicite du produit plutot qu'une carte d'urgence
 *   publique). Aucun consentement -> fiche introuvable, comme si le compte
 *   n'existait pas (pas de fuite d'existence de compte).
 * - Professionnel de sante / administratif : badge de verification
 *   (identite, role, etablissement, statut), sans donnee medicale. Visible
 *   par tout utilisateur authentifie de la plateforme, sans condition
 *   supplementaire.
 */

import { headers } from "next/headers";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { NomRole } from "@/types";

export interface ContactUrgenceFiche {
  nom: string;
  telephone: string;
  lienParente: string;
}

export type FicheVerification =
  | {
      type: "patient";
      nomComplet: string;
      identifiantSante: string;
      dateNaissance: string; // ISO
      sexe: string;
      groupeSanguin: string;
      allergies: string[];
      antecedents: string[];
      maladiesChroniques: string[];
      contactsUrgence: ContactUrgenceFiche[];
    }
  | {
      type: "professionnel";
      nomComplet: string;
      role: NomRole;
      specialite: string;
      numeroProfessionnel: string;
      etablissementNom: string;
      statutValidation: string;
    }
  | {
      type: "compte";
      nomComplet: string;
      role: NomRole;
      email: string;
    };

/** Convertit une chaine JSON de tableau (telle que stockee en base) en tableau de chaines. */
function parseListeJSON(valeur: string): string[] {
  try {
    const donnees: unknown = JSON.parse(valeur);
    return Array.isArray(donnees)
      ? donnees.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/** Convertit une chaine JSON de contacts d'urgence en tableau type. */
function parseContactsUrgence(valeur: string): ContactUrgenceFiche[] {
  try {
    const donnees: unknown = JSON.parse(valeur);
    if (!Array.isArray(donnees)) return [];
    return donnees
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        nom: typeof item.nom === "string" ? item.nom : "",
        telephone: typeof item.telephone === "string" ? item.telephone : "",
        lienParente: typeof item.lienParente === "string" ? item.lienParente : "",
      }));
  } catch {
    return [];
  }
}

function nomComplet(utilisateur: { nom: string; prenom: string }): string {
  return `${utilisateur.prenom} ${utilisateur.nom}`;
}

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    const adresse =
      listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? null;
    return adresse ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/**
 * Reconstruit l'URL absolue de la plateforme a partir des en-tetes de la
 * requete courante (aucune variable d'environnement d'URL publique n'est
 * configuree pour ce MVP). Meme prudence defensive que
 * adresseTechniqueCourante() ailleurs dans le projet : jamais d'echec bloquant
 * si un en-tete est absent.
 */
async function urlAbsolue(chemin: string): Promise<string> {
  const listeEntetes = await headers();
  const hote = listeEntetes.get("host") ?? "localhost:3000";
  const protocole = listeEntetes.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
  return `${protocole}://${hote}${chemin}`;
}

/**
 * Genere le QR code personnel de l'utilisateur connecte : encode l'URL de sa
 * propre fiche de verification (/app/verification/[userId]). Retourne un
 * data URL (image/png en base64), meme approche que
 * src/modules/identity/mfa.ts pour le QR d'activation MFA.
 */
export async function getMonQrCode(): Promise<{ url: string; dataUrl: string } | null> {
  const session = await getSession();
  if (!session) return null;

  const url = await urlAbsolue(`/app/verification/${session.userId}`);
  const dataUrl = await QRCode.toDataURL(url, { width: 240, margin: 1 });

  return { url, dataUrl };
}

/**
 * Fiche de verification d'un compte, apres scan de son QR code. Voir la
 * docstring de module pour les regles d'acces exactes par type de compte.
 */
export async function getFicheVerification(cibleUserId: string): Promise<FicheVerification | null> {
  const session = await getSession();
  if (!session) return null;

  const cible = await prisma.user.findUnique({
    where: { id: cibleUserId },
    include: {
      roles: true,
      patient: true,
      professionnel: { include: { etablissement: true } },
    },
  });

  if (!cible) return null;

  const rolePrincipal = (cible.roles[0]?.nom ?? "patient") as NomRole;

  if (cible.patient) {
    const estSoiMeme = cible.id === session.userId;

    if (!estSoiMeme) {
      const consentement = await prisma.consentement.findUnique({
        where: {
          patientId_acteurAutoriseId: {
            patientId: cible.patient.id,
            acteurAutoriseId: session.userId,
          },
        },
      });

      if (
        !consentement ||
        consentement.statut !== "actif" ||
        (consentement.dateFin !== null && consentement.dateFin <= new Date())
      ) {
        return null;
      }

      // F-CIT-12 (cahier des charges) : le patient doit pouvoir voir qui a
      // consulte son dossier. Seuls les acces d'un tiers sont journalises ici
      // (jamais la propre consultation du patient de sa propre fiche, non
      // pertinente pour cet historique). Journalise apres la verification du
      // consentement : un acces refuse n'est pas un acces reussi a tracer ici.
      await prisma.journalAudit.create({
        data: {
          utilisateurId: session.userId,
          action: "consultation_fiche_verification",
          donneeConcernee: `patient:${cible.patient.id}`,
          adresseTechnique: await adresseTechniqueCourante(),
          justification: `Fiche de verification consultee via QR ou lien direct (consentement ${consentement.typeAcces})`,
        },
      });
    }

    const patient = cible.patient;
    return {
      type: "patient",
      nomComplet: nomComplet(cible),
      identifiantSante: patient.identifiantSante,
      dateNaissance: patient.dateNaissance.toISOString(),
      sexe: patient.sexe,
      groupeSanguin: patient.groupeSanguin,
      allergies: parseListeJSON(patient.allergies),
      antecedents: parseListeJSON(patient.antecedents),
      maladiesChroniques: parseListeJSON(patient.maladiesChroniques),
      contactsUrgence: parseContactsUrgence(patient.contactsUrgence),
    };
  }

  if (cible.professionnel) {
    return {
      type: "professionnel",
      nomComplet: nomComplet(cible),
      role: rolePrincipal,
      specialite: cible.professionnel.specialite,
      numeroProfessionnel: cible.professionnel.numeroProfessionnel,
      etablissementNom: cible.professionnel.etablissement.nom,
      statutValidation: cible.professionnel.statutValidation,
    };
  }

  // Compte sans profil Patient ni ProfessionnelSante : admin_national pour
  // l'instant (voir la limite documentee dans src/modules/identity/identifiants.ts).
  return {
    type: "compte",
    nomComplet: nomComplet(cible),
    role: rolePrincipal,
    email: cible.email,
  };
}
