"use server";

/**
 * Server Actions du module patient : dossier patient et consentement.
 * Contrat d'integration Phase 3, consomme par les ecrans
 * src/app/app/patient/** (autre agent).
 *
 * Principe applique de bout en bout (voir src/modules/identity/actions.ts et
 * src/security/README.md) : Zero Trust. Le patient courant est toujours
 * derive de getSession().userId, jamais d'un id de patient transmis par le
 * client dans un formulaire. Toute lecture ou modification d'une ressource
 * identifiee par un id transmis (ex : consentementId) verifie explicitement
 * que cette ressource appartient bien au patient connecte avant d'agir.
 * Toute modification du dossier ou evenement de consentement est trace dans
 * JournalAudit.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { creerNotification } from "@/modules/notification/creer";
import type { ContactUrgence, GroupeSanguin, NomRole, TypeAccesConsentement } from "@/types";
import { calculerDateFinConsentement, DUREES_CONSENTEMENT_CONNUES } from "./consentement-durees";
import { clesAuditDuPatient } from "./cles-audit-patient";
import {
  MAX_RESULTATS_RECHERCHE_PROFESSIONNEL,
  normaliserPourRecherche,
  rechercheProfessionnelSuffisante,
} from "./recherche-professionnel";

/** Libelles francais des types d'acces (ecran de partage et notifications). */
const LIBELLES_TYPE_ACCES: Record<string, string> = {
  dossier_complet: "dossier complet",
  consultations: "consultations",
  prescriptions: "prescriptions",
  examens: "examens",
  documents: "documents",
};

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface PatientActionState {
  error: string | null;
  success: boolean;
}

/** Resume du dossier du patient connecte, pret a afficher cote ecran. */
export interface DossierPatientResume {
  identifiantSante: string;
  dateNaissance: string; // ISO
  sexe: "M" | "F";
  groupeSanguin: string;
  allergies: string[];
  antecedents: string[];
  maladiesChroniques: string[];
  // Declaratif, visible et modifiable uniquement pour sexe "F" cote ecran :
  // utilise par le controle de securite "grossesse" de la prescription
  // (F-PRE-02, voir src/modules/prescription/controles-securite.ts).
  grossesseEnCours: boolean;
  contactsUrgence: { nom: string; telephone: string; lienParente: string }[];
}

/** Consentement du patient connecte, enrichi du nom et de la specialite de l'acteur autorise. */
export interface ConsentementAvecActeur {
  id: string;
  acteurAutoriseId: string;
  acteurNomComplet: string; // "Dr. Prenom Nom" ou "Prenom Nom"
  acteurSpecialite: string | null; // specialite si ProfessionnelSante, sinon null
  typeAcces: string;
  /** Statut brut stocke en base ("actif" ou "retire"), voir statutEffectif pour l'affichage. */
  statut: string;
  /**
   * Statut a afficher au patient (F-CIT-10/RG-CIT-80 : actifs, expires et
   * retires doivent apparaitre distinctement) : derive de `statut` et de la
   * date de fin, jamais stocke tel quel (aucune tache planifiee ne fait
   * transitionner un consentement a l'echeance, seule la date fait foi).
   */
  statutEffectif: "actif" | "expire" | "retire";
  dateDebut: string; // ISO
  dateFin: string | null; // ISO
}

function calculerStatutEffectifConsentement(
  statut: string,
  dateFin: Date | null
): "actif" | "expire" | "retire" {
  if (statut === "retire") return "retire";
  if (dateFin !== null && dateFin.getTime() <= Date.now()) return "expire";
  return "actif";
}

/** Professionnel de sante pouvant se voir accorder un acces au dossier du patient connecte. */
export interface ProfessionnelDisponible {
  userId: string;
  nomComplet: string;
  specialite: string;
  etablissementNom: string;
}

const GROUPES_SANGUINS_CONNUS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "inconnu",
] as const satisfies readonly GroupeSanguin[];

const TYPES_ACCES_CONNUS = [
  "dossier_complet",
  "consultations",
  "prescriptions",
  "examens",
  "documents",
] as const satisfies readonly TypeAccesConsentement[];

