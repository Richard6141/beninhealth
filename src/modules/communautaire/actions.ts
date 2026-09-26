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
  // Rempli quand un nom proche a deja ete enregistre par ce meme agent, pour
  // une visite SANS personne selectionnee (beneficiaireNom en texte libre) ;
  // purement informatif, la visite est tout de meme creee (avertissement,
  // jamais un blocage).
  avertissementDoublonBeneficiaire?: string | null;
}

/** Une personne enregistree (F-COM-02), prete a afficher dans le selecteur du formulaire de visite. */
export interface PersonneCommunautaireResume {
  id: string;
  nomComplet: string;
  dateNaissance: string; // ISO
  dateNaissanceApproximative: boolean;
  sexe: string;
  villageQuartier: string;
  chefMenage: string | null;
}

/** Candidat doublon renvoye quand une personne tres proche existe deja (F-COM-02, RG-CLI-3b : jamais le dossier complet). */
export interface CandidatDoublonPersonne {
  initiales: string;
  anneeNaissance: number;
  sexe: string;
  villageQuartier: string;
}

export interface EnregistrerPersonneActionState {
  error: string | null;
  success: boolean;
  personneCreee?: PersonneCommunautaireResume;
  candidatDoublon?: CandidatDoublonPersonne;
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
  personneId: z.string().trim().optional().default(""),
  beneficiaireNom: z.string().trim().optional().default(""),
  typeVisite: z.enum(TYPES_VISITE, {
    message: "Le type de visite est invalide.",
  }),
  localisation: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
});

const LONGUEUR_MIN_JUSTIFICATION_DOUBLON = 10;

