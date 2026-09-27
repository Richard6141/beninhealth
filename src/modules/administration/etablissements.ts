"use server";

/**
 * Referentiel des etablissements (F-ADM-02 du pack), reserve a
 * PLATFORM_ADMIN dans le pack : ouvert a admin_national, meme adaptation
 * documentee que les autres fiches du chapitre 15 ce soir (F-ADM-06,
 * F-ADM-07, F-AUD-01 a 04).
 *
 * Perimetre honnete par rapport a la fiche complete :
 * - Pas d'import CSV (explicitement P1 dans le pack).
 * - Le nom, le type, la capacite, les services et les coordonnees GPS se
 *   modifient apres la creation. Le type se limite aux quatre types traites
 *   par la plateforme et ne change plus quand des donnees y sont rattachees
 *   (examens recus, ordonnances delivrees). Le point GPS doit etre dans
 *   l'emprise du Benin et, quand le contour du departement est connu, a
 *   l'interieur du departement de la commune choisie (etablissements-regles.ts) :
 *   le depot n'embarque ni contour de commune ni de zone sanitaire, la maille
 *   du controle est donc le departement.
 * - Le cycle brouillon, controle, activation n'est pas impose a la creation :
 *   un etablissement cree par le ministere avec son administrateur est actif
 *   d'emblee (decision de demonstration) ; le statut "brouillon" reste
 *   disponible et se traite par changerStatutEtablissementAction.
 * - RG-ADM-01 (fermeture) : annule les rendez-vous futurs avec notification,
 *   termine toutes les affiliations du personnel (avec notification) et ne
 *   touche jamais aux donnees cliniques (Consultation, Prescription, etc.,
 *   jamais modifiees ni supprimees).
 * - RG-ADM-02 (jamais de suppression) : aucune fonction de ce module ne
 *   supprime un EtablissementSanitaire, uniquement des transitions de statut.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { TRANSITIONS, transitionnerRendezVous } from "@/modules/facility/rendez-vous-etats";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import {
  CAPACITE_MAXIMALE,
  TYPES_ETABLISSEMENT_TRAITES,
  analyserServices,
  verifierChangementType,
  verifierCoordonnees,
} from "./etablissements-regles";

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

  if (!session || !session.roles.some((role) => can(role, "read", "referentiel_etablissement"))) {
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
  latitude: number;
  longitude: number;
  /** Services proposes, dans l'ordre saisi. */
  services: string[];
  nombreProfessionnels: number;
  etablissementParentNom: string | null;
}

