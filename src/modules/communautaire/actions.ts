"use server";

/**
 * Server Actions du module communautaire : visites de terrain menees par un
 * agent communautaire (role agent_communautaire). Meme principe Zero Trust
 * que les autres modules (voir src/modules/laboratoire/actions.ts) : l'agent
 * courant est toujours derive de getSession(), jamais d'un id transmis par le
 * client. Le beneficiaire d'une visite n'a pas toujours de dossier Patient
 * enregistre (population non encore couverte) : ce module ne lit et n'ecrit
 * jamais de dossier Patient, conformement a la matrice RBAC ou
 * agent_communautaire ne detient aucune permission read:patient
 * (src/security/permissions.ts). Toute creation est tracee dans JournalAudit.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import type { TypeVisiteCommunautaire } from "@/types";

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface SuiviCommunautaireActionState {
  error: string | null;
  success: boolean;
  // F-COM-02 (docs/audit-cote-agent-communautaire.md) : version reduite, sans
  // fiche beneficiaire ni modele Prisma dedie. Rempli quand un nom proche a
  // deja ete enregistre par ce meme agent ; purement informatif, la visite
  // est tout de meme creee (avertissement, jamais un blocage).
  avertissementDoublonBeneficiaire?: string | null;
}

/** Resume d'une visite de suivi communautaire, pret a afficher. */
export interface SuiviCommunautaireResume {
  id: string;
  beneficiaireNom: string;
  typeVisite: TypeVisiteCommunautaire;
  dateVisite: string; // ISO
  localisation: string;
  notes: string;
}

const TYPES_VISITE = [
  "vaccination",
  "depistage",
  "suivi_grossesse",
  "sensibilisation",
  "autre",
] as const;

const schemaSuivi = z.object({
  beneficiaireNom: z.string().trim().min(1, "Le nom du beneficiaire est obligatoire."),
  typeVisite: z.enum(TYPES_VISITE, {
    message: "Le type de visite est invalide.",
  }),
  localisation: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
});

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

/** Lit un champ texte d'un FormData, jamais null (chaine vide si absent). */
function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/** Meme normalisation que normaliserPourComparaison dans src/modules/identity/actions.ts (non exportee, "use server" oblige). */
function normaliserPourComparaison(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Recupere le profil ProfessionnelSante du titulaire de la session courante, ou null si absent. */
async function professionnelDeLaSessionCourante() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  return prisma.professionnelSante.findUnique({ where: { userId: session.userId } });
}

/**
 * Enregistre une visite de suivi communautaire a l'initiative de l'agent
 * connecte (derive de getSession(), jamais d'un id transmis par le client).
 * Reserve au role agent_communautaire (create:suivi_communautaire, voir
 * src/security/permissions.ts). patientId reste toujours nul dans ce module :
 * agent_communautaire ne detient aucun droit read:patient, le beneficiaire
 * est identifie par son nom declare sur le terrain (beneficiaireNom).
 */
export async function creerSuiviCommunautaireAction(
  prevState: SuiviCommunautaireActionState,
  formData: FormData
): Promise<SuiviCommunautaireActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "suivi_communautaire"))) {
    return { error: "Action reservee aux agents communautaires.", success: false };
  }

  const validation = schemaSuivi.safeParse({
    beneficiaireNom: texte(formData, "beneficiaireNom"),
    typeVisite: texte(formData, "typeVisite"),
    localisation: texte(formData, "localisation"),
    notes: texte(formData, "notes"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de visite invalides."),
      success: false,
    };
  }

  const { beneficiaireNom, typeVisite, localisation, notes } = validation.data;

  try {
    const agent = await professionnelDeLaSessionCourante();

    if (!agent) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    // F-COM-02, version reduite (voir SuiviCommunautaireActionState) : simple
    // rapprochement de nom normalise parmi les visites deja enregistrees par
    // ce meme agent, jamais un vrai enregistrement de personne (pas de fiche
    // beneficiaire, pas de village/menage, voir docs/audit-cote-agent-communautaire.md).
    const beneficiaireNomNormalise = normaliserPourComparaison(beneficiaireNom);
    const visitesExistantes = await prisma.suiviCommunautaire.findMany({
      where: { agentId: agent.id },
      select: { beneficiaireNom: true },
    });
    const doublonProbable = visitesExistantes.some(
      (visite) => normaliserPourComparaison(visite.beneficiaireNom) === beneficiaireNomNormalise
    );

    const suiviCree = await prisma.$transaction(async (tx) => {
      const cree = await tx.suiviCommunautaire.create({
        data: {
          agentId: agent.id,
          etablissementId: agent.etablissementId,
          beneficiaireNom,
          typeVisite,
          localisation,
          notes,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation",
          donneeConcernee: `suivi_communautaire:${cree.id}`,
          adresseTechnique,
          justification: `Visite communautaire enregistree pour ${beneficiaireNom}`,
        },
        tx
      );

      return cree;
    });

    return {
      error: null,
      success: suiviCree !== null,
      avertissementDoublonBeneficiaire: doublonProbable
        ? `Une visite au nom de "${beneficiaireNom}" existe déjà dans votre historique. Vérifiez qu'il ne s'agit pas de la même personne.`
        : null,
    };
  } catch (erreur) {
    console.error("Erreur lors de l'enregistrement de la visite communautaire :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Recupere les visites de suivi communautaire enregistrees par l'agent
 * connecte (derive de getSession() -> ProfessionnelSante lie), de la plus
 * recente a la plus ancienne.
 */
export async function getMesSuivisCommunautaires(): Promise<SuiviCommunautaireResume[]> {
  const agent = await professionnelDeLaSessionCourante();

  if (!agent) {
    return [];
  }

  const suivis = await prisma.suiviCommunautaire.findMany({
    where: { agentId: agent.id },
    orderBy: { dateVisite: "desc" },
  });

  return suivis.map((suivi) => ({
    id: suivi.id,
    beneficiaireNom: suivi.beneficiaireNom,
    typeVisite: suivi.typeVisite as TypeVisiteCommunautaire,
    dateVisite: suivi.dateVisite.toISOString(),
    localisation: suivi.localisation,
    notes: suivi.notes,
  }));
}