// F-CIT-04 du pack : allergies, antecedents, maladies chroniques et contacts
// d'urgence sont geres par src/modules/patient/informations-declarees.ts
// (versionnement declare/confirme/retire, RG-CIT-30/31), plus modifiables ici
// wholesale. Cette action ne garde que le groupe sanguin et la grossesse.
const schemaMiseAJourDossier = z.object({
  groupeSanguin: z.enum(GROUPES_SANGUINS_CONNUS, { message: "Groupe sanguin invalide." }),
  grossesseEnCours: z.coerce.boolean().optional().default(false),
});

const schemaOctroiConsentement = z.object({
  acteurAutoriseId: z.string().trim().min(1, "Le professionnel de sante est obligatoire."),
  typeAcces: z.enum(TYPES_ACCES_CONNUS, { message: "Type d'acces invalide." }),
  duree: z.enum(DUREES_CONSENTEMENT_CONNUES, { message: "Duree d'autorisation invalide." }),
});

const schemaRetraitConsentement = z.object({
  consentementId: z.string().trim().min(1, "Le consentement est obligatoire."),
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

/** Convertit une chaine JSON de tableau (telle que stockee en base) en tableau de chaines. */
function parseListeJSON(valeur: string): string[] {
  try {
    const donnees: unknown = JSON.parse(valeur);
    return Array.isArray(donnees) ? donnees.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Convertit une chaine JSON de contacts d'urgence en tableau typé. */
function parseContactsUrgence(valeur: string): ContactUrgence[] {
  try {
    const donnees: unknown = JSON.parse(valeur);

    if (!Array.isArray(donnees)) {
      return [];
    }

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

/** Nom complet d'un acteur, prefixe de "Dr." s'il s'agit d'un professionnel de sante. */
function nomCompletActeur(
  utilisateur: { nom: string; prenom: string },
  estMedecin: boolean
): string {
  const nomComplet = `${utilisateur.prenom} ${utilisateur.nom}`;
  return estMedecin ? `Dr. ${nomComplet}` : nomComplet;
}

/** Recupere le profil Patient du titulaire de la session courante, ou null si absent. */
async function patientDeLaSessionCourante() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  return prisma.patient.findUnique({ where: { userId: session.userId } });
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/**
 * Recupere le dossier du patient connecte (derive de getSession(), jamais
 * d'id en parametre). Retourne null si la session est absente ou si
 * l'utilisateur connecte n'a pas de profil Patient.
 */
export async function getMonDossierPatient(): Promise<DossierPatientResume | null> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return null;
  }

  return {
    identifiantSante: patient.identifiantSante,
    dateNaissance: patient.dateNaissance.toISOString(),
    sexe: patient.sexe === "F" ? "F" : "M",
    groupeSanguin: patient.groupeSanguin,
    allergies: parseListeJSON(patient.allergies),
    antecedents: parseListeJSON(patient.antecedents),
    maladiesChroniques: parseListeJSON(patient.maladiesChroniques),
    grossesseEnCours: patient.grossesseEnCours,
    contactsUrgence: parseContactsUrgence(patient.contactsUrgence),
  };
}

/**
 * Recupere les consentements du patient connecte, avec le nom et la
 * specialite de chaque acteur autorise, du plus recent au plus ancien.
 */
export async function getMesConsentements(): Promise<ConsentementAvecActeur[]> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return [];
  }

  const consentements = await prisma.consentement.findMany({
    where: { patientId: patient.id },
    include: { acteurAutorise: { include: { professionnel: true } } },
    orderBy: { dateDebut: "desc" },
  });

  return consentements.map((consentement) => ({
    id: consentement.id,
    acteurAutoriseId: consentement.acteurAutoriseId,
    acteurNomComplet: nomCompletActeur(
      consentement.acteurAutorise,
      consentement.acteurAutorise.professionnel !== null
    ),
    acteurSpecialite: consentement.acteurAutorise.professionnel?.specialite ?? null,
    typeAcces: consentement.typeAcces,
    statut: consentement.statut,
    statutEffectif: calculerStatutEffectifConsentement(consentement.statut, consentement.dateFin),
    dateDebut: consentement.dateDebut.toISOString(),
    dateFin: consentement.dateFin ? consentement.dateFin.toISOString() : null,
  }));
}

/** Un acces au dossier du patient connecte par un tiers (F-CIT-12). */
export interface AccesDossier {
  id: string;
  date: string; // ISO
  acteurNomComplet: string;
  acteurRole: NomRole | null;
  etablissementNom: string | null;
  // Type de ressource concernee (prefixe de donneeConcernee : "patient",
  // "consultation", "prescription", "examen_medical", "suivi_communautaire"),
  // necessaire cote ecran pour distinguer des actions au libelle ambigu
  // (ex. "creation" existe pour une prescription, un examen ou un suivi).
  cible: string;
  action: string;
  // Utilisee uniquement pour afficher la justification d'un acces d'urgence
  // (F-CLI-10, CA-2) : jamais affichee pour les autres types d'acces.
  justification: string;
}

/**
 * Historique des acces au dossier du patient connecte par d'autres personnes
 * (F-CIT-12 « Qui a consulte mon dossier »), du plus recent au plus ancien.
 * Ne remonte jamais les consultations du patient de son propre dossier
 * (RG-CIT-21 : non pertinentes pour cet historique, meme si elles restent
 * journalisees ailleurs).
 *
 * RG-CIT-100 exige d'inclure les acces medecin, laboratoire, pharmacie et
 * agent communautaire. JournalAudit.donneeConcernee ne pointe pas toujours
 * directement `patient:<id>` (ex. une delivrance de prescription est tracee
 * sous `prescription:<id>`) : on resout donc aussi les consultations,
 * prescriptions, examens et suivis communautaires du patient pour retrouver
 * ces entrees, sans changement de schema.
 */
export async function getMesAccesDossier(): Promise<AccesDossier[]> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return [];
  }

  const clesConcernees = await clesAuditDuPatient(patient.id);

  const entrees = await prisma.journalAudit.findMany({
    where: {
      donneeConcernee: { in: clesConcernees },
      utilisateurId: { not: patient.userId },
    },
    include: {
      utilisateur: {
        include: { roles: true, professionnel: { include: { etablissement: true } } },
      },
    },
    orderBy: { date: "desc" },
  });

  return entrees.map((entree) => {
    const role = (entree.utilisateur.roles[0]?.nom as NomRole | undefined) ?? null;
    return {
      id: entree.id,
      date: entree.date.toISOString(),
      acteurNomComplet: nomCompletActeur(entree.utilisateur, role === "medecin"),
      acteurRole: role,
      etablissementNom: entree.utilisateur.professionnel?.etablissement.nom ?? null,
      cible: entree.donneeConcernee.split(":")[0] ?? "",
      action: entree.action,
      justification: entree.action === "acces_urgence" ? entree.justification : "",
    };
  });
}

