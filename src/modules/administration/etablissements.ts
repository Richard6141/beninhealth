"use server";

/**
 * Referentiel des etablissements (F-ADM-02 du pack), reserve a
 * PLATFORM_ADMIN dans le pack : ouvert a admin_national, meme adaptation
 * documentee que les autres fiches du chapitre 15 ce soir (F-ADM-06,
 * F-ADM-07, F-AUD-01 a 04).
 *
 * Perimetre honnete par rapport a la fiche complete :
 * - Pas d'import CSV (explicitement P1 dans le pack, coherent avec
 *   l'absence dans un MVP).
 * - Pas de controle "le point GPS doit etre dans la commune choisie" : ce
 *   depot n'a pas de geometrie de commune (voir la limite deja assumee dans
 *   src/modules/pilotage/referentiel-territoire.ts pour les zones
 *   sanitaires), donc aucune verification de contenance geographique n'est
 *   possible sans l'inventer.
 * - RG-ADM-01 (fermeture) : annule bien les rendez-vous futurs avec
 *   notification et ne touche jamais aux donnees cliniques (Consultation,
 *   Prescription, etc., jamais modifiees ni supprimees). "Terminer les
 *   affiliations" du personnel n'est PAS implemente : ProfessionnelSante
 *   n'a pas de notion d'affiliation historisee dans ce depot (un
 *   professionnel appartient a un seul etablissement, en permanence), donc
 *   il n'y a rien de reversible a "terminer" sans une refonte plus large.
 * - RG-ADM-02 (jamais de suppression) : aucune fonction de ce module ne
 *   supprime un EtablissementSanitaire, uniquement des transitions de statut.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";

const NIVEAUX_PYRAMIDE = ["central", "intermediaire", "peripherique"] as const;
const SECTEURS = ["public", "prive_lucratif", "prive_confessionnel", "associatif"] as const;
const STATUTS = ["brouillon", "actif", "suspendu", "ferme"] as const;

/** Transitions de statut permises (RG-ADM-02 : jamais de retour en arriere depuis "ferme"). */
const TRANSITIONS_AUTORISEES: Record<string, readonly string[]> = {
  brouillon: ["actif"],
  actif: ["suspendu", "ferme"],
  suspendu: ["actif", "ferme"],
  ferme: [],
};

async function estAdminNationalConnecte(): Promise<string | null> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "etablissement_sanitaire"))) {
    return null;
  }

  return session.userId;
}

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    const adresse = listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? null;
    return adresse ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

export interface EtablissementAdminResume {
  id: string;
  identifiant: string;
  nom: string;
  sigle: string | null;
  type: string;
  niveauPyramide: string | null;
  secteur: string | null;
  statut: string;
  departementNom: string | null;
  communeNom: string | null;
  zoneSanitaireNom: string | null;
  arrondissement: string | null;
  quartierVillage: string | null;
  adresse: string | null;
  telephoneEtablissement: string | null;
  emailEtablissement: string | null;
  identifiantExterneDhis2: string | null;
  capacite: number;
  nombreProfessionnels: number;
  etablissementParentNom: string | null;
}

/** Liste des etablissements pour l'ecran d'administration du referentiel. */
export async function getEtablissementsAdmin(): Promise<EtablissementAdminResume[]> {
  if (!(await estAdminNationalConnecte())) {
    return [];
  }

  const etablissements = await prisma.etablissementSanitaire.findMany({
    include: {
      commune: { include: { departement: true } },
      zoneSanitaire: true,
      etablissementParent: { select: { nom: true } },
      _count: { select: { professionnels: true } },
    },
    orderBy: { nom: "asc" },
  });

  return etablissements.map((etablissement) => ({
    id: etablissement.id,
    identifiant: etablissement.identifiant,
    nom: etablissement.nom,
    sigle: etablissement.sigle,
    type: etablissement.type,
    niveauPyramide: etablissement.niveauPyramide,
    secteur: etablissement.secteur,
    statut: etablissement.statut,
    departementNom: etablissement.commune?.departement.nom ?? null,
    communeNom: etablissement.commune?.nom ?? null,
    zoneSanitaireNom: etablissement.zoneSanitaire?.nom ?? null,
    arrondissement: etablissement.arrondissement,
    quartierVillage: etablissement.quartierVillage,
    adresse: etablissement.adresse,
    telephoneEtablissement: etablissement.telephoneEtablissement,
    emailEtablissement: etablissement.emailEtablissement,
    identifiantExterneDhis2: etablissement.identifiantExterneDhis2,
    capacite: etablissement.capacite,
    nombreProfessionnels: etablissement._count.professionnels,
    etablissementParentNom: etablissement.etablissementParent?.nom ?? null,
  }));
}

