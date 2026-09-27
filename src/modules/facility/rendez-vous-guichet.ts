"use server";

/**
 * F-RDV-06 du pack ("rendez-vous pris au guichet ou par telephone",
 * docs/pack claude/specs/09-fiches-etablissements-rdv.md), suite naturelle
 * de F-RDV-04/05 (meme fichier evite volontairement : src/modules/facility/
 * actions.ts est actuellement modifie par une autre session pour F-ETA-05).
 *
 * Perimetre reduit assume et documente ici (meme decision que F-RDV-04/05,
 * deleguee par la session assignante) :
 * - Pas de role RECEPTIONIST (absent de ce depot) : route vers
 *   admin_etablissement, comme le reste de la serie F-RDV-04/05/06.
 * - RG-ACC-40 (recherche exacte du patient) : par identifiant sante, ou par
 *   telephone + date de naissance exacts. Aucune recherche partielle par
 *   nom, jamais. Chaque recherche est journalisee (RG-ACC-40 l'exige
 *   explicitement), qu'elle trouve un resultat ou non.
 * - "ou cree son dossier" (si le patient est introuvable) : HORS PERIMETRE
 *   ici. `creerPatientParProfessionnelAction` (src/modules/identity/
 *   actions.ts) existe deja mais est gardee derriere `create:consultation`
 *   (medecin uniquement) ; l'etendre a admin_etablissement toucherait un
 *   fichier tres partage ce soir pour un gain marginal (l'accueil peut deja
 *   orienter le patient vers l'inscription en ligne ou un medecin). Limite
 *   assumee : cette action ne fonctionne que pour un patient deja inscrit.
 * - "service" (concept du pack, absent de ce depot) : reduit au choix d'un
 *   professionnel (optionnel), meme simplification que F-RDV-01 (citoyen,
 *   `creerRendezVousAction`).
 * - RG-RDV-02 (max 3 rendez-vous futurs par patient) : non implemente non
 *   plus par F-RDV-01 (citoyen) dans ce depot, pas ajoute ici pour rester
 *   coherent (ne pas restreindre l'accueil plus que le patient lui-meme).
 * - RG-RDV-03 (reservation atomique par capacite de creneau) : ce depot n'a
 *   pas de modele de "slot" avec compteur/capacite ; reutilise la meme
 *   verification que `creerRendezVousAction` (F-ETA-05,
 *   `dateDansUnCreneauDisponible` + refus d'un doublon professionnel/instant
 *   exact, capacite 1 implicite), pour rester harmonise avec la creation de
 *   RDV cote citoyen.
 *
 * RG-RDV-01 (delai minimum avant reservation) NE S'APPLIQUE PAS ici (le
 * pack le dit explicitement) : l'accueil peut reserver des maintenant,
 * aucune date minimum imposee contrairement au formulaire citoyen.
 *
 * Le rendez-vous est cree directement au statut "confirme" (jamais
 * "demande") : c'est la difference cle avec F-RDV-01, l'accueil agissant
 * pour le compte de l'etablissement.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { dateDepuisChaineLocaleBenin } from "@/lib/fuseau-horaire";
import { dateDansUnCreneauDisponible } from "./creneau-disponible";
import { STATUTS_QUI_LIBERENT_LE_CRENEAU, estConflitDeCreneau } from "./rendez-vous-etats";
import { verifierReglesReservation } from "./regles-reservation";

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

/** Etablissement de l'admin_etablissement de la session courante, ou null. */
async function etablissementDeLAdminConnecte(): Promise<{ userId: string; etablissementId: string } | null> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "rendez_vous"))) {
    return null;
  }

  const professionnel = await prisma.professionnelSante.findUnique({
    where: { userId: session.userId },
  });

  if (!professionnel) {
    return null;
  }

  return { userId: session.userId, etablissementId: professionnel.etablissementId };
}

export interface ProfessionnelGuichetOption {
  id: string;
  nomComplet: string;
  specialite: string;
}

/**
 * Professionnels valides de l'etablissement de l'admin_etablissement
 * connecte, pour peupler le selecteur du formulaire de prise de rendez-vous
 * au guichet. Null si la session n'est pas autorisee.
 */