/**
 * RG-CIT-101 : le patient signale un acces qu'il ne reconnaît pas. Cree une
 * entree JournalAudit dediee (pas de nouveau modele) plutot qu'un simple
 * bouton sans effet, pour laisser une trace exploitable par un futur ecran
 * d'audit (F-AUD-04, non construit dans ce depot). Revalide server-side que
 * chaque id signale appartient bien a l'historique du patient connecte
 * (Zero Trust : jamais confiance dans une liste d'ids fournie par le client).
 */
export async function signalerAccesSuspectAction(
  prevState: PatientActionState,
  formData: FormData
): Promise<PatientActionState> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const entreeIds = formData.getAll("entreeId").map(String).filter((id) => id.length > 0);

  if (entreeIds.length === 0) {
    return { error: "Aucun accès à signaler.", success: false };
  }

  const accesConnus = await getMesAccesDossier();
  const idsValides = new Set(accesConnus.map((acces) => acces.id));
  const idsAValider = entreeIds.filter((id) => idsValides.has(id));

  if (idsAValider.length === 0) {
    return { error: "Cet accès n'a pas pu être retrouvé dans votre historique.", success: false };
  }

  const adresseTechnique = await adresseTechniqueCourante();
  const motif = String(formData.get("motif") ?? "").trim();
  const justification = motif.length > 0 ? motif : "Accès non reconnu par le patient";

  await prisma.journalAudit.createMany({
    data: idsAValider.map((id) => ({
      utilisateurId: patient.userId,
      action: "signalement_acces_suspect",
      donneeConcernee: `journal_audit:${id}`,
      adresseTechnique,
      justification,
    })),
  });

  return { error: null, success: true };
}