export interface DepartementOption {
  id: string;
  nom: string;
  communes: { id: string; nom: string }[];
}

/** Referentiel departement/commune, pour les selecteurs en cascade du formulaire. */
export async function getReferentielTerritoire(): Promise<DepartementOption[]> {
  if (!(await estAdminNationalConnecte())) {
    return [];
  }

  const departements = await prisma.departement.findMany({
    include: { communes: { orderBy: { nom: "asc" } } },
    orderBy: { nom: "asc" },
  });

  return departements.map((departement) => ({
    id: departement.id,
    nom: departement.nom,
    communes: departement.communes.map((commune) => ({ id: commune.id, nom: commune.nom })),
  }));
}

/**
 * Etablissement pouvant servir de parent hierarchique (ex. hopital d'un
 * laboratoire) : type expose pour l'ecran, qui derive la liste directement
 * de getEtablissementsAdmin() deja chargee (l'etablissement courant exclu)
 * plutot que de refaire un aller-retour serveur pour la meme donnee.
 */
export interface EtablissementParentOption {
  id: string;
  nom: string;
}

export interface EtablissementActionState {
  error: string | null;
  success: boolean;
}

const schemaModificationEtablissement = z.object({
  etablissementId: z.string().trim().min(1, "L'etablissement est obligatoire."),
  sigle: z.string().trim().optional().default(""),
  niveauPyramide: z.union([z.enum(NIVEAUX_PYRAMIDE), z.literal("")]).optional().default(""),
  secteur: z.union([z.enum(SECTEURS), z.literal("")]).optional().default(""),
  communeId: z.string().trim().optional().default(""),
  arrondissement: z.string().trim().optional().default(""),
  quartierVillage: z.string().trim().optional().default(""),
  adresse: z.string().trim().optional().default(""),
  telephoneEtablissement: z.string().trim().optional().default(""),
  emailEtablissement: z.union([z.email(), z.literal("")]).optional().default(""),
  identifiantExterneDhis2: z.string().trim().optional().default(""),
  etablissementParentId: z.string().trim().optional().default(""),
});

/** Chaine vide -> null, pour les champs facultatifs stockes en base. */
function videEnNull(valeur: string): string | null {
  return valeur.length > 0 ? valeur : null;
}

/**
 * Met a jour les champs du referentiel enrichi (F-ADM-02) d'un etablissement
 * existant. Ne touche jamais au statut (voir changerStatutEtablissementAction)
 * ni aux champs geres par la creation initiale (identifiant, type, capacite,
 * services, coordonnees GPS).
 */