const schemaEnregistrementPersonne = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire."),
  prenom: z.string().trim().min(1, "Le prenom est obligatoire."),
  sexe: z.enum(["M", "F"], { message: "Le sexe est obligatoire." }),
  dateNaissance: z.string().trim().min(1, "La date de naissance est obligatoire."),
  dateNaissanceApproximative: z.string().trim().optional().default(""),
  villageQuartier: z.string().trim().min(1, "Le village ou quartier est obligatoire."),
  chefMenage: z.string().trim().optional().default(""),
  confirmerMalgreDoublon: z.string().trim().optional().default(""),
  justificationDoublon: z.string().trim().optional().default(""),
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
 * agent_communautaire ne detient aucun droit read:patient.
 *
 * Le beneficiaire est soit une personne enregistree au prealable (F-COM-02,
 * personneId, verifie ici comme appartenant au meme etablissement que
 * l'agent - jamais confiance dans le seul id transmis), soit un nom en texte
 * libre (beneficiaireNom, comportement d'origine conserve pour une visite
 * ponctuelle sans enregistrement prealable). Quand personneId est fourni,
 * beneficiaireNom est toujours derive du nom de la personne, jamais de la
 * valeur soumise par le formulaire.
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
    personneId: texte(formData, "personneId"),
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

  const { personneId, typeVisite, localisation, notes } = validation.data;
  let beneficiaireNom = validation.data.beneficiaireNom;

  if (!personneId && beneficiaireNom.length === 0) {
    return { error: "Le nom du beneficiaire est obligatoire.", success: false };
  }

  try {
    const agent = await professionnelDeLaSessionCourante();

    if (!agent) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    let personneVerifieeId: string | null = null;
    if (personneId) {
      const personne = await prisma.personneCommunautaire.findUnique({ where: { id: personneId } });

      if (!personne || personne.etablissementId !== agent.etablissementId) {
        return { error: "Personne introuvable.", success: false };
      }

      personneVerifieeId = personne.id;
      beneficiaireNom = `${personne.prenom} ${personne.nom}`;
    }

    const adresseTechnique = await adresseTechniqueCourante();

    // Avertissement de doublon (rapprochement de nom normalise parmi les
    // visites deja enregistrees par ce meme agent) : uniquement pertinent
    // pour une visite en texte libre, une personne enregistree (personneId)
    // ayant deja son propre controle de doublon a l'enregistrement (voir
    // enregistrerPersonneAction).
    let doublonProbable = false;
    if (!personneVerifieeId) {
      const beneficiaireNomNormalise = normaliserPourComparaison(beneficiaireNom);
      const visitesExistantes = await prisma.suiviCommunautaire.findMany({
        where: { agentId: agent.id },
        select: { beneficiaireNom: true },
      });
      doublonProbable = visitesExistantes.some(
        (visite) => normaliserPourComparaison(visite.beneficiaireNom) === beneficiaireNomNormalise
      );
    }

    const suiviCree = await prisma.$transaction(async (tx) => {
      const cree = await tx.suiviCommunautaire.create({
        data: {
          agentId: agent.id,
          etablissementId: agent.etablissementId,
          personneId: personneVerifieeId,
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

/**
 * Enregistre une personne suivie par le programme communautaire (F-COM-02
 * du pack), a l'initiative de l'agent connecte. Reserve au role
 * agent_communautaire (create:personne_communautaire). Jamais un dossier
 * Patient : voir le commentaire du modele PersonneCommunautaire dans
 * prisma/schema.prisma.
 *
 * RG-CLI-20/21 du pack (par analogie avec creerPatientParProfessionnelAction,
 * src/modules/identity/actions.ts) : verification de doublon obligatoire
 * avant creation, simplifiee ici a une correspondance exacte normalisee
 * (nom, prenom, date de naissance) plutot qu'un score de similarite, a
 * l'echelle de l'etablissement (tous les agents du meme etablissement
 * partagent le meme registre, pas seulement l'agent courant). Si un candidat
 * existe et que confirmerMalgreDoublon n'est pas coche, la creation est
 * refusee et seules des informations minimales sont renvoyees (initiales,
 * annee de naissance, sexe, village/quartier - jamais la fiche complete).
 */
export async function enregistrerPersonneAction(
  prevState: EnregistrerPersonneActionState,
  formData: FormData
): Promise<EnregistrerPersonneActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "personne_communautaire"))) {
    return { error: "Action reservee aux agents communautaires.", success: false };
  }

  const validation = schemaEnregistrementPersonne.safeParse({
    nom: texte(formData, "nom"),
    prenom: texte(formData, "prenom"),
    sexe: texte(formData, "sexe"),
    dateNaissance: texte(formData, "dateNaissance"),
    dateNaissanceApproximative: texte(formData, "dateNaissanceApproximative"),
    villageQuartier: texte(formData, "villageQuartier"),
    chefMenage: texte(formData, "chefMenage"),
    confirmerMalgreDoublon: texte(formData, "confirmerMalgreDoublon"),
    justificationDoublon: texte(formData, "justificationDoublon"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de personne invalides."),
      success: false,
    };
  }

  const donnees = validation.data;
  const dateNaissance = new Date(donnees.dateNaissance);

  if (Number.isNaN(dateNaissance.getTime()) || dateNaissance > new Date()) {
    return { error: "Date de naissance invalide.", success: false };
  }

  const confirmerMalgreDoublon = donnees.confirmerMalgreDoublon.length > 0;

  if (confirmerMalgreDoublon && donnees.justificationDoublon.length < LONGUEUR_MIN_JUSTIFICATION_DOUBLON) {
    return {
      error: `La justification doit comporter au moins ${LONGUEUR_MIN_JUSTIFICATION_DOUBLON} caracteres.`,
      success: false,
    };
  }

  const nomNormalise = normaliserPourComparaison(donnees.nom);
  const prenomNormalise = normaliserPourComparaison(donnees.prenom);

  try {
    const agent = await professionnelDeLaSessionCourante();

    if (!agent) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    if (!confirmerMalgreDoublon) {
      const personnesExistantes = await prisma.personneCommunautaire.findMany({
        where: { etablissementId: agent.etablissementId, dateNaissance },
      });

      const candidat = personnesExistantes.find(
        (personne) =>
          normaliserPourComparaison(personne.nom) === nomNormalise &&
          normaliserPourComparaison(personne.prenom) === prenomNormalise
      );

      if (candidat) {
        return {
          error: "Une personne correspondante est déjà enregistrée. Vérifiez avant de continuer.",
          success: false,
          candidatDoublon: {
            initiales: `${candidat.prenom.charAt(0)}${candidat.nom.charAt(0)}`.toUpperCase(),
            anneeNaissance: candidat.dateNaissance.getFullYear(),
            sexe: candidat.sexe,
            villageQuartier: candidat.villageQuartier,
          },
        };
      }
    }

    const adresseTechnique = await adresseTechniqueCourante();

    const personneCreee = await prisma.$transaction(async (tx) => {
      const cree = await tx.personneCommunautaire.create({
        data: {
          etablissementId: agent.etablissementId,
          agentId: agent.id,
          nom: donnees.nom,
          prenom: donnees.prenom,
          sexe: donnees.sexe,
          dateNaissance,
          dateNaissanceApproximative: donnees.dateNaissanceApproximative.length > 0,
          villageQuartier: donnees.villageQuartier,
          chefMenage: donnees.chefMenage.length > 0 ? donnees.chefMenage : null,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation",
          donneeConcernee: `personne_communautaire:${cree.id}`,
          adresseTechnique,
          justification: confirmerMalgreDoublon
            ? `Personne enregistree malgre un doublon probable : ${donnees.justificationDoublon}`
            : "Personne enregistree, aucun doublon probable detecte.",
        },
        tx
      );

      return cree;
    });

    return {
      error: null,
      success: true,
      personneCreee: {
        id: personneCreee.id,
        nomComplet: `${personneCreee.prenom} ${personneCreee.nom}`,
        dateNaissance: personneCreee.dateNaissance.toISOString(),
        dateNaissanceApproximative: personneCreee.dateNaissanceApproximative,
        sexe: personneCreee.sexe,
        villageQuartier: personneCreee.villageQuartier,
        chefMenage: personneCreee.chefMenage,
      },
    };
  } catch (erreur) {
    console.error("Erreur lors de l'enregistrement de la personne :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Personnes enregistrees (F-COM-02) dans l'etablissement de l'agent connecte
 * (registre partage entre tous les agents du meme etablissement, pas
 * seulement ceux enregistres par l'agent courant), triees par nom. Utilise
 * par le selecteur du formulaire de visite.
 */
export async function getPersonnesEnregistrees(): Promise<PersonneCommunautaireResume[]> {
  const agent = await professionnelDeLaSessionCourante();

  if (!agent) {
    return [];
  }

  const personnes = await prisma.personneCommunautaire.findMany({
    where: { etablissementId: agent.etablissementId },
    orderBy: { nom: "asc" },
  });

  return personnes.map((personne) => ({
    id: personne.id,
    nomComplet: `${personne.prenom} ${personne.nom}`,
    dateNaissance: personne.dateNaissance.toISOString(),
    dateNaissanceApproximative: personne.dateNaissanceApproximative,
    sexe: personne.sexe,
    villageQuartier: personne.villageQuartier,
    chefMenage: personne.chefMenage,
  }));
}