/**
 * Recherche un professionnel de sante valide, pour le selecteur "a qui
 * accorder l'acces" (F-CIT-10) : jamais la liste complete des professionnels
 * du pays (des milliers de lignes a l'echelle nationale), seulement les 20
 * meilleurs resultats sur le nom, la specialite ou l'etablissement, des 3
 * caracteres. Exclut les professionnels deja autorises avec un consentement
 * actif pour le patient connecte.
 */
export async function rechercherProfessionnelsPourPartageAction(terme: string): Promise<ProfessionnelDisponible[]> {
  const patient = await patientDeLaSessionCourante();

  if (!patient || !rechercheProfessionnelSuffisante(terme)) {
    return [];
  }

  const termeNormalise = normaliserPourRecherche(terme);

  const [professionnels, consentementsActifs] = await Promise.all([
    prisma.professionnelSante.findMany({
      where: { statutValidation: "valide" },
      include: { user: true, etablissement: true },
    }),
    prisma.consentement.findMany({
      where: { patientId: patient.id, statut: "actif" },
      select: { acteurAutoriseId: true },
    }),
  ]);

  const idsDejaAutorises = new Set(consentementsActifs.map((c) => c.acteurAutoriseId));

  return professionnels
    .filter((professionnel) => !idsDejaAutorises.has(professionnel.userId))
    .map((professionnel) => ({
      userId: professionnel.userId,
      nomComplet: nomCompletActeur(professionnel.user, true),
      specialite: professionnel.specialite,
      etablissementNom: professionnel.etablissement.nom,
    }))
    .filter((professionnel) =>
      normaliserPourRecherche(`${professionnel.nomComplet} ${professionnel.specialite} ${professionnel.etablissementNom}`).includes(
        termeNormalise
      )
    )
    .slice(0, MAX_RESULTATS_RECHERCHE_PROFESSIONNEL);
}

/**
 * Met a jour le dossier du patient connecte (groupe sanguin, allergies,
 * antecedents, maladies chroniques, contact d'urgence). Ne redirige pas :
 * l'ecran reste sur la meme page et affiche le resultat via l'etat retourne.
 */