export async function getProfessionnelsGuichet(): Promise<ProfessionnelGuichetOption[] | null> {
  const admin = await etablissementDeLAdminConnecte();

  if (!admin) {
    return null;
  }

  const professionnels = await prisma.professionnelSante.findMany({
    where: { etablissementId: admin.etablissementId, statutValidation: "valide" },
    include: { user: true },
    orderBy: { user: { nom: "asc" } },
  });

  return professionnels.map((professionnel) => ({
    id: professionnel.id,
    nomComplet: `Dr. ${professionnel.user.prenom} ${professionnel.user.nom}`,
    specialite: professionnel.specialite,
  }));
}

export interface RechercheGuichetState {
  error: string | null;
  success: boolean;
  patientId?: string;
  nomComplet?: string;
  anneeNaissance?: number;
}

const schemaRecherche = z
  .object({
    identifiantSante: z.string().trim().default(""),
    telephone: z.string().trim().default(""),
    dateNaissance: z.string().trim().default(""),
  })
  .refine((donnees) => donnees.identifiantSante.length > 0 || (donnees.telephone.length > 0 && donnees.dateNaissance.length > 0), {
    message: "Saisissez l'identifiant santé, ou le téléphone et la date de naissance.",
  });

/**
 * Recherche exacte d'un patient (RG-ACC-40), par identifiant sante OU par
 * telephone + date de naissance. Ne renvoie que l'identite minimale (nom,
 * prenom, annee de naissance), jamais le dossier complet : cette recherche
 * ne sert qu'a identifier le patient pour lui creer un rendez-vous, pas a
 * consulter ses donnees (RG-ACC-40, "uniquement pour enregistrer une
 * arrivee ou un rendez-vous"). Journalisee dans tous les cas (trouve ou
 * non), comme l'exige RG-ACC-40.
 */