export async function modifierEtablissementAction(
  prevState: EtablissementActionState,
  formData: FormData
): Promise<EtablissementActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "etablissement_sanitaire"))) {
    return { error: "Action reservee au ministere.", success: false };
  }

  const validation = schemaModificationEtablissement.safeParse({
    etablissementId: formData.get("etablissementId"),
    sigle: formData.get("sigle"),
    niveauPyramide: formData.get("niveauPyramide"),
    secteur: formData.get("secteur"),
    communeId: formData.get("communeId"),
    arrondissement: formData.get("arrondissement"),
    quartierVillage: formData.get("quartierVillage"),
    adresse: formData.get("adresse"),
    telephoneEtablissement: formData.get("telephoneEtablissement"),
    emailEtablissement: formData.get("emailEtablissement"),
    identifiantExterneDhis2: formData.get("identifiantExterneDhis2"),
    etablissementParentId: formData.get("etablissementParentId"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Donnees d'etablissement invalides.",
      success: false,
    };
  }

  const donnees = validation.data;

  if (donnees.etablissementParentId === donnees.etablissementId) {
    return { error: "Un etablissement ne peut pas etre son propre parent.", success: false };
  }

  try {
    const etablissement = await prisma.etablissementSanitaire.findUnique({
      where: { id: donnees.etablissementId },
    });

    if (!etablissement) {
      return { error: "Etablissement introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.etablissementSanitaire.update({
        where: { id: donnees.etablissementId },
        data: {
          sigle: videEnNull(donnees.sigle),
          niveauPyramide: videEnNull(donnees.niveauPyramide),
          secteur: videEnNull(donnees.secteur),
          communeId: videEnNull(donnees.communeId),
          arrondissement: videEnNull(donnees.arrondissement),
          quartierVillage: videEnNull(donnees.quartierVillage),
          adresse: videEnNull(donnees.adresse),
          telephoneEtablissement: videEnNull(donnees.telephoneEtablissement),
          emailEtablissement: videEnNull(donnees.emailEtablissement),
          identifiantExterneDhis2: videEnNull(donnees.identifiantExterneDhis2),
          etablissementParentId: videEnNull(donnees.etablissementParentId),
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "modification_referentiel_etablissement",
          donneeConcernee: `etablissement:${donnees.etablissementId}`,
          adresseTechnique,
          justification: `Referentiel mis a jour pour ${etablissement.nom}.`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la modification du referentiel d'etablissement :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaChangementStatut = z.object({
  etablissementId: z.string().trim().min(1, "L'etablissement est obligatoire."),
  nouveauStatut: z.enum(STATUTS, { message: "Statut invalide." }),
});

/**
 * Change le statut d'un etablissement, en verifiant que la transition est
 * autorisee (RG-ADM-02 : jamais de retour en arriere depuis "ferme"). Une
 * fermeture applique RG-ADM-01 : annule tous les rendez-vous futurs non
 * deja termines/annules et notifie chaque patient concerne. Ne supprime et
 * ne modifie jamais de donnee clinique (Consultation, Prescription, etc.).
 */
export async function changerStatutEtablissementAction(
  prevState: EtablissementActionState,
  formData: FormData
): Promise<EtablissementActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "etablissement_sanitaire"))) {
    return { error: "Action reservee au ministere.", success: false };
  }

  const validation = schemaChangementStatut.safeParse({
    etablissementId: formData.get("etablissementId"),
    nouveauStatut: formData.get("nouveauStatut"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Donnees invalides.",
      success: false,
    };
  }

  const { etablissementId, nouveauStatut } = validation.data;

  try {
    const etablissement = await prisma.etablissementSanitaire.findUnique({
      where: { id: etablissementId },
    });

    if (!etablissement) {
      return { error: "Etablissement introuvable.", success: false };
    }

    const transitionsPermises = TRANSITIONS_AUTORISEES[etablissement.statut] ?? [];

    if (!transitionsPermises.includes(nouveauStatut)) {
      return {
        error: `Transition refusee : un etablissement "${etablissement.statut}" ne peut pas passer a "${nouveauStatut}".`,
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const maintenant = new Date();

    // creerNotification() ecrit via le client prisma global, jamais via un
    // client de transaction (tx) : l'appeler a l'interieur du $transaction
    // ci-dessous enverrait une notification meme si la transaction est
    // ensuite annulee (ex. echec de journaliser()). Les patients a notifier
    // sont donc identifies PENDANT la transaction, et notifies seulement
    // APRES qu'elle a reellement commit, meme principe que
    // src/modules/reference/actions.ts pour ses propres notifications.
    const patientsANotifier: { userId: string; dateRendezVous: Date }[] = [];

    await prisma.$transaction(async (tx) => {
      await tx.etablissementSanitaire.update({
        where: { id: etablissementId },
        data: { statut: nouveauStatut },
      });

      if (nouveauStatut === "ferme") {
        const rendezVousFuturs = await tx.rendezVous.findMany({
          where: {
            etablissementId,
            date: { gt: maintenant },
            statut: { notIn: ["annule", "termine"] },
          },
          include: { patient: { select: { userId: true } } },
        });

        for (const rendezVous of rendezVousFuturs) {
          await tx.rendezVous.update({
            where: { id: rendezVous.id },
            data: { statut: "annule" },
          });

          patientsANotifier.push({ userId: rendezVous.patient.userId, dateRendezVous: rendezVous.date });
        }
      }

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "changement_statut_etablissement",
          donneeConcernee: `etablissement:${etablissementId}`,
          adresseTechnique,
          justification:
            `Statut de ${etablissement.nom} change de "${etablissement.statut}" a "${nouveauStatut}"` +
            (nouveauStatut === "ferme" ? ` (${patientsANotifier.length} rendez-vous futur(s) annule(s), donnees cliniques conservees).` : "."),
        },
        tx
      );
    });

    await Promise.all(
      patientsANotifier.map((patient) =>
        creerNotification(
          patient.userId,
          "rendez_vous_annule_fermeture_etablissement",
          `Votre rendez-vous du ${patient.dateRendezVous.toLocaleDateString("fr-FR")} a ete annule : l'etablissement a ferme.`,
          "/app/patient/rendez-vous"
        )
      )
    );

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du changement de statut de l'etablissement :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