export async function updatePatientProfileAction(
  prevState: PatientActionState,
  formData: FormData
): Promise<PatientActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaMiseAJourDossier.safeParse({
    groupeSanguin: formData.get("groupeSanguin"),
    grossesseEnCours: formData.get("grossesseEnCours"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de dossier invalides."),
      success: false,
    };
  }

  try {
    const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

    if (!patient) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const donnees = validation.data;
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.patient.update({
        where: { id: patient.id },
        data: {
          groupeSanguin: donnees.groupeSanguin,
          // Zero Trust : le champ n'est propose a l'ecran que pour sexe "F",
          // mais la valeur soumise n'est retenue que dans ce cas ici aussi,
          // jamais seulement en confiance du client.
          grossesseEnCours: patient.sexe === "F" ? donnees.grossesseEnCours : false,
        },
      }),
      journaliser({
        utilisateurId: session.userId,
        action: "modification",
        donneeConcernee: `patient:${patient.id}`,
        adresseTechnique,
        justification: "Mise a jour du dossier patient par le patient lui-meme",
      }),
    ]);

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la mise a jour du dossier patient :", erreur);
    return {
      error: "Une erreur est survenue lors de la mise a jour du dossier. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Accorde (ou reactive) un consentement du patient connecte vers un acteur
 * autorise. Verifie que l'acteur cible est bien un professionnel de sante
 * valide avant d'accorder l'acces (Zero Trust : l'id transmis par le client
 * n'est jamais suppose fiable).
 */
export async function grantConsentAction(
  prevState: PatientActionState,
  formData: FormData
): Promise<PatientActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaOctroiConsentement.safeParse({
    acteurAutoriseId: formData.get("acteurAutoriseId"),
    typeAcces: formData.get("typeAcces"),
    duree: formData.get("duree"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de consentement invalides."),
      success: false,
    };
  }

  const { acteurAutoriseId, typeAcces, duree } = validation.data;

  try {
    const patient = await prisma.patient.findUnique({
      where: { userId: session.userId },
      include: { user: true },
    });

    if (!patient) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const professionnelCible = await prisma.professionnelSante.findUnique({
      where: { userId: acteurAutoriseId },
    });

    if (!professionnelCible || professionnelCible.statutValidation !== "valide") {
      return {
        error: "Ce professionnel de sante n'est pas disponible pour recevoir un acces.",
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const maintenant = new Date();
    const dateFin = calculerDateFinConsentement(duree, maintenant);

    const consentement = await prisma.consentement.upsert({
      where: {
        patientId_acteurAutoriseId: {
          patientId: patient.id,
          acteurAutoriseId,
        },
      },
      create: {
        patientId: patient.id,
        acteurAutoriseId,
        typeAcces,
        statut: "actif",
        dateDebut: maintenant,
        dateFin,
      },
      update: {
        typeAcces,
        statut: "actif",
        dateDebut: maintenant,
        dateFin,
      },
    });

    await journaliser({
      utilisateurId: session.userId,
      action: "consentement_accorde",
      donneeConcernee: `consentement:${consentement.id}`,
      adresseTechnique,
      justification: `Consentement accorde (${typeAcces}, ${duree}) a l'acteur ${acteurAutoriseId}, jusqu'au ${dateFin.toISOString()}`,
    });

    // N-CONSENT-GRANTED (catalogue F-NOT-04) : notification interne seule, pas de SMS.
    await creerNotification(
      acteurAutoriseId,
      "consentement_accorde",
      `${patient.user.prenom} ${patient.user.nom} vous a accordé l'accès à son dossier (${LIBELLES_TYPE_ACCES[typeAcces] ?? typeAcces}) jusqu'au ${dateFin.toLocaleDateString("fr-FR")}.`,
      "/app/medecin/patients"
    );

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'octroi du consentement :", erreur);
    return {
      error: "Une erreur est survenue lors de l'octroi du consentement. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Retire un consentement du patient connecte. Verifie d'abord que le
 * consentement transmis appartient bien au patient connecte (Zero Trust :
 * ne jamais faire confiance a l'id transmis sans verification de propriete)
 * avant de le modifier.
 */
export async function revokeConsentAction(
  prevState: PatientActionState,
  formData: FormData
): Promise<PatientActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaRetraitConsentement.safeParse({
    consentementId: formData.get("consentementId"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Consentement invalide."),
      success: false,
    };
  }

  const { consentementId } = validation.data;

  try {
    const patient = await prisma.patient.findUnique({
      where: { userId: session.userId },
      include: { user: true },
    });

    if (!patient) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const consentement = await prisma.consentement.findUnique({
      where: { id: consentementId },
    });

    if (!consentement || consentement.patientId !== patient.id) {
      return { error: "Ce consentement est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.consentement.update({
        where: { id: consentement.id },
        data: { statut: "retire", dateFin: new Date() },
      }),
      journaliser({
        utilisateurId: session.userId,
        action: "consentement_retire",
        donneeConcernee: `consentement:${consentement.id}`,
        adresseTechnique,
        justification: `Consentement retire vers l'acteur ${consentement.acteurAutoriseId}`,
      }),
    ]);

    // N-CONSENT-REVOKED (catalogue F-NOT-04) : notification interne seule, pas de SMS.
    await creerNotification(
      consentement.acteurAutoriseId,
      "consentement_retire",
      `${patient.user.prenom} ${patient.user.nom} a retiré votre accès à son dossier (${LIBELLES_TYPE_ACCES[consentement.typeAcces] ?? consentement.typeAcces}).`,
      "/app/medecin/patients"
    );

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du retrait du consentement :", erreur);
    return {
      error: "Une erreur est survenue lors du retrait du consentement. Veuillez reessayer.",
      success: false,
    };
  }
}
