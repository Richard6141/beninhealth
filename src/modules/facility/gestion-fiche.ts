"use server";

/**
 * Gestion de la fiche de son propre etablissement par l'admin_etablissement
 * (F-ETA-03 du pack). Nouveau fichier, aucune modification de
 * src/modules/facility/actions.ts (partage cette nuit avec d'autres
 * chantiers).
 *
 * Perimetre du pack respecte a la lettre sur ce qui est modifiable :
 * "Ce qu'il NE PEUT PAS modifier (reserve a l'administrateur plateforme,
 * F-ADM-02) : nom officiel, type, niveau, rattachement geographique,
 * coordonnees GPS, statut." Latitude/longitude sont donc explicitement
 * EXCLUES ici (contrairement a une premiere suggestion recue, corrigee
 * apres relecture du pack).
 *
 * Perimetre reduit et assume par rapport au reste de la fiche F-ETA-03,
 * faute des champs correspondants dans le schema actuel : horaires
 * d'ouverture par jour, confirmation automatique/manuelle par service,
 * fermetures exceptionnelles ne sont pas construits (aucun champ Prisma
 * pour ces notions aujourd'hui). RG-ETA-20 (verifier les rendez-vous futurs
 * avant de desactiver un service) non implementee : servicesDisponibles
 * est une simple liste de libelles, sans lien structurel avec RendezVous
 * (aucun champ "service" sur ce modele), donc aucun moyen fiable de savoir
 * quels rendez-vous dependent d'un service donne. RG-ETA-21 (journalisation)
 * est assuree via journaliser() a chaque modification ; le versionnement
 * au-dela de la trace d'audit elle-meme n'est pas construit (meme limite
 * assumee que RG-ADM-21 ce soir).
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { journaliser } from "@/modules/audit/journaliser";

/** Recupere l'etablissement du titulaire de la session courante (role admin_etablissement), ou null (Zero Trust, jamais d'id transmis par le client). */
async function etablissementDeLaSessionCourante() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const professionnel = await prisma.professionnelSante.findUnique({
    where: { userId: session.userId },
  });

  if (!professionnel) {
    return null;
  }

  return prisma.etablissementSanitaire.findUnique({
    where: { id: professionnel.etablissementId },
  });
}

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/** Convertit une zone de texte (une entree par ligne) en tableau JSON, meme convention que src/modules/identity/gestion-comptes.ts. */
function listeEnJSON(valeurBrute: string): string {
  const elements = valeurBrute
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.length > 0);
  return JSON.stringify(elements);
}

function listeDepuisJSON(valeurJSON: string): string {
  try {
    const donnees: unknown = JSON.parse(valeurJSON);
    return Array.isArray(donnees) ? donnees.filter((v): v is string => typeof v === "string").join("\n") : "";
  } catch {
    return "";
  }
}

/** Fiche modifiable de l'etablissement de l'admin connecte (champs F-ETA-03 uniquement, jamais le nom/type/niveau/territoire/GPS/statut, reserves a F-ADM-02). */
export interface FicheEtablissement {
  nom: string;
  sigle: string;
  adresse: string;
  telephoneEtablissement: string;
  emailEtablissement: string;
  capacite: number;
  servicesDisponiblesTexte: string;
}

/** Fiche de l'etablissement de l'admin_etablissement connecte, ou null (session absente, role incorrect, ou aucun profil professionnel associe). */
export async function getFicheEtablissement(): Promise<FicheEtablissement | null> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "etablissement_sanitaire"))) {
    return null;
  }

  const etablissement = await etablissementDeLaSessionCourante();

  if (!etablissement) {
    return null;
  }

  return {
    nom: etablissement.nom,
    sigle: etablissement.sigle ?? "",
    adresse: etablissement.adresse ?? "",
    telephoneEtablissement: etablissement.telephoneEtablissement ?? "",
    emailEtablissement: etablissement.emailEtablissement ?? "",
    capacite: etablissement.capacite,
    servicesDisponiblesTexte: listeDepuisJSON(etablissement.servicesDisponibles),
  };
}

export interface MettreAJourFicheActionState {
  error: string | null;
  success: boolean;
}

const schemaFiche = z.object({
  sigle: z.string().trim().optional().default(""),
  adresse: z.string().trim().optional().default(""),
  telephoneEtablissement: z.string().trim().optional().default(""),
  emailEtablissement: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((v) => v.length === 0 || z.string().email().safeParse(v).success, {
      message: "Adresse e-mail invalide.",
    }),
  capacite: z.coerce.number({ message: "La capacite doit etre un nombre." }).int().nonnegative(
    "La capacite ne peut pas etre negative."
  ),
  servicesDisponibles: z.string().trim().optional().default(""),
});

/**
 * Met a jour la fiche de l'etablissement de l'admin_etablissement connecte
 * (F-ETA-03). L'etablissement modifie est toujours celui derive de la
 * session, jamais un id transmis par le formulaire (Zero Trust). RG-ETA-21 :
 * journalise systematiquement.
 */
export async function mettreAJourFicheAction(
  prevState: MettreAJourFicheActionState,
  formData: FormData
): Promise<MettreAJourFicheActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "update", "etablissement_sanitaire"))) {
    return { error: "Action reservee aux administrateurs d'etablissement.", success: false };
  }

  const validation = schemaFiche.safeParse({
    sigle: formData.get("sigle"),
    adresse: formData.get("adresse"),
    telephoneEtablissement: formData.get("telephoneEtablissement"),
    emailEtablissement: formData.get("emailEtablissement"),
    capacite: formData.get("capacite"),
    servicesDisponibles: formData.get("servicesDisponibles"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Donnees invalides.",
      success: false,
    };
  }

  try {
    const etablissement = await etablissementDeLaSessionCourante();

    if (!etablissement) {
      return { error: "Aucun etablissement associe a ce compte.", success: false };
    }

    const donnees = validation.data;
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.etablissementSanitaire.update({
        where: { id: etablissement.id },
        data: {
          sigle: donnees.sigle.length > 0 ? donnees.sigle : null,
          adresse: donnees.adresse.length > 0 ? donnees.adresse : null,
          telephoneEtablissement: donnees.telephoneEtablissement.length > 0 ? donnees.telephoneEtablissement : null,
          emailEtablissement: donnees.emailEtablissement.length > 0 ? donnees.emailEtablissement : null,
          capacite: donnees.capacite,
          servicesDisponibles: listeEnJSON(donnees.servicesDisponibles),
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "mise_a_jour_fiche_etablissement",
          donneeConcernee: `etablissement_sanitaire:${etablissement.id}`,
          adresseTechnique,
          justification: "Mise a jour de la fiche etablissement (coordonnees, services, capacite) par son administrateur.",
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la mise a jour de la fiche etablissement :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}