export async function rechercherPatientGuichetAction(
  prevState: RechercheGuichetState,
  formData: FormData
): Promise<RechercheGuichetState> {
  const admin = await etablissementDeLAdminConnecte();

  if (!admin) {
    return { error: "Action reservee a l'administration de l'etablissement.", success: false };
  }

  const validation = schemaRecherche.safeParse({
    identifiantSante: texte(formData, "identifiantSante"),
    telephone: texte(formData, "telephone"),
    dateNaissance: texte(formData, "dateNaissance"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Recherche invalide.",
      success: false,
    };
  }

  const { identifiantSante, telephone, dateNaissance } = validation.data;
  const adresseTechnique = await adresseTechniqueCourante();

  try {
    const patient = identifiantSante.length > 0
      ? await prisma.patient.findUnique({ where: { identifiantSante }, include: { user: true } })
      : await prisma.patient.findFirst({
          where: {
            dateNaissance: new Date(dateNaissance),
            user: { telephone },
          },
          include: { user: true },
        });

    await journaliser({
      utilisateurId: admin.userId,
      action: "recherche_patient_guichet",
      donneeConcernee: patient ? `patient:${patient.id}` : "patient:introuvable",
      adresseTechnique,
      justification: identifiantSante.length > 0
        ? `Recherche par identifiant sante (RG-ACC-40) : ${identifiantSante}`
        : `Recherche par telephone + date de naissance (RG-ACC-40)`,
    });

    if (!patient) {
      return { error: "Aucun patient ne correspond exactement à ces informations.", success: false };
    }

    return {
      error: null,
      success: true,
      patientId: patient.id,
      nomComplet: `${patient.user.prenom} ${patient.user.nom}`,
      anneeNaissance: patient.dateNaissance.getFullYear(),
    };
  } catch (erreur) {
    console.error("Erreur lors de la recherche de patient au guichet :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

export interface RendezVousGuichetActionState {
  error: string | null;
  success: boolean;
}

const schemaCreation = z.object({
  patientId: z.string().trim().min(1, "Le patient est obligatoire."),
  professionnelId: z.string().trim().default(""),
  date: z.string().trim().min(1, "La date est obligatoire."),
  motif: z.string().trim().min(1, "Le motif est obligatoire.").max(300, "300 caracteres maximum."),
});

/**
 * Cree un rendez-vous au guichet (F-RDV-06), confirme directement (jamais
 * "demande"), pour un patient trouve par rechercherPatientGuichetAction.
 * Pas de delai minimum (RG-RDV-01 ne s'applique pas ici). Reutilise les
 * memes verifications que la creation cote citoyen (F-ETA-05) pour rester
 * harmonise : disponibilite du professionnel si un creneau est configure
 * pour lui, refus d'un doublon professionnel/instant exact.
 */
export async function creerRendezVousGuichetAction(
  prevState: RendezVousGuichetActionState,
  formData: FormData
): Promise<RendezVousGuichetActionState> {
  const admin = await etablissementDeLAdminConnecte();

  if (!admin) {
    return { error: "Action reservee a l'administration de l'etablissement.", success: false };
  }

  const validation = schemaCreation.safeParse({
    patientId: texte(formData, "patientId"),
    professionnelId: texte(formData, "professionnelId"),
    date: texte(formData, "date"),
    motif: texte(formData, "motif"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Donnees de rendez-vous invalides.",
      success: false,
    };
  }

  const { patientId, professionnelId, date, motif } = validation.data;

  try {
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });

    if (!patient) {
      return { error: "Ce patient est introuvable.", success: false };
    }

    // Chaine soumise interpretee comme une heure LOCALE Africa/Porto-Novo
    // (jamais le fuseau du serveur), voir src/lib/fuseau-horaire.ts.
    const dateRendezVous = dateDepuisChaineLocaleBenin(date);
    const professionnelIdNettoye = professionnelId.trim();

    // RG-RDV-01 (sans delai minimum au guichet, 90 jours au plus), RG-RDV-02
    // (3 rendez-vous futurs), un seul rendez-vous par jour et par etablissement.
    const refusRegles = await verifierReglesReservation({
      patientId,
      etablissementId: admin.etablissementId,
      date: dateRendezVous,
      guichet: true,
    });

    if (refusRegles) {
      return { error: refusRegles, success: false };
    }

    if (professionnelIdNettoye.length > 0) {
      const professionnel = await prisma.professionnelSante.findUnique({
        where: { id: professionnelIdNettoye },
      });

      if (
        !professionnel ||
        professionnel.etablissementId !== admin.etablissementId ||
        professionnel.statutValidation !== "valide"
      ) {
        return {
          error: "Ce professionnel de sante n'est pas disponible dans cet etablissement.",
          success: false,
        };
      }

      const disponible = await dateDansUnCreneauDisponible(professionnelIdNettoye, dateRendezVous);
      if (!disponible) {
        return {
          error: "Ce professionnel n'est pas disponible à cette heure. Merci de choisir un autre créneau.",
          success: false,
        };
      }

      const dejaPris = await prisma.rendezVous.findFirst({
        where: {
          professionnelId: professionnelIdNettoye,
          date: dateRendezVous,
          statut: { notIn: [...STATUTS_QUI_LIBERENT_LE_CRENEAU] },
        },
      });
      if (dejaPris) {
        return {
          error: "Ce créneau est déjà pris. Merci de choisir un autre horaire.",
          success: false,
        };
      }
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      const rendezVous = await tx.rendezVous.create({
        data: {
          patientId,
          etablissementId: admin.etablissementId,
          professionnelId: professionnelIdNettoye.length > 0 ? professionnelIdNettoye : null,
          date: dateRendezVous,
          motif,
          statut: "confirme",
        },
      });

      await journaliser(
        {
          utilisateurId: admin.userId,
          action: "creation_rendez_vous_guichet",
          donneeConcernee: `rendez_vous:${rendezVous.id}`,
          adresseTechnique,
          justification: "Rendez-vous pris au guichet par l'accueil de l'etablissement, confirme directement",
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    // RG-RDV-03 : index unique partiel de la base (deux demandes simultanees).
    if (estConflitDeCreneau(erreur)) {
      return { error: "Ce créneau est déjà pris. Merci de choisir un autre horaire.", success: false };
    }
    console.error("Erreur lors de la creation du rendez-vous au guichet :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
