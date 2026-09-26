"use server";

/**
 * F-RDV-04/05 du pack ("file du jour et enregistrement de l'arrivee",
 * "absences et cloture des passages",
 * docs/pack claude/specs/09-fiches-etablissements-rdv.md).
 *
 * Perimetre reduit assume, propose et documente ici (decision deleguee par
 * la session assignante, meme logique que PLATFORM_ADMIN/AUDITOR deja
 * adaptes ce soir) :
 * - Pas de role RECEPTIONIST (absent de ce depot, 8 roles seulement) :
 *   "Enregistrer une arrivee" est route vers admin_etablissement (deja
 *   responsable de son etablissement), la lecture de la file vers
 *   admin_etablissement et infirmier (deja titulaire de read:rendez_vous).
 * - Pas de nouveau modele "Visite" separe (base B4 du pack, contexte de
 *   soins) : etend RendezVous existant avec un statut "absent" (RG-RDV-33,
 *   NO_SHOW) et le champ heureArrivee (DateTime?, prisma/schema.prisma),
 *   qui distingue confirme-pas-arrive d'arrive-en-attente sans machine a
 *   etats dediee.
 * - Pas de contexte de soins avec fermeture 24h/72h (RG-RDV-41, notion
 *   absente de ce depot) : l'acces au dossier reste regi par le
 *   Consentement existant, independamment de l'arrivee ou non.
 * - Pas des 3 preuves de presence du pack (QR/SMS/piece d'identite,
 *   RG-ACC-20/21) : "Enregistrer une arrivee" est une action administrative
 *   simple ici, pas une preuve tracee d'identite du patient. Limite
 *   assumee.
 * - Pas de rafraichissement automatique 30s (P2) : rechargement manuel
 *   suffisant pour ce MVP.
 * - F-RDV-06 (rendez-vous pris au guichet) : fiche separee, non traitee
 *   ici.
 * - "Terminer la visite" n'a pas d'action dediee ici : valider une
 *   consultation (src/modules/clinical/actions.ts) passe deja
 *   RendezVous.statut a "termine" automatiquement, reutilise tel quel.
 *
 * RG-RDV-40 : tache planifiee horaire qui marque "absent" les rendez-vous
 * "confirme" dont l'heure est depassee de plus d'1h sans arrivee. Meme
 * patron que src/modules/facility/rappels-rendez-vous.ts /
 * src/modules/notification/purge.ts (setInterval en process, drapeau
 * global idempotent), cablee dans src/instrumentation.ts.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { TRANSITIONS, transitionnerRendezVous } from "./rendez-vous-etats";

function nomComplet(utilisateur: { nom: string; prenom: string }): string {
  return `${utilisateur.prenom} ${utilisateur.nom}`;
}

function nomCompletProfessionnel(utilisateur: { nom: string; prenom: string }): string {
  return `Dr. ${utilisateur.prenom} ${utilisateur.nom}`;
}

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/**
 * Etablissement du titulaire de la session courante, pour les roles admis a
 * consulter/agir sur la file du jour (admin_etablissement, infirmier).
 * Meme mecanisme que le reste de ce depot : derive de ProfessionnelSante,
 * jamais d'un id transmis par le client.
 */
async function etablissementAutorise(): Promise<string | null> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "rendez_vous"))) {
    return null;
  }

  const professionnel = await prisma.professionnelSante.findUnique({
    where: { userId: session.userId },
  });

  return professionnel?.etablissementId ?? null;
}

export interface RendezVousFileDuJourResume {
  id: string;
  heure: string; // ISO
  patientNomComplet: string;
  patientAvatarUrl: string | null;
  professionnelNomComplet: string | null;
  motif: string;
  statut: string;
  heureArrivee: string | null; // ISO
}

function bornesJourCourant(): { debut: Date; fin: Date } {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  return { debut, fin };
}

/**
 * File du jour de l'etablissement de la session courante (admin_etablissement
 * ou infirmier). Inclut "demande" dans le groupe "attendus" (encore
 * probable aujourd'hui) : seul "annule" est exclu, jamais affiche ici.
 */
export async function getFileDuJourEtablissement(): Promise<RendezVousFileDuJourResume[] | null> {
  const etablissementId = await etablissementAutorise();

  if (!etablissementId) {
    return null;
  }

  const { debut, fin } = bornesJourCourant();

  const rendezVous = await prisma.rendezVous.findMany({
    where: {
      etablissementId,
      date: { gte: debut, lte: fin },
      statut: { not: "annule" },
    },
    include: {
      patient: { include: { user: true } },
      professionnel: { include: { user: true } },
    },
    orderBy: { date: "asc" },
  });

  return rendezVous.map((rdv) => ({
    id: rdv.id,
    heure: rdv.date.toISOString(),
    patientNomComplet: nomComplet(rdv.patient.user),
    patientAvatarUrl: rdv.patient.user.avatarUrl,
    professionnelNomComplet: rdv.professionnel ? nomCompletProfessionnel(rdv.professionnel.user) : null,
    motif: rdv.motif,
    statut: rdv.statut,
    heureArrivee: rdv.heureArrivee ? rdv.heureArrivee.toISOString() : null,
  }));
}

export interface FileDuJourActionState {
  error: string | null;
  success: boolean;
}

const schemaArrivee = z.object({
  rendezVousId: z.string().trim().min(1, "Le rendez-vous est obligatoire."),
});

/**
 * Enregistre l'arrivee d'un patient (admin_etablissement uniquement,
 * "Enregistrer une arrivee" du pack, sans les 3 preuves de presence non
 * construites ici). Un rendez-vous encore "demande" est confirme au passage
 * (l'arrivee physique est une preuve d'intention au moins aussi forte
 * qu'une confirmation prealable par le professionnel) ; un rendez-vous
 * deja marque "absent" par la tache planifiee peut etre corrige de la
 * meme facon (le patient est visiblement arrive malgre le marquage
 * automatique). Refuse pour "termine"/"annule" (visite deja close).
 */
export async function enregistrerArriveeAction(
  prevState: FileDuJourActionState,
  formData: FormData
): Promise<FileDuJourActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "rendez_vous"))) {
    return { error: "Action reservee a l'administration de l'etablissement.", success: false };
  }

  const validation = schemaArrivee.safeParse({ rendezVousId: formData.get("rendezVousId") });

  if (!validation.success) {
    return { error: "Rendez-vous invalide.", success: false };
  }

  const { rendezVousId } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const rendezVous = await prisma.rendezVous.findUnique({ where: { id: rendezVousId } });

    if (!rendezVous || rendezVous.etablissementId !== professionnel.etablissementId) {
      return { error: "Ce rendez-vous est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const maintenant = new Date();

    const enregistree = await prisma.$transaction(async (tx) => {
      const transition = await transitionnerRendezVous(tx, rendezVousId, "enregistrer_arrivee", {
        donnees: { heureArrivee: maintenant },
      });
      if (!transition) return false;
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "arrivee_rendez_vous",
          donneeConcernee: `rendez_vous:${rendezVousId}`,
          adresseTechnique,
          justification: "Arrivee enregistree a l'accueil de l'etablissement",
        },
        tx
      );
      return true;
    });

    if (!enregistree) {
      return { error: TRANSITIONS.enregistrer_arrivee.refus, success: false };
    }

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'enregistrement de l'arrivee :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