/** Liste JSON stockee en base -> tableau de textes (liste vide si la valeur est illisible). */
function servicesDeLaLigne(valeur: string): string[] {
  try {
    const donnees: unknown = JSON.parse(valeur);
    return Array.isArray(donnees) ? donnees.filter((element): element is string => typeof element === "string") : [];
  } catch {
    return [];
  }
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
    latitude: etablissement.latitude,
    longitude: etablissement.longitude,
    services: servicesDeLaLigne(etablissement.servicesDisponibles),
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
  nom: z.string().trim().min(3, "Le nom de l'etablissement est obligatoire (3 caracteres au moins).").max(150, "Le nom est limite a 150 caracteres."),
  type: z.enum(TYPES_ETABLISSEMENT_TRAITES, { message: "Type d'etablissement invalide." }),
  capacite: z.coerce.number({ message: "La capacite doit etre un nombre." }).int("La capacite doit etre un nombre entier.").min(0, "La capacite ne peut pas etre negative.").max(CAPACITE_MAXIMALE, "Capacite trop elevee."),
  latitude: z.coerce.number({ message: "La latitude doit etre un nombre." }),
  longitude: z.coerce.number({ message: "La longitude doit etre un nombre." }),
  services: z.string().optional().default(""),
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

/** Noms des champs dont la valeur change (pour le journal d'audit : jamais les valeurs elles-memes). */
function champsModifies(
  avant: {
    nom: string;
    type: string;
    capacite: number;
    latitude: number;
    longitude: number;
    servicesDisponibles: string;
    sigle: string | null;
    niveauPyramide: string | null;
    secteur: string | null;
    communeId: string | null;
    arrondissement: string | null;
    quartierVillage: string | null;
    adresse: string | null;
    telephoneEtablissement: string | null;
    emailEtablissement: string | null;
    identifiantExterneDhis2: string | null;
    etablissementParentId: string | null;
  },
  apres: z.infer<typeof schemaModificationEtablissement>,
  services: string[]
): string[] {
  const champs: string[] = [];
  const compare = (nom: string, ancienne: unknown, nouvelle: unknown) => {
    if (ancienne !== nouvelle) champs.push(nom);
  };
  compare("nom", avant.nom, apres.nom);
  compare("type", avant.type, apres.type);
  compare("capacite", avant.capacite, apres.capacite);
  compare("latitude", avant.latitude, apres.latitude);
  compare("longitude", avant.longitude, apres.longitude);
  compare("services", avant.servicesDisponibles, JSON.stringify(services));
  compare("sigle", avant.sigle, videEnNull(apres.sigle));
  compare("niveauPyramide", avant.niveauPyramide, videEnNull(apres.niveauPyramide));
  compare("secteur", avant.secteur, videEnNull(apres.secteur));
  compare("commune", avant.communeId, videEnNull(apres.communeId));
  compare("arrondissement", avant.arrondissement, videEnNull(apres.arrondissement));
  compare("quartierVillage", avant.quartierVillage, videEnNull(apres.quartierVillage));
  compare("adresse", avant.adresse, videEnNull(apres.adresse));
  compare("telephone", avant.telephoneEtablissement, videEnNull(apres.telephoneEtablissement));
  compare("email", avant.emailEtablissement, videEnNull(apres.emailEtablissement));
  compare("identifiantDhis2", avant.identifiantExterneDhis2, videEnNull(apres.identifiantExterneDhis2));
  compare("etablissementParent", avant.etablissementParentId, videEnNull(apres.etablissementParentId));
  return champs;
}

/** Chaine vide -> null, pour les champs facultatifs stockes en base. */
function videEnNull(valeur: string): string | null {
  return valeur.length > 0 ? valeur : null;
}

/**
 * Met a jour les champs du referentiel (F-ADM-02) d'un etablissement existant :
 * identite, type, capacite, services, coordonnees GPS et territoire. Ne touche
 * jamais au statut (voir changerStatutEtablissementAction) ni a l'identifiant.
 * Le nom et le type changent aussi, avec leurs gardes (etablissements-regles.ts) ;
 * chaque modification est journalisee avec la liste des champs changes.
 */
export async function modifierEtablissementAction(
  prevState: EtablissementActionState,
  formData: FormData
): Promise<EtablissementActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_etablissement"))) {
    return { error: "Action reservee au ministere.", success: false };
  }

  const validation = schemaModificationEtablissement.safeParse({
    etablissementId: formData.get("etablissementId") ?? undefined,
    nom: formData.get("nom") ?? undefined,
    type: formData.get("type") ?? undefined,
    capacite: formData.get("capacite") ?? undefined,
    latitude: formData.get("latitude") ?? undefined,
    longitude: formData.get("longitude") ?? undefined,
    services: formData.get("services") ?? undefined,
    sigle: formData.get("sigle") ?? undefined,
    niveauPyramide: formData.get("niveauPyramide") ?? undefined,
    secteur: formData.get("secteur") ?? undefined,
    communeId: formData.get("communeId") ?? undefined,
    arrondissement: formData.get("arrondissement") ?? undefined,
    quartierVillage: formData.get("quartierVillage") ?? undefined,
    adresse: formData.get("adresse") ?? undefined,
    telephoneEtablissement: formData.get("telephoneEtablissement") ?? undefined,
    emailEtablissement: formData.get("emailEtablissement") ?? undefined,
    identifiantExterneDhis2: formData.get("identifiantExterneDhis2") ?? undefined,
    etablissementParentId: formData.get("etablissementParentId") ?? undefined,
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

  const erreurCoordonnees = verifierCoordonnees(donnees.latitude, donnees.longitude);
  if (erreurCoordonnees) {
    return { error: erreurCoordonnees, success: false };
  }

  const services = analyserServices(donnees.services);
  if ("erreur" in services) {
    return { error: services.erreur, success: false };
  }

  try {
    const etablissement = await prisma.etablissementSanitaire.findUnique({
      where: { id: donnees.etablissementId },
    });

    if (!etablissement) {
      return { error: "Etablissement introuvable.", success: false };
    }

    if (etablissement.type !== donnees.type) {
      const [examensRecus, delivrancesFaites] = await Promise.all([
        prisma.examenMedical.count({ where: { laboratoireId: etablissement.id } }),
        prisma.delivrance.count({ where: { etablissementId: etablissement.id } }),
      ]);
      const erreurType = verifierChangementType(etablissement.type, donnees.type, { examensRecus, delivrancesFaites });
      if (erreurType) {
        return { error: erreurType, success: false };
      }
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const changements = champsModifies(etablissement, donnees, services.services);

    await prisma.$transaction(async (tx) => {
      await tx.etablissementSanitaire.update({
        where: { id: donnees.etablissementId },
        data: {
          nom: donnees.nom,
          type: donnees.type,
          capacite: donnees.capacite,
          latitude: donnees.latitude,
          longitude: donnees.longitude,
          servicesDisponibles: JSON.stringify(services.services),
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
          justification: `Referentiel mis a jour pour ${etablissement.nom}${changements.length > 0 ? ` (champs modifies : ${changements.join(", ")})` : " (aucun champ modifie)"}.`,
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

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_etablissement"))) {
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
    const personnelANotifier: string[] = [];
    let affiliationsTerminees = 0;

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
            statut: { in: [...TRANSITIONS.annuler.depuis] },
          },
          include: { patient: { select: { userId: true } } },
        });

        for (const rendezVous of rendezVousFuturs) {
          if (await transitionnerRendezVous(tx, rendezVous.id, "annuler")) {
            patientsANotifier.push({ userId: rendezVous.patient.userId, dateRendezVous: rendezVous.date });
          }
        }
      }

      if (nouveauStatut === "ferme") {
        // RG-ADM-01 : toutes les affiliations prennent fin ; les comptes et les donnees cliniques sont conserves.
        const affiliations = await tx.affiliationProfessionnelle.findMany({
          where: { etablissementId, statut: { in: ["invitee", "active", "suspendue"] } },
          select: { id: true, professionnel: { select: { userId: true } } },
        });
        if (affiliations.length > 0) {
          await tx.affiliationProfessionnelle.updateMany({
            where: { id: { in: affiliations.map((affiliation) => affiliation.id) } },
            data: { statut: "terminee", dateFin: maintenant },
          });
        }
        affiliationsTerminees = affiliations.length;
        personnelANotifier.push(...new Set(affiliations.map((affiliation) => affiliation.professionnel.userId)));
      }

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "changement_statut_etablissement",
          donneeConcernee: `etablissement:${etablissementId}`,
          adresseTechnique,
          justification:
            `Statut de ${etablissement.nom} change de "${etablissement.statut}" a "${nouveauStatut}"` +
            (nouveauStatut === "ferme"
              ? ` (${patientsANotifier.length} rendez-vous futur(s) annule(s), ${affiliationsTerminees} affiliation(s) terminee(s), donnees cliniques conservees).`
              : "."),
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

    await Promise.all(
      personnelANotifier.map((userId) =>
        creerNotification(
          userId,
          "affiliation_terminee",
          `Votre affiliation a ${etablissement.nom} a pris fin : l'etablissement a ferme. Vos donnees et celles des patients sont conservees.`,
          "/app/securite"
        )
      )
    );

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du changement de statut de l'etablissement :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
