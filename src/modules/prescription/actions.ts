"use server";

/**
 * Server Actions du module prescription : ordonnances electroniques.
 * Contrat d'integration Phase 5, consomme par les ecrans
 * src/app/app/patient/** et src/app/app/medecin/** (autres agents).
 *
 * Meme principe applique de bout en bout que src/modules/clinical/actions.ts
 * et src/modules/patient/actions.ts : Zero Trust. Le patient ou le
 * professionnel courant est toujours derive de getSession(), jamais d'un id
 * transmis par le client dans un formulaire. Une prescription est toujours
 * rattachee a une Consultation deja existante, et cette consultation doit
 * appartenir au professionnel connecte (verifie en base avant toute
 * ecriture, jamais suppose). Toute creation de prescription est tracee a la
 * fois dans EvenementPrescription (historique metier du cycle de vie de la
 * prescription) et dans JournalAudit (trace transverse obligatoire).
 *
 * Perimetre de cette phase (voir README.md pour le detail) : le medecin cree
 * directement une prescription au statut "validee" (il vient d'examiner le
 * patient) ; il n'y a pas de flux de validation separee, et la delivrance en
 * pharmacie (statuts "delivree"/"delivree_partiellement") releve d'un module
 * pharmacie a construire plus tard.
 */

import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession, destroySession } from "@/lib/session";
import { can } from "@/security/permissions";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { MESSAGE_MODULE_INACTIF } from "@/modules/administration/modules-actifs";
import { creerNotification } from "@/modules/notification/creer";
import {
  reauthentificationBloquee,
  reauthentificationRecente,
  enregistrerReauthentificationReussie,
  enregistrerEchecReauthentification,
} from "./reauthentification";
// Defaut trouve et corrige par une autre session ce soir (voir
// docs/coordination-agents.md) : creerNotification(patient.userId, ...)
// perd silencieusement une notification quand ce patient est une personne
// a charge (sans_compte, F-CIT-07/08). Applique ici a la notification de
// signature (F-PRE-04).
import { destinataireNotificationPatient } from "@/modules/facility/destinataire-notification-patient";
import {
  allergieCorrespondante,
  LONGUEUR_MIN_JUSTIFICATION_FORCAGE,
} from "./referentiel-allergies";
import {
  avertissementPourLigne,
  libelleAvertissement,
  type LigneComparable,
} from "./controles-doublons";
import {
  ageMinimumNonAtteint,
  libelleAgeMinimum,
  grossesseIncompatible,
  dureeAntibiotiqueExcessive,
} from "./controles-securite";
import {
  MOTIFS_NON_DELIVRANCE_VALEURS,
  LONGUEUR_MIN_MOTIF_ANNULATION_DELIVRANCE,
  HEURES_FENETRE_ANNULATION_DELIVRANCE,
  delaiAnnulationDelivranceDepasse,
  type MotifNonDelivrance,
} from "./referentiel-delivrance";
import {
  UNITES_POSOLOGIE,
  VOIES_POSOLOGIE,
  FREQUENCES_POSOLOGIE,
  precisionAutreManquante,
  composerPosologie,
} from "./posologie";
import { ageAnnees } from "@/modules/clinical/controles-constantes";
import { MESSAGE_ORDRE_NON_VERIFIE, professionnelValide } from "@/modules/administration/validation-professionnels-controle";
import { calculerEmpreinteOrdonnance } from "./empreinte";
import {
  DUREE_TRAITEMENT_MAX_JOURS,
  MESSAGE_DUREE_TROP_LONGUE,
  MESSAGE_POIDS_MANQUANT,
  MESSAGE_TROP_DE_LIGNES,
  NOMBRE_LIGNES_MAX,
  debutFenetrePoids,
  poidsRecent,
  JOURS_VALIDITE_ORDONNANCE,
  dateFinValiditeOrdonnance,
  ordonnanceExpiree,
  poidsRequisPourPatient,
  type PoidsRetenu,
} from "./regles-ordonnance";
import { verrouillerOrdonnance } from "./verrou";
import { rechercherMedicaments as filtrerMedicaments, termeMedicamentSuffisant } from "./recherche-medicaments";
import { validerNonSubstituable } from "./non-substituable";
import {
  creerJetonPresentation,
  debutJourBenin,
  debutJourSuivantBenin,
  jetonPresentationValide,
} from "./presentation";

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface PrescriptionActionState {
  error: string | null;
  success: boolean;
}

/** Medicament du catalogue, tel que propose dans un selecteur de creation de prescription. */
export interface MedicamentOption {
  id: string;
  nom: string;
  principeActif: string;
  dosage: string;
  forme: string;
  // Utilise cote client pour l'alerte allergie immediate (F-PRE-02), voir
  // src/modules/prescription/referentiel-allergies.ts. La verification
  // serveur ci-dessous reste la seule autorite reelle.
  classeTherapeutique: string;
  // F-PRE-02, controles "age" et "grossesse" (src/modules/prescription/controles-securite.ts),
  // meme principe que classeTherapeutique ci-dessus : disponibles cote client
  // pour un retour immediat, la verification serveur reste seule autorite.
  ageMinimumMois: number | null;
  contreIndiqueGrossesse: boolean;
  // F-PRE-03 : affichage dans les resultats de recherche.
  nomsCommerciaux: string[];
  codeAtc: string;
  essentiel: boolean;
}

/** Detail d'une ligne de prescription, enrichi des informations du medicament. */
export interface LignePrescriptionDetail {
  medicamentId: string;
  medicamentNom: string;
  principeActif: string;
  dosage: string;
  forme: string;
  posologie: string;
  quantite: number;
  dureeTraitementJours: number;
  // F-PRE-01 / RG-PHA-12 : ligne que la pharmacie ne peut pas remplacer par un generique.
  nonSubstituable: boolean;
  motifNonSubstituable: string | null;
}

/** Resume d'une prescription, pret a afficher cote ecran patient ou professionnel. */
export interface PrescriptionResume {
  id: string;
  // F-PRE-05 : utilise cote medecin pour construire le lien "Renouveler"
  // (redirige vers /app/medecin/prescriptions/nouvelle avec cette meme
  // consultation, deja possedee par ce medecin).
  consultationId: string;
  date: string; // ISO
  statut: string;
  // Numero d'ordonnance lisible (F-PRE-04 du pack), format RX-<annee>-<sequence 4 chiffres>.
  numero: string;
  instructions: string;
  lignes: LignePrescriptionDetail[];
  medecinNomComplet: string | null; // rempli cote patient
  patientNomComplet: string | null; // rempli cote professionnel
  patientIdentifiantSante: string | null; // rempli cote professionnel
  consultationMotif: string;
  // F-PRE-05 du pack : vrai uniquement sur la liste "mes prescriptions" du
  // medecin auteur (jamais cote patient ni pharmacien, qui n'agissent pas sur
  // ces boutons), voir getPrescriptionsDuProfessionnel.
  peutEtreAnnulee: boolean;
  peutEtreArretee: boolean;
}

/** Ligne soumise depuis le formulaire de creation, avant validation zod. */
const schemaLigneSoumise = z.object({
  medicamentId: z.string().trim().min(1, "Le medicament est obligatoire."),
  // F-PRE-03, version reduite (voir src/modules/prescription/posologie.ts) :
  // champs structures valides ici, composes en la chaine stockee plus bas
  // (jamais une chaine de posologie composee cote client, Zero Trust).
  dose: z.coerce
    .number({ message: "La dose doit etre un nombre." })
    .positive("La dose doit etre strictement positive."),
  unite: z.enum(UNITES_POSOLOGIE, { message: "L'unite de dose est invalide." }),
  voie: z.enum(VOIES_POSOLOGIE, { message: "La voie d'administration est invalide." }),
  voieAutre: z.string().trim().optional().default(""),
  frequence: z.enum(FREQUENCES_POSOLOGIE, { message: "La frequence est invalide." }),
  frequenceAutre: z.string().trim().optional().default(""),
  quantite: z.coerce
    .number({ message: "La quantite doit etre un nombre." })
    .int("La quantite doit etre un nombre entier.")
    .positive("La quantite doit etre strictement positive."),
  dureeTraitementJours: z.coerce
    .number({ message: "La duree de traitement doit etre un nombre." })
    .int("La duree de traitement doit etre un nombre entier.")
    .positive("La duree de traitement doit etre strictement positive.")
    .max(DUREE_TRAITEMENT_MAX_JOURS, MESSAGE_DUREE_TROP_LONGUE),
  // F-PRE-02 / RG-PRE-10 : forcage d'une alerte allergie bloquante, avec
  // justification obligatoire (20 caracteres minimum), trace en audit.
  forcerAlerteAllergie: z.coerce.boolean().optional().default(false),
  justificationForcage: z.string().trim().optional().default(""),
  // F-PRE-02, controles "age" et "grossesse" : meme niveau Bloquant que
  // l'allergie ci-dessus. Reutilisent justificationForcage (une seule
  // justification par ligne, meme si plusieurs alertes bloquantes se
  // declenchent en meme temps) plutot qu'un champ dedie par controle :
  // simplification assumee pour ne pas multiplier les champs de formulaire.
  forcerAlerteAge: z.coerce.boolean().optional().default(false),
  forcerAlerteGrossesse: z.coerce.boolean().optional().default(false),
  // F-PRE-02 : avertissement "doublon" ou "meme classe" (niveau Avertissement,
  // pas Bloquant) : une simple confirmation suffit, pas de justification.
  confirmerAvertissement: z.coerce.boolean().optional().default(false),
  // F-PRE-02 : avertissement "duree" (> 30 jours pour un antibiotique), meme
  // niveau Avertissement que ci-dessus.
  confirmerAvertissementDuree: z.coerce.boolean().optional().default(false),
  // F-PRE-01 / RG-PHA-12 : "non substituable", avec motif obligatoire
  // (non-substituable.ts). z.coerce.boolean() ne convient pas ici : la chaine
  // "false" serait lue comme vraie, alors que le formulaire envoie un vrai booleen.
  nonSubstituable: z.boolean().optional().default(false),
  motifNonSubstituable: z.string().optional().default(""),
});

const schemaCreationPrescription = z.object({
  consultationId: z.string().trim().min(1, "La consultation est obligatoire."),
  instructions: z.string().trim().optional().default(""),
  // RG-PRE-30 du pack : la signature (ici confondue avec la creation, voir
  // le commentaire au-dessus de creerPrescriptionAction) exige une
  // re-authentification, sauf si elle a eu lieu depuis moins de 5 minutes
  // (prescription/reauthentification.ts, reauthentificationRecente). Vide
  // et accepte dans ce cas ; sinon obligatoire, revalide dans l'action
  // elle-meme (le formulaire l'exige deja cote client hors fenetre de
  // grace, Zero Trust : jamais confiance dans ce que le client a valide).
  motDePasseSignature: z.string().optional().default(""),
  lignes: z
    .array(schemaLigneSoumise)
    .min(1, "Au moins un medicament est obligatoire dans la prescription.")
    .max(NOMBRE_LIGNES_MAX, MESSAGE_TROP_DE_LIGNES),
});

/** Motif a enregistrer pour une ligne deja validee par validerNonSubstituable (null si non concerne). */
function motifNonSubstituableDeLaLigne(resultat: ReturnType<typeof validerNonSubstituable> | undefined): string | null {
  return resultat && resultat.ok ? resultat.motif : null;
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

/** Lit un champ texte d'un FormData, jamais null (chaine vide si absent). */
function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

/** Nom complet d'un utilisateur, sans prefixe. */
function nomComplet(utilisateur: { nom: string; prenom: string }): string {
  return `${utilisateur.prenom} ${utilisateur.nom}`;
}

/** Nom complet d'un professionnel de sante, prefixe de "Dr." (meme convention que les autres modules). */
function nomCompletProfessionnel(utilisateur: { nom: string; prenom: string }): string {
  return `Dr. ${utilisateur.prenom} ${utilisateur.nom}`;
}

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

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/**
 * Numero d'ordonnance lisible (F-PRE-04 du pack, format RX-XXXX-XXXX) :
 * RX-<annee>-<sequence sur 4 chiffres dans l'annee>, meme principe que
 * src/modules/identity/identifiants.ts (comptage, pas de sequence DB dediee).
 * Doit etre appele dans la meme transaction que la creation pour eviter un
 * doublon en cas d'ecritures concurrentes.
 */
async function genererNumeroOrdonnance(tx: Prisma.TransactionClient, date: Date): Promise<string> {
  const annee = date.getFullYear();
  const compte = await tx.prescription.count({
    where: { numero: { startsWith: `RX-${annee}-` } },
  });
  return `RX-${annee}-${String(compte + 1).padStart(4, "0")}`;
}

/** Recupere le profil Patient du titulaire de la session courante, ou null si absent. */
async function patientDeLaSessionCourante() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  return prisma.patient.findUnique({ where: { userId: session.userId } });
}

/** Recupere le profil ProfessionnelSante du titulaire de la session courante, ou null si absent. */
async function professionnelDeLaSessionCourante() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  return prisma.professionnelSante.findUnique({ where: { userId: session.userId } });
}

/** Met en forme une prescription (avec ses lignes et medicaments) en PrescriptionResume. */
function versPrescriptionResume(
  prescription: {
    id: string;
    consultationId: string;
    date: Date;
    statut: string;
    numero: string;
    instructions: string;
    consultation: { motif: string };
    lignes: {
      medicamentId: string;
      posologie: string;
      quantite: number;
      dureeTraitementJours: number;
      nonSubstituable: boolean;
      motifNonSubstituable: string | null;
      medicament: { nom: string; principeActif: string; dosage: string; forme: string };
    }[];
  },
  options: {
    medecinNomComplet: string | null;
    patientNomComplet: string | null;
    patientIdentifiantSante: string | null;
    peutEtreAnnulee: boolean;
    peutEtreArretee: boolean;
  }
): PrescriptionResume {
  return {
    id: prescription.id,
    consultationId: prescription.consultationId,
    date: prescription.date.toISOString(),
    statut: prescription.statut,
    numero: prescription.numero,
    instructions: prescription.instructions,
    consultationMotif: prescription.consultation.motif,
    lignes: prescription.lignes.map((ligne) => ({
      medicamentId: ligne.medicamentId,
      medicamentNom: ligne.medicament.nom,
      principeActif: ligne.medicament.principeActif,
      dosage: ligne.medicament.dosage,
      forme: ligne.medicament.forme,
      posologie: ligne.posologie,
      quantite: ligne.quantite,
      dureeTraitementJours: ligne.dureeTraitementJours,
      nonSubstituable: ligne.nonSubstituable,
      motifNonSubstituable: ligne.motifNonSubstituable,
    })),
    medecinNomComplet: options.medecinNomComplet,
    patientNomComplet: options.patientNomComplet,
    patientIdentifiantSante: options.patientIdentifiantSante,
    peutEtreAnnulee: options.peutEtreAnnulee,
    peutEtreArretee: options.peutEtreArretee,
  };
}

/**
 * Recherche dans le referentiel des medicaments actifs (F-PRE-03 du pack) : a
 * partir de 3 caracteres, insensible aux accents et a la casse, sur la DCI, le
 * nom et les noms commerciaux ; essentiels d'abord, puis ordre alphabetique ;
 * 20 resultats au plus (voir ./recherche-medicaments). Reservee aux roles qui
 * peuvent creer une ordonnance. Un medicament desactive (RG-PRE-20) n'est
 * jamais propose, mais reste lisible sur les ordonnances existantes.
 *
 * Remplace l'ancien chargement du catalogue entier dans un `select` : rien
 * n'est renvoye sans terme, et le client ne recoit que les 20 lignes utiles.
 */
export async function rechercherMedicamentsAction(terme: string): Promise<MedicamentOption[]> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "prescription"))) {
    return [];
  }

  if (typeof terme !== "string" || terme.length > 100 || !termeMedicamentSuffisant(terme)) {
    return [];
  }

  // Le filtrage accent-insensible se fait en memoire : le catalogue est de
  // l'ordre de quelques centaines de presentations, et une recherche SQL
  // insensible aux accents demanderait l'extension unaccent, non garantie.
  const catalogue = await prisma.medicament.findMany({
    where: { actif: true },
    select: {
      id: true,
      nom: true,
      principeActif: true,
      dosage: true,
      forme: true,
      classeTherapeutique: true,
      ageMinimumMois: true,
      contreIndiqueGrossesse: true,
      nomsCommerciaux: true,
      codeAtc: true,
      essentiel: true,
    },
  });

  return filtrerMedicaments(catalogue, terme);
}

/**
 * Recupere l'historique des prescriptions du patient connecte (derive de
 * getSession(), jamais d'id en parametre), du plus recent au plus ancien.
 */
export async function getMesPrescriptions(): Promise<PrescriptionResume[]> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return [];
  }

  const prescriptions = await prisma.prescription.findMany({
    where: { patientId: patient.id },
    include: {
      consultation: true,
      medecinPrescripteur: { include: { user: true } },
      lignes: { include: { medicament: true } },
    },
    orderBy: { date: "desc" },
  });

  return prescriptions.map((prescription) =>
    versPrescriptionResume(prescription, {
      medecinNomComplet: nomCompletProfessionnel(prescription.medecinPrescripteur.user),
      patientNomComplet: null,
      patientIdentifiantSante: null,
      // F-PRE-05 : le patient ne dispose d'aucun de ces boutons, seul le
      // medecin auteur agit sur sa propre liste (getPrescriptionsDuProfessionnel).
      peutEtreAnnulee: false,
      peutEtreArretee: false,
    })
  );
}

/**
 * Pour une prescription du patient connecte, les medicaments dont il manque
 * encore une quantite (F-PHA-03 / CA-2 : le patient doit voir la ligne
 * manquante identifiee sur une prescription "delivree_partiellement"), soit
 * la quantite prescrite moins la somme des LigneDelivrance non annulees pour
 * chaque ligne. Zero Trust : ne renvoie rien pour une prescription qui
 * n'appartient pas au patient connecte (jamais confiance dans le seul
 * prescriptionId transmis).
 */
export async function getLignesEnAttente(
  prescriptionId: string
): Promise<{ medicamentNom: string; quantiteRestante: number }[]> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return [];
  }

  const identifiantNettoye = prescriptionId.trim();

  if (identifiantNettoye.length === 0) {
    return [];
  }

  const prescription = await prisma.prescription.findUnique({
    where: { id: identifiantNettoye },
    include: {
      lignes: {
        include: {
          medicament: true,
          lignesDelivrees: { where: { delivrance: { annulee: false } } },
        },
      },
    },
  });

  if (!prescription || prescription.patientId !== patient.id) {
    return [];
  }

  return prescription.lignes
    .map((ligne) => {
      const quantiteDejaLivree = ligne.lignesDelivrees.reduce(
        (somme, ligneDelivree) => somme + ligneDelivree.quantiteDelivree,
        0
      );
      return { medicamentNom: ligne.medicament.nom, quantiteRestante: ligne.quantite - quantiteDejaLivree };
    })
    .filter((ligne) => ligne.quantiteRestante > 0);
}

/** Une ancienne prescription du patient, telle que proposee au renouvellement (F-PRE-05). */
export interface PrescriptionAncienneResume {
  id: string;
  numero: string;
  date: string; // ISO
  statut: string;
  lignes: { medicamentNom: string; dosage: string; forme: string }[];
}

/**
 * Poids le plus recent (moins de 30 jours) releve pour ce patient, dans une
 * consultation ou une prise en charge infirmiere (RG-PRE-02).
 */
async function poidsRecentDuPatient(patientId: string, maintenant: Date): Promise<PoidsRetenu | null> {
  const depuis = debutFenetrePoids(maintenant);
  const filtre = { patientId, poidsKg: { not: null }, date: { gte: depuis } } as const;
  const [consultations, prisesEnCharge] = await Promise.all([
    prisma.consultation.findMany({ where: filtre, select: { date: true, poidsKg: true }, orderBy: { date: "desc" }, take: 5 }),
    prisma.priseEnChargeInfirmiere.findMany({ where: filtre, select: { date: true, poidsKg: true }, orderBy: { date: "desc" }, take: 5 }),
  ]);

  return poidsRecent([...consultations, ...prisesEnCharge], maintenant);
}

/**
 * Verifie que la consultation identifiee appartient bien au professionnel
 * connecte (Zero Trust), et indique si une prescription existe deja pour
 * cette consultation (evite les doublons par erreur). Retourne null si la
 * consultation est introuvable ou n'appartient pas au professionnel connecte.
 */
export async function getConsultationPourPrescription(consultationId: string): Promise<{
  id: string;
  motif: string;
  patientNomComplet: string;
  patientAllergies: string[];
  // F-PRE-02, controles "age" et "grossesse" : memes donnees que cote
  // serveur dans creerPrescriptionAction, exposees ici pour un retour
  // immediat a l'ecran (src/modules/prescription/controles-securite.ts).
  patientDateNaissanceISO: string;
  patientSexe: string;
  patientGrossesseEnCours: boolean;
  // RG-PRE-02 : poids obligatoire sous 12 ans, et poids retenu s'il existe
  // (moins de 30 jours), pour bloquer la signature des l'ecran.
  patientPoidsRequis: boolean;
  patientPoidsRecentKg: number | null;
  // F-PRE-02 : medicaments des ordonnances actives du patient, pour
  // l'avertissement "doublon"/"meme classe" affiche cote client avant meme
  // la soumission (le serveur reste la seule autorite reelle, voir
  // creerPrescriptionAction).
  patientTraitementsActifs: LigneComparable[];
  dejaPrescription: boolean;
  // F-PRE-05 du pack, "Renouveler" : anciennes prescriptions de ce patient,
  // pour proposer de reprendre les memes lignes plutot que de les ressaisir.
  // Ouvert a tout medecin atteignant cet ecran (deja verifie plus haut que la
  // consultation lui appartient, donc qu'il a un acces reel a ce patient),
  // pas seulement l'auteur d'origine de l'ancienne prescription.
  anciennesPrescriptions: PrescriptionAncienneResume[];
  // RG-PRE-30 : vrai si ce medecin s'est deja re-authentifie (signature
  // reussie) il y a moins de 5 minutes, cote client pour ne pas exiger a
  // nouveau le mot de passe (voir prescription/reauthentification.ts).
  reauthentificationRecente: boolean;
} | null> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return null;
  }

  const identifiantNettoye = consultationId.trim();

  if (identifiantNettoye.length === 0) {
    return null;
  }

  const consultation = await prisma.consultation.findUnique({
    where: { id: identifiantNettoye },
    include: {
      patient: { include: { user: true } },
      prescriptions: { select: { id: true } },
    },
  });

  if (!consultation || consultation.professionnelId !== professionnel.id) {
    return null;
  }

  const prescriptionsActives = await prisma.prescription.findMany({
    where: {
      patientId: consultation.patientId,
      statut: { in: ["validee", "delivree_partiellement"] },
    },
    include: { lignes: { include: { medicament: true } } },
  });

  const patientTraitementsActifs: LigneComparable[] = prescriptionsActives.flatMap((prescription) =>
    prescription.lignes.map((ligne) => ({
      principeActif: ligne.medicament.principeActif,
      classeTherapeutique: ligne.medicament.classeTherapeutique,
    }))
  );

  // F-PRE-05, "Renouveler" : les dernieres prescriptions de ce patient, tous
  // medecins confondus (l'acces a cette consultation vaut deja acces reel au
  // patient, verifie plus haut). Bornee a un nombre raisonnable, la plus
  // recente en premier, meme principe que getHistoriquePatient (pagination)
  // sans en reprendre la complexite ici.
  const NOMBRE_MAX_ANCIENNES_PRESCRIPTIONS = 20;
  const anciennesPrescriptionsBrutes = await prisma.prescription.findMany({
    where: { patientId: consultation.patientId },
    include: { lignes: { include: { medicament: true } } },
    orderBy: { date: "desc" },
    take: NOMBRE_MAX_ANCIENNES_PRESCRIPTIONS,
  });

  const anciennesPrescriptions: PrescriptionAncienneResume[] = anciennesPrescriptionsBrutes.map(
    (prescription) => ({
      id: prescription.id,
      numero: prescription.numero,
      date: prescription.date.toISOString(),
      statut: prescription.statut,
      lignes: prescription.lignes.map((ligne) => ({
        medicamentNom: ligne.medicament.nom,
        dosage: ligne.medicament.dosage,
        forme: ligne.medicament.forme,
      })),
    })
  );

  const maintenant = new Date();
  const poidsRetenu = await poidsRecentDuPatient(consultation.patientId, maintenant);

  return {
    id: consultation.id,
    motif: consultation.motif,
    patientNomComplet: nomComplet(consultation.patient.user),
    patientAllergies: parseListeJSON(consultation.patient.allergies),
    patientDateNaissanceISO: consultation.patient.dateNaissance.toISOString(),
    patientSexe: consultation.patient.sexe,
    patientGrossesseEnCours: consultation.patient.grossesseEnCours,
    patientPoidsRequis: poidsRequisPourPatient(consultation.patient.dateNaissance, maintenant),
    patientPoidsRecentKg: poidsRetenu ? poidsRetenu.poidsKg : null,
    patientTraitementsActifs,
    dejaPrescription: consultation.prescriptions.length > 0,
    anciennesPrescriptions,
    reauthentificationRecente: reauthentificationRecente(professionnel.userId),
  };
}

/**
 * Cree une prescription a l'initiative du professionnel connecte, rattachee
 * a une consultation identifiee par consultationId (Zero Trust : verifie
 * systematiquement que cette consultation appartient bien au professionnel
 * connecte, jamais suppose valide). Valide chaque ligne (medicament existant
 * au catalogue, posologie structuree valide et composee en texte via
 * composerPosologie, voir posologie.ts pour F-PRE-03, quantite et duree de
 * traitement entieres strictement positives), puis applique la regle
 * d'interaction simplifiee :
 * refuse la prescription si deux lignes partagent le meme principe actif.
 * Cree la Prescription (statut "validee") et ses LignePrescription dans une
 * transaction, ecrit un EvenementPrescription (type "creation") et trace la
 * creation dans JournalAudit.
 */
export async function creerPrescriptionAction(
  prevState: PrescriptionActionState,
  formData: FormData
): Promise<PrescriptionActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  // RBAC (voir src/security/permissions.ts) : creer une prescription est
  // reserve au role medecin. Posseder un profil ProfessionnelSante ne suffit
  // pas, le role precis doit etre verifie.
  if (!session.roles.some((role) => can(role, "create", "prescription"))) {
    return { error: "Action reservee aux medecins.", success: false };
  }

  // F-ADM-03 : si l'interrupteur est actif, seul un numero d'Ordre verifie signe.
  if (!(await professionnelValide(session.userId))) {
    return { error: MESSAGE_ORDRE_NON_VERIFIE, success: false };
  }

  const lignesJSON = texte(formData, "lignesJSON");
  let lignesBrutes: unknown;

  try {
    lignesBrutes = lignesJSON.trim().length > 0 ? JSON.parse(lignesJSON) : [];
  } catch {
    return { error: "Les lignes de prescription sont mal formees.", success: false };
  }

  const validation = schemaCreationPrescription.safeParse({
    consultationId: texte(formData, "consultationId"),
    instructions: texte(formData, "instructions"),
    motDePasseSignature: texte(formData, "motDePasseSignature"),
    lignes: lignesBrutes,
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de prescription invalides."),
      success: false,
    };
  }

  const { consultationId, instructions, motDePasseSignature, lignes } = validation.data;

  // RG-PRE-30 : re-authentification obligatoire avant signature, sauf
  // fenetre de grace de 5 minutes (reauthentificationRecente) ; 3 echecs
  // deconnectent la session (destroySession). Verifiee ici, avant tout le
  // reste (controles cliniques, transaction), pour ne jamais laisser croire
  // qu'une prescription a ete "presque" signee.
  if (reauthentificationBloquee(session.userId)) {
    await destroySession();
    return {
      error: "Trop d'echecs de re-authentification. Vous avez ete deconnecte, veuillez vous reconnecter.",
      success: false,
    };
  }

  if (!reauthentificationRecente(session.userId)) {
    if (motDePasseSignature.length === 0) {
      return { error: "Le mot de passe est obligatoire pour signer l'ordonnance.", success: false };
    }

    const utilisateurConnecte = await prisma.user.findUnique({ where: { id: session.userId } });
    const motDePasseValide =
      utilisateurConnecte !== null &&
      (await bcrypt.compare(motDePasseSignature, utilisateurConnecte.motDePasseHash));

    if (!motDePasseValide) {
      const troisiemeEchec = enregistrerEchecReauthentification(session.userId);
      await journaliser({
        utilisateurId: session.userId,
        action: "signature_prescription_mot_de_passe_invalide",
        donneeConcernee: `consultation:${consultationId}`,
        adresseTechnique: await adresseTechniqueCourante(),
        justification: "Tentative de signature de prescription avec un mot de passe incorrect (RG-PRE-30).",
      });

      if (troisiemeEchec) {
        await destroySession();
        return {
          error: "Trop d'echecs de re-authentification. Vous avez ete deconnecte, veuillez vous reconnecter.",
          success: false,
        };
      }

      return { error: "Mot de passe incorrect. La prescription n'a pas ete signee.", success: false };
    }

    enregistrerReauthentificationReussie(session.userId);
  }

  // F-PRE-03 : "voie" ou "frequence" a "autre" exige la precision en texte
  // libre correspondante (deja verifie cote formulaire, revalide ici, Zero
  // Trust).
  if (lignes.some((ligne) => precisionAutreManquante(ligne))) {
    return {
      error: "Precisez la voie ou la frequence quand vous choisissez \"Autre\".",
      success: false,
    };
  }

  // F-PRE-01 : une ligne "non substituable" exige un motif (revalide ici, Zero Trust).
  const nonSubstituables = lignes.map((ligne) => validerNonSubstituable(ligne.nonSubstituable, ligne.motifNonSubstituable));
  const nonSubstituableInvalide = nonSubstituables.find((resultat) => !resultat.ok);

  if (nonSubstituableInvalide && !nonSubstituableInvalide.ok) {
    return { error: nonSubstituableInvalide.error, success: false };
  }

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation || consultation.professionnelId !== professionnel.id) {
      return { error: "Cette consultation est introuvable.", success: false };
    }

    const patient = await prisma.patient.findUnique({ where: { id: consultation.patientId } });

    // RG-PRE-02 : sous 12 ans, un poids de moins de 30 jours est obligatoire avant la signature.
    const maintenantSignature = new Date();
    if (patient && poidsRequisPourPatient(patient.dateNaissance, maintenantSignature)) {
      if (!(await poidsRecentDuPatient(patient.id, maintenantSignature))) {
        return { error: MESSAGE_POIDS_MANQUANT, success: false };
      }
    }

    const idsMedicaments = [...new Set(lignes.map((ligne) => ligne.medicamentId))];
    const medicamentsTrouves = await prisma.medicament.findMany({
      where: { id: { in: idsMedicaments } },
    });

    if (medicamentsTrouves.length !== idsMedicaments.length) {
      return { error: "Un des medicaments selectionnes est introuvable au catalogue.", success: false };
    }

    // RG-PRE-20 : un medicament retire du referentiel n'est plus prescriptible
    // (la recherche ne le propose plus ; refus aussi pour une saisie forgee).
    if (medicamentsTrouves.some((medicament) => medicament.actif === false)) {
      return {
        error: "Un des medicaments selectionnes a ete retire du referentiel. Choisissez-en un autre.",
        success: false,
      };
    }

    const medicamentParId = new Map(medicamentsTrouves.map((medicament) => [medicament.id, medicament]));

    for (const ligne of lignes) {
      if (!medicamentParId.has(ligne.medicamentId)) {
        return { error: "Un des medicaments selectionnes est introuvable au catalogue.", success: false };
      }
    }

    // F-PRE-02 : controles "doublon" et "meme classe" (niveau Avertissement,
    // pas Bloquant) : meme DCI ou meme classe therapeutique deja presente
    // dans cette ordonnance OU dans une ordonnance active du patient
    // (controles-doublons.ts). RG-PRE-12 : une aide, pas un blocage
    // definitif -> simple confirmation, pas de justification exigee.
    const prescriptionsActives = await prisma.prescription.findMany({
      where: {
        patientId: consultation.patientId,
        statut: { in: ["validee", "delivree_partiellement"] },
      },
      include: { lignes: { include: { medicament: true } } },
    });

    const traitementsActifs: LigneComparable[] = prescriptionsActives.flatMap((prescription) =>
      prescription.lignes.map((ligne) => ({
        principeActif: ligne.medicament.principeActif,
        classeTherapeutique: ligne.medicament.classeTherapeutique,
      }))
    );

    const lignesDejaRetenues: LigneComparable[] = [...traitementsActifs];

    for (const ligne of lignes) {
      const medicament = medicamentParId.get(ligne.medicamentId);
      if (!medicament) continue;

      const candidate: LigneComparable = {
        principeActif: medicament.principeActif,
        classeTherapeutique: medicament.classeTherapeutique,
      };

      const avertissement = avertissementPourLigne(candidate, lignesDejaRetenues);

      if (avertissement && !ligne.confirmerAvertissement) {
        return {
          error: `${medicament.nom} : ${libelleAvertissement(avertissement)} Confirmez si vous souhaitez maintenir cette ligne malgre tout, ou retirez-la.`,
          success: false,
        };
      }

      lignesDejaRetenues.push(candidate);
    }

    // F-PRE-02 : controle de securite "duree" (niveau Avertissement, pas
    // Bloquant, meme famille que doublon/meme classe ci-dessus) : duree de
    // traitement superieure a 30 jours pour un antibiotique.
    for (const ligne of lignes) {
      const medicament = medicamentParId.get(ligne.medicamentId);
      if (!medicament) continue;

      if (
        dureeAntibiotiqueExcessive(medicament, ligne.dureeTraitementJours) &&
        !ligne.confirmerAvertissementDuree
      ) {
        return {
          error: `${medicament.nom} : duree de traitement de ${ligne.dureeTraitementJours} jours superieure a 30 jours pour un antibiotique. Confirmez si vous souhaitez maintenir cette duree, ou reduisez-la.`,
          success: false,
        };
      }
    }

    // F-PRE-02 / RG-PRE-10 : controle de securite allergie <-> medicament,
    // sur la DCI et sur la classe therapeutique (referentiel-allergies.ts).
    // Bloquant : soit la ligne est retiree par le medecin, soit il force
    // avec une justification d'au moins 20 caracteres, tracee en audit.
    const allergiesPatient = patient ? parseListeJSON(patient.allergies) : [];
    const lignesForcees: { medicamentNom: string; allergie: string; justification: string }[] = [];

    if (allergiesPatient.length > 0) {
      for (const ligne of lignes) {
        const medicament = medicamentParId.get(ligne.medicamentId);
        if (!medicament) continue;

        const allergie = allergieCorrespondante(medicament, allergiesPatient);
        if (!allergie) continue;

        if (!ligne.forcerAlerteAllergie) {
          return {
            error: `Alerte allergie bloquante : le patient est declare allergique a "${allergie}", ce qui correspond a ${medicament.nom} (${medicament.principeActif}). Retirez cette ligne ou forcez la prescription avec une justification.`,
            success: false,
          };
        }

        if (ligne.justificationForcage.length < LONGUEUR_MIN_JUSTIFICATION_FORCAGE) {
          return {
            error: `La justification du forcage de l'alerte allergie sur ${medicament.nom} doit comporter au moins ${LONGUEUR_MIN_JUSTIFICATION_FORCAGE} caracteres.`,
            success: false,
          };
        }

        lignesForcees.push({
          medicamentNom: medicament.nom,
          allergie,
          justification: ligne.justificationForcage,
        });
      }
    }

    // F-PRE-02 : controle de securite "age", medicament marque contre-indique
    // avant un age minimum dans le referentiel (controles-securite.ts).
    // Bloquant, meme mecanisme de forcage justifie que l'allergie ci-dessus.
    const lignesForceesAge: { medicamentNom: string; ageMinimumMois: number; justification: string }[] = [];

    if (patient) {
      for (const ligne of lignes) {
        const medicament = medicamentParId.get(ligne.medicamentId);
        if (!medicament) continue;

        const ageMinimumMois = ageMinimumNonAtteint(medicament, patient);
        if (ageMinimumMois === null) continue;

        if (!ligne.forcerAlerteAge) {
          return {
            error: `Alerte age bloquante : ${medicament.nom} est contre-indique avant ${libelleAgeMinimum(ageMinimumMois)}. Retirez cette ligne ou forcez la prescription avec une justification.`,
            success: false,
          };
        }

        if (ligne.justificationForcage.length < LONGUEUR_MIN_JUSTIFICATION_FORCAGE) {
          return {
            error: `La justification du forcage de l'alerte age sur ${medicament.nom} doit comporter au moins ${LONGUEUR_MIN_JUSTIFICATION_FORCAGE} caracteres.`,
            success: false,
          };
        }

        lignesForceesAge.push({
          medicamentNom: medicament.nom,
          ageMinimumMois,
          justification: ligne.justificationForcage,
        });
      }
    }

    // F-PRE-02 : controle de securite "grossesse", medicament marque
    // contre-indique pendant la grossesse et patiente avec grossesse en
    // cours declaree (controles-securite.ts). Bloquant, meme mecanisme de
    // forcage justifie que l'allergie et l'age ci-dessus.
    const lignesForceesGrossesse: { medicamentNom: string; justification: string }[] = [];

    if (patient) {
      for (const ligne of lignes) {
        const medicament = medicamentParId.get(ligne.medicamentId);
        if (!medicament) continue;

        if (!grossesseIncompatible(medicament, patient)) continue;

        if (!ligne.forcerAlerteGrossesse) {
          return {
            error: `Alerte grossesse bloquante : ${medicament.nom} est contre-indique pendant la grossesse, or la patiente a une grossesse en cours declaree. Retirez cette ligne ou forcez la prescription avec une justification.`,
            success: false,
          };
        }

        if (ligne.justificationForcage.length < LONGUEUR_MIN_JUSTIFICATION_FORCAGE) {
          return {
            error: `La justification du forcage de l'alerte grossesse sur ${medicament.nom} doit comporter au moins ${LONGUEUR_MIN_JUSTIFICATION_FORCAGE} caracteres.`,
            success: false,
          };
        }

        lignesForceesGrossesse.push({
          medicamentNom: medicament.nom,
          justification: ligne.justificationForcage,
        });
      }
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const dateCreation = new Date();
    // F-PRE-04 du pack : numero + empreinte fixes des la creation (voir la
    // remarque sur le perimetre de cette phase dans la docstring de module :
    // pas de signature separee, la prescription est deja "validee" a la
    // creation).
    const empreinteContenu = calculerEmpreinteOrdonnance({
      patientId: consultation.patientId,
      prescripteurId: professionnel.id,
      etablissementId: consultation.etablissementId,
      date: dateCreation,
      instructions,
      lignes: lignes.map((ligne) => ({
        medicamentId: ligne.medicamentId,
        posologie: composerPosologie(ligne),
        quantite: ligne.quantite,
        dureeTraitementJours: ligne.dureeTraitementJours,
        nonSubstituable: ligne.nonSubstituable,
      })),
    });

    const prescriptionCreeeId = await prisma.$transaction(async (tx) => {
      const numero = await genererNumeroOrdonnance(tx, dateCreation);

      const prescriptionCreee = await tx.prescription.create({
        data: {
          consultationId: consultation.id,
          medecinPrescripteurId: professionnel.id,
          patientId: consultation.patientId,
          date: dateCreation,
          statut: "validee",
          numero,
          empreinteContenu,
          instructions,
          lignes: {
            create: lignes.map((ligne, index) => ({
              medicamentId: ligne.medicamentId,
              posologie: composerPosologie(ligne),
              quantite: ligne.quantite,
              dureeTraitementJours: ligne.dureeTraitementJours,
              nonSubstituable: ligne.nonSubstituable,
              motifNonSubstituable: motifNonSubstituableDeLaLigne(nonSubstituables[index]),
            })),
          },
        },
      });

      await tx.evenementPrescription.create({
        data: {
          prescriptionId: prescriptionCreee.id,
          type: "creation",
          utilisateurId: session.userId,
          commentaire: null,
        },
      });

      for (const ligneForcee of lignesForcees) {
        await tx.evenementPrescription.create({
          data: {
            prescriptionId: prescriptionCreee.id,
            type: "forcage_alerte_allergie",
            utilisateurId: session.userId,
            commentaire: `Alerte allergie "${ligneForcee.allergie}" forcee pour ${ligneForcee.medicamentNom} : ${ligneForcee.justification}`,
          },
        });

        await journaliser(
          {
            utilisateurId: session.userId,
            action: "forcage_alerte_allergie",
            donneeConcernee: `prescription:${prescriptionCreee.id}`,
            adresseTechnique,
            justification: `Allergie "${ligneForcee.allergie}" forcee pour ${ligneForcee.medicamentNom} : ${ligneForcee.justification}`,
          },
          tx
        );
      }

      for (const ligneForcee of lignesForceesAge) {
        await tx.evenementPrescription.create({
          data: {
            prescriptionId: prescriptionCreee.id,
            type: "forcage_alerte_age",
            utilisateurId: session.userId,
            commentaire: `Alerte age (< ${libelleAgeMinimum(ligneForcee.ageMinimumMois)}) forcee pour ${ligneForcee.medicamentNom} : ${ligneForcee.justification}`,
          },
        });

        await journaliser(
          {
            utilisateurId: session.userId,
            action: "forcage_alerte_age",
            donneeConcernee: `prescription:${prescriptionCreee.id}`,
            adresseTechnique,
            justification: `Alerte age (< ${libelleAgeMinimum(ligneForcee.ageMinimumMois)}) forcee pour ${ligneForcee.medicamentNom} : ${ligneForcee.justification}`,
          },
          tx
        );
      }

      for (const ligneForcee of lignesForceesGrossesse) {
        await tx.evenementPrescription.create({
          data: {
            prescriptionId: prescriptionCreee.id,
            type: "forcage_alerte_grossesse",
            utilisateurId: session.userId,
            commentaire: `Alerte grossesse forcee pour ${ligneForcee.medicamentNom} : ${ligneForcee.justification}`,
          },
        });

        await journaliser(
          {
            utilisateurId: session.userId,
            action: "forcage_alerte_grossesse",
            donneeConcernee: `prescription:${prescriptionCreee.id}`,
            adresseTechnique,
            justification: `Alerte grossesse forcee pour ${ligneForcee.medicamentNom} : ${ligneForcee.justification}`,
          },
          tx
        );
      }

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation",
          donneeConcernee: `prescription:${prescriptionCreee.id}`,
          adresseTechnique,
          justification: `Prescription creee pour le patient ${consultation.patientId} suite a la consultation ${consultation.id}`,
        },
        tx
      );

      return prescriptionCreee.id;
    });

    void prescriptionCreeeId;

    // F-PRE-04 du pack : "Il notifie le patient : Une ordonnance a ete
    // ajoutee a votre dossier." Manquait entierement avant ce correctif.
    // Hors transaction (une notification manquee ne doit pas defaire la
    // signature deja actee en base) ; destinataireNotificationPatient route
    // vers le tuteur si le patient est une personne a charge (sans_compte,
    // meme correctif que src/modules/laboratoire/actions.ts).
    if (patient) {
      await creerNotification(
        await destinataireNotificationPatient(patient.id),
        "prescription",
        "Une ordonnance a ete ajoutee a votre dossier.",
        "/app/patient/prescriptions"
      );
    }

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la creation de la prescription :", erreur);
    return {
      error: "Une erreur est survenue lors de la creation de la prescription. Veuillez reessayer.",
      success: false,
    };
  }
}

const LONGUEUR_MIN_MOTIF_ANNULATION_PRESCRIPTION = 10;

const schemaAnnulationOuArretPrescription = z.object({
  prescriptionId: z.string().trim().min(1, "La prescription est obligatoire."),
  motif: z
    .string()
    .trim()
    .min(
      LONGUEUR_MIN_MOTIF_ANNULATION_PRESCRIPTION,
      `Le motif doit comporter au moins ${LONGUEUR_MIN_MOTIF_ANNULATION_PRESCRIPTION} caracteres.`
    ),
});

/**
 * F-PRE-05 du pack, "Annuler" : reservee au medecin auteur (Zero Trust,
 * verifie en base sur medecinPrescripteurId, jamais suppose du seul role),
 * possible seulement si aucune delivrance n'a jamais eu lieu pour cette
 * prescription (meme une delivrance depuis annulee compte : un pharmacien a
 * deja agi dessus, ce n'est plus "jamais commencee" ; utilisez "Arreter"
 * dans ce cas a la place). Motif obligatoire, jamais transmis au patient
 * (meme principe que les observations internes du medecin, defense en
 * profondeur), seulement trace dans EvenementPrescription et JournalAudit.
 */
export async function annulerPrescriptionAction(
  prevState: PrescriptionActionState,
  formData: FormData
): Promise<PrescriptionActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "update", "prescription"))) {
    return { error: "Action reservee aux medecins.", success: false };
  }

  const validation = schemaAnnulationOuArretPrescription.safeParse({
    prescriptionId: texte(formData, "prescriptionId"),
    motif: texte(formData, "motif"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees d'annulation invalides."),
      success: false,
    };
  }

  const { prescriptionId, motif } = validation.data;

  try {
    const professionnel = await professionnelDeLaSessionCourante();

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { patient: true, delivrances: { select: { id: true } } },
    });

    if (!prescription || prescription.medecinPrescripteurId !== professionnel.id) {
      return { error: "Cette prescription est introuvable.", success: false };
    }

    if (prescription.statut === "annulee") {
      return { error: "Cette prescription est deja annulee.", success: false };
    }

    if (prescription.statut === "arretee") {
      return { error: "Cette prescription a deja ete arretee.", success: false };
    }

    if (prescription.delivrances.length > 0) {
      return {
        error:
          "Cette prescription a deja fait l'objet d'une delivrance : utilisez \"Arreter\" pour interrompre le reste, l'annulation totale n'est plus possible.",
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.prescription.update({ where: { id: prescription.id }, data: { statut: "annulee" } });

      await tx.evenementPrescription.create({
        data: {
          prescriptionId: prescription.id,
          type: "annulation",
          utilisateurId: session.userId,
          commentaire: motif,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "annulation",
          donneeConcernee: `prescription:${prescription.id}`,
          adresseTechnique,
          justification: motif,
        },
        tx
      );
    });

    await creerNotification(
      prescription.patient.userId,
      "prescription",
      `Votre ordonnance ${prescription.numero} a ete annulee par votre medecin.`,
      "/app/patient/prescriptions"
    );

    revalidatePath("/app/medecin/prescriptions");

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'annulation de la prescription :", erreur);
    return {
      error: "Une erreur est survenue lors de l'annulation. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * F-PRE-05 du pack, "Arreter" : reservee au medecin auteur, possible
 * seulement apres une delivrance partielle reelle (statut courant
 * "delivree_partiellement"). Interrompt les lignes restantes en faisant
 * passer la prescription au statut terminal "arretee", distinct de
 * "annulee" (une ordonnance annulee n'a jamais ete delivree, une ordonnance
 * arretee l'a ete en partie) : plus aucune delivrance possible ensuite, voir
 * STATUTS_EN_ATTENTE_DE_DELIVRANCE plus bas. Les ordonnances arretees avant
 * le 2026-09-26 restent stockees "annulee" (evenement "arret" en historique).
 */
export async function arreterPrescriptionAction(
  prevState: PrescriptionActionState,
  formData: FormData
): Promise<PrescriptionActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "update", "prescription"))) {
    return { error: "Action reservee aux medecins.", success: false };
  }

  const validation = schemaAnnulationOuArretPrescription.safeParse({
    prescriptionId: texte(formData, "prescriptionId"),
    motif: texte(formData, "motif"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees d'arret invalides."),
      success: false,
    };
  }

  const { prescriptionId, motif } = validation.data;

  try {
    const professionnel = await professionnelDeLaSessionCourante();

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { patient: true },
    });

    if (!prescription || prescription.medecinPrescripteurId !== professionnel.id) {
      return { error: "Cette prescription est introuvable.", success: false };
    }

    if (prescription.statut !== "delivree_partiellement") {
      return {
        error: "Seule une prescription delivree en partie peut etre arretee.",
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.prescription.update({ where: { id: prescription.id }, data: { statut: "arretee" } });

      await tx.evenementPrescription.create({
        data: {
          prescriptionId: prescription.id,
          type: "arret",
          utilisateurId: session.userId,
          commentaire: motif,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "arret",
          donneeConcernee: `prescription:${prescription.id}`,
          adresseTechnique,
          justification: motif,
        },
        tx
      );
    });

    await creerNotification(
      prescription.patient.userId,
      "prescription",
      `Votre ordonnance ${prescription.numero} : la delivrance des medicaments restants a ete arretee par votre medecin.`,
      "/app/patient/prescriptions"
    );

    revalidatePath("/app/medecin/prescriptions");

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'arret de la prescription :", erreur);
    return {
      error: "Une erreur est survenue lors de l'arret. Veuillez reessayer.",
      success: false,
    };
  }
}

const schemaRenouvellementPrescription = z.object({
  prescriptionId: z.string().trim().min(1, "La prescription a renouveler est obligatoire."),
  consultationId: z.string().trim().min(1, "La consultation est obligatoire."),
  // RG-PRE-30 : meme exigence de re-authentification que creerPrescriptionAction
  // (meme fenetre de grace de 5 minutes, meme compteur d'echecs partage par
  // utilisateur, voir reauthentification.ts), un renouvellement cree lui
  // aussi une prescription "validee" (voir la docstring plus bas).
  motDePasseSignature: z.string().optional().default(""),
});

/**
 * F-PRE-05 du pack, "Renouveler" : cree une nouvelle prescription "validee",
 * rattachee a une consultation du medecin connecte (deja verifiee comme lui
 * appartenant par getConsultationPourPrescription, reappliquee ici Zero
 * Trust), en copiant les lignes de l'ancienne (meme medicament, meme
 * posologie deja composee, meme quantite et duree). Ouvert a "tout medecin
 * ayant un acces valide au patient" (le pack) via cette meme regle : atteindre
 * cet ecran avec une consultation a soi pour ce patient EST l'acces valide,
 * pas necessairement l'auteur de l'ancienne prescription.
 *
 * Perimetre reduit assume : contrairement a creerPrescriptionAction (formulaire
 * interactif ou une alerte bloquante peut etre forcee avec justification),
 * le renouvellement est non interactif et refuse purement et simplement des
 * qu'un controle de securite (F-PRE-02 : allergie, age, grossesse, doublon,
 * duree) se declenche sur une ligne copiee, en renvoyant vers la creation
 * manuelle plutot que de forcer silencieusement quoi que ce soit. La
 * posologie n'est jamais redecomposee en champs structures (dose/unite/voie/
 * frequence, voir posologie.ts) : la chaine deja composee de l'ancienne ligne
 * est recopiee telle quelle, une prescription copiee n'ayant pas besoin d'un
 * nouveau passage par le formulaire structure.
 */
export async function renouvelerPrescriptionAction(
  prevState: PrescriptionActionState,
  formData: FormData
): Promise<PrescriptionActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "prescription"))) {
    return { error: "Action reservee aux medecins.", success: false };
  }

  const validation = schemaRenouvellementPrescription.safeParse({
    prescriptionId: texte(formData, "prescriptionId"),
    consultationId: texte(formData, "consultationId"),
    motDePasseSignature: texte(formData, "motDePasseSignature"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de renouvellement invalides."),
      success: false,
    };
  }

  const { prescriptionId, consultationId, motDePasseSignature } = validation.data;

  if (reauthentificationBloquee(session.userId)) {
    await destroySession();
    return {
      error: "Trop d'echecs de re-authentification. Vous avez ete deconnecte, veuillez vous reconnecter.",
      success: false,
    };
  }

  if (!reauthentificationRecente(session.userId)) {
    if (motDePasseSignature.length === 0) {
      return { error: "Le mot de passe est obligatoire pour signer l'ordonnance.", success: false };
    }

    const utilisateurConnecte = await prisma.user.findUnique({ where: { id: session.userId } });
    const motDePasseValide =
      utilisateurConnecte !== null &&
      (await bcrypt.compare(motDePasseSignature, utilisateurConnecte.motDePasseHash));

    if (!motDePasseValide) {
      const troisiemeEchec = enregistrerEchecReauthentification(session.userId);
      await journaliser({
        utilisateurId: session.userId,
        action: "signature_prescription_mot_de_passe_invalide",
        donneeConcernee: `prescription:${prescriptionId}`,
        adresseTechnique: await adresseTechniqueCourante(),
        justification: "Tentative de signature d'un renouvellement de prescription avec un mot de passe incorrect (RG-PRE-30).",
      });

      if (troisiemeEchec) {
        await destroySession();
        return {
          error: "Trop d'echecs de re-authentification. Vous avez ete deconnecte, veuillez vous reconnecter.",
          success: false,
        };
      }

      return { error: "Mot de passe incorrect. Le renouvellement n'a pas ete signe.", success: false };
    }

    enregistrerReauthentificationReussie(session.userId);
  }

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });

    if (!consultation || consultation.professionnelId !== professionnel.id) {
      return { error: "Cette consultation est introuvable.", success: false };
    }

    const ancienne = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { lignes: { include: { medicament: true } }, patient: true },
    });

    if (!ancienne || ancienne.patientId !== consultation.patientId) {
      return {
        error: "Cette ordonnance ne correspond pas au patient de cette consultation.",
        success: false,
      };
    }

    if (ancienne.lignes.length === 0) {
      return { error: "Cette ordonnance n'a plus aucune ligne a renouveler.", success: false };
    }

    if (ancienne.lignes.length > NOMBRE_LIGNES_MAX) {
      return {
        error: `Renouvellement impossible : cette ordonnance comporte plus de ${NOMBRE_LIGNES_MAX} lignes. Creez de nouvelles prescriptions manuellement.`,
        success: false,
      };
    }

    if (ancienne.lignes.some((ligne) => ligne.dureeTraitementJours > DUREE_TRAITEMENT_MAX_JOURS)) {
      return {
        error: `Renouvellement impossible : une ligne depasse ${DUREE_TRAITEMENT_MAX_JOURS} jours de traitement. Creez une nouvelle prescription manuellement pour ajuster la duree.`,
        success: false,
      };
    }

    // F-PRE-02, non interactif (voir docstring) : les memes controles que
    // creerPrescriptionAction, appliques a chaque ligne copiee. Le premier
    // declenche renvoie vers la creation manuelle.
    const patient = ancienne.patient;

    const maintenantSignature = new Date();
    if (poidsRequisPourPatient(patient.dateNaissance, maintenantSignature)) {
      if (!(await poidsRecentDuPatient(patient.id, maintenantSignature))) {
        return { error: `Renouvellement impossible. ${MESSAGE_POIDS_MANQUANT}`, success: false };
      }
    }

    const allergiesPatient = parseListeJSON(patient.allergies);

    // L'ancienne prescription elle-meme est exclue de "deja active" : sinon
    // renouveler une prescription encore validee/partiellement delivree
    // declencherait systematiquement un faux avertissement "doublon" contre
    // elle-meme (ses propres lignes, copiees a l'identique).
    const prescriptionsActives = await prisma.prescription.findMany({
      where: {
        patientId: patient.id,
        statut: { in: ["validee", "delivree_partiellement"] },
        id: { not: ancienne.id },
      },
      include: { lignes: { include: { medicament: true } } },
    });
    const traitementsActifs: LigneComparable[] = prescriptionsActives.flatMap((prescription) =>
      prescription.lignes.map((ligne) => ({
        principeActif: ligne.medicament.principeActif,
        classeTherapeutique: ligne.medicament.classeTherapeutique,
      }))
    );
    const lignesDejaRetenues: LigneComparable[] = [...traitementsActifs];

    for (const ligne of ancienne.lignes) {
      const medicament = ligne.medicament;

      const allergie = allergieCorrespondante(medicament, allergiesPatient);
      if (allergie) {
        return {
          error: `Renouvellement impossible : alerte allergie bloquante sur ${medicament.nom} ("${allergie}"). Creez une nouvelle prescription manuellement pour revoir cette ligne.`,
          success: false,
        };
      }

      const ageMinimumMois = ageMinimumNonAtteint(medicament, patient);
      if (ageMinimumMois !== null) {
        return {
          error: `Renouvellement impossible : ${medicament.nom} est contre-indique avant ${libelleAgeMinimum(ageMinimumMois)}. Creez une nouvelle prescription manuellement pour revoir cette ligne.`,
          success: false,
        };
      }

      if (grossesseIncompatible(medicament, patient)) {
        return {
          error: `Renouvellement impossible : ${medicament.nom} est contre-indique pendant la grossesse. Creez une nouvelle prescription manuellement pour revoir cette ligne.`,
          success: false,
        };
      }

      if (dureeAntibiotiqueExcessive(medicament, ligne.dureeTraitementJours)) {
        return {
          error: `Renouvellement impossible : duree de traitement de ${ligne.dureeTraitementJours} jours superieure a 30 jours pour ${medicament.nom} (antibiotique). Creez une nouvelle prescription manuellement pour ajuster.`,
          success: false,
        };
      }

      const candidate: LigneComparable = {
        principeActif: medicament.principeActif,
        classeTherapeutique: medicament.classeTherapeutique,
      };
      if (avertissementPourLigne(candidate, lignesDejaRetenues)) {
        return {
          error: `Renouvellement impossible : ${medicament.nom} declenche une alerte doublon/meme classe. Creez une nouvelle prescription manuellement pour confirmer ou ajuster.`,
          success: false,
        };
      }
      lignesDejaRetenues.push(candidate);
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const dateCreation = new Date();
    const empreinteContenu = calculerEmpreinteOrdonnance({
      patientId: ancienne.patientId,
      prescripteurId: professionnel.id,
      etablissementId: consultation.etablissementId,
      date: dateCreation,
      instructions: ancienne.instructions,
      lignes: ancienne.lignes.map((ligne) => ({
        medicamentId: ligne.medicamentId,
        posologie: ligne.posologie,
        quantite: ligne.quantite,
        dureeTraitementJours: ligne.dureeTraitementJours,
        nonSubstituable: ligne.nonSubstituable,
      })),
    });

    const nouvelleId = await prisma.$transaction(async (tx) => {
      const numero = await genererNumeroOrdonnance(tx, dateCreation);

      const nouvelle = await tx.prescription.create({
        data: {
          consultationId: consultation.id,
          medecinPrescripteurId: professionnel.id,
          patientId: ancienne.patientId,
          date: dateCreation,
          statut: "validee",
          numero,
          empreinteContenu,
          instructions: ancienne.instructions,
          lignes: {
            create: ancienne.lignes.map((ligne) => ({
              medicamentId: ligne.medicamentId,
              posologie: ligne.posologie,
              quantite: ligne.quantite,
              dureeTraitementJours: ligne.dureeTraitementJours,
              nonSubstituable: ligne.nonSubstituable,
            })),
          },
        },
      });

      await tx.evenementPrescription.create({
        data: {
          prescriptionId: nouvelle.id,
          type: "renouvellement",
          utilisateurId: session.userId,
          commentaire: `Renouvellement de l'ordonnance ${ancienne.numero}`,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation",
          donneeConcernee: `prescription:${nouvelle.id}`,
          adresseTechnique,
          justification: `Renouvellement de l'ordonnance ${ancienne.numero} pour le patient ${ancienne.patientId}`,
        },
        tx
      );

      return nouvelle.id;
    });

    void nouvelleId;

    await creerNotification(
      ancienne.patient.userId,
      "prescription",
      `Une nouvelle ordonnance a ete ajoutee a votre dossier (renouvellement de ${ancienne.numero}).`,
      "/app/patient/prescriptions"
    );

    revalidatePath(`/app/medecin/prescriptions/nouvelle`);

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du renouvellement de la prescription :", erreur);
    return {
      error: "Une erreur est survenue lors du renouvellement. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Recupere les prescriptions creees par le professionnel connecte (derive de
 * getSession() -> ProfessionnelSante lie), de la plus recente a la plus
 * ancienne.
 */
export async function getPrescriptionsDuProfessionnel(): Promise<PrescriptionResume[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const prescriptions = await prisma.prescription.findMany({
    where: { medecinPrescripteurId: professionnel.id },
    include: {
      consultation: true,
      patient: { include: { user: true } },
      lignes: { include: { medicament: true } },
      delivrances: { select: { id: true } },
    },
    orderBy: { date: "desc" },
  });

  return prescriptions.map((prescription) =>
    versPrescriptionResume(prescription, {
      medecinNomComplet: null,
      patientNomComplet: nomComplet(prescription.patient.user),
      patientIdentifiantSante: prescription.patient.identifiantSante,
      // F-PRE-05 du pack : "Annuler" seulement si aucune delivrance n'a
      // jamais eu lieu (meme une delivrance depuis annulee compte : un
      // pharmacien a deja agi sur cette prescription, ce n'est plus un
      // simple "jamais commencee"). "Arreter" seulement apres une delivrance
      // partielle reelle (statut courant), les deux reserves a l'auteur (déjà
      // garanti ici, cette liste est filtree sur medecinPrescripteurId).
      peutEtreAnnulee: prescription.statut === "validee" && prescription.delivrances.length === 0,
      peutEtreArretee: prescription.statut === "delivree_partiellement",
    })
  );
}

/**
 * Module pharmacie : delivrance des prescriptions en officine (F-PHA-03 du
 * pack). Chaque acte de delivrance (Delivrance) porte une ou plusieurs
 * lignes (LigneDelivrance), avec la quantite reellement remise au patient
 * pour chaque ligne de la prescription, le produit delivre (identique ou
 * substitue par un generique de meme DCI/dosage/forme, jamais si la ligne
 * est non substituable) et, si la quantite est nulle ou partielle, un motif.
 * Une delivrance est immuable (RG-PHA-13) : une erreur se corrige par une
 * annulation motivee dans les 24h suivant sa creation, jamais une
 * modification de ses lignes. Reserve au role "pharmacien", verifie
 * explicitement dans chaque fonction (Zero Trust : le role RBAC
 * "update:prescription" est aussi accorde au medecin, il ne suffit donc pas
 * a lui seul a distinguer "delivrer en pharmacie" de "modifier sa propre
 * prescription").
 */

const STATUTS_EN_ATTENTE_DE_DELIVRANCE = ["validee", "delivree_partiellement"] as const;

const schemaLigneDelivranceSoumise = z.object({
  lignePrescriptionId: z.string().trim().min(1, "Ligne de prescription invalide."),
  quantiteDelivree: z.coerce
    .number({ message: "La quantite delivree doit etre un nombre." })
    .int("La quantite delivree doit etre un nombre entier.")
    .min(0, "La quantite delivree ne peut pas etre negative."),
  medicamentDelivreId: z.string().trim().optional().default(""),
  motifNonDelivrance: z.string().trim().optional().default(""),
  numeroLot: z.string().trim().optional().default(""),
  datePeremption: z.string().trim().optional().default(""),
});

const schemaDelivrance = z.object({
  prescriptionId: z.string().trim().min(1, "La prescription est obligatoire."),
  lignes: z.array(schemaLigneDelivranceSoumise).min(1, "Au moins une ligne est obligatoire."),
});

const schemaAnnulationDelivrance = z.object({
  delivranceId: z.string().trim().min(1, "La delivrance est obligatoire."),
  motif: z
    .string()
    .trim()
    .min(
      LONGUEUR_MIN_MOTIF_ANNULATION_DELIVRANCE,
      `Le motif de l'annulation doit comporter au moins ${LONGUEUR_MIN_MOTIF_ANNULATION_DELIVRANCE} caracteres.`
    ),
});

/** Medicament candidat a une substitution (meme principe actif, dosage et forme que le medicament prescrit). */
export interface CandidatSubstitution {
  id: string;
  nom: string;
  dosage: string;
  forme: string;
}

/** Une ligne de prescription telle que preparee pour l'ecran de delivrance : quantites deja livree/restante, substituts possibles. */
export interface LignePourDelivrance {
  ligneId: string;
  medicamentId: string;
  medicamentNom: string;
  principeActif: string;
  dosage: string;
  forme: string;
  posologie: string;
  quantitePrescrite: number;
  quantiteDejaLivree: number;
  quantiteRestante: number;
  nonSubstituable: boolean;
  substitutsPossibles: CandidatSubstitution[];
}

/** Une ligne deja delivree, telle qu'affichee dans l'historique des delivrances d'une prescription. */
export interface DelivranceLigneResume {
  medicamentNom: string;
  quantiteDelivree: number;
  medicamentDelivreNom: string | null;
  motifNonDelivrance: string | null;
  numeroLot: string | null;
  datePeremption: string | null; // ISO
}

/** Un acte de delivrance deja enregistre, avec ses lignes et si le pharmacien connecte peut encore l'annuler (RG-PHA-13). */
export interface DelivranceResume {
  id: string;
  date: string; // ISO
  annulee: boolean;
  motifAnnulation: string | null;
  dateAnnulation: string | null;
  pharmacienNomComplet: string;
  lignes: DelivranceLigneResume[];
  peutEtreAnnulee: boolean;
}

/** Detail complet d'une prescription pour l'ecran de delivrance du pharmacien (F-PHA-03). */
export interface DetailPrescriptionPourDelivrance {
  id: string;
  numero: string;
  statut: string;
  date: string; // ISO
  instructions: string;
  patientNomComplet: string;
  // F-PHA-02 : ce qu'un pharmacien a besoin de verifier au comptoir, et rien de plus
  // (RG-PHA-02 : jamais le motif ou le diagnostic, ni les autres ordonnances).
  patientAgeAnnees: number;
  patientSexe: string;
  patientAllergies: string[];
  prescripteurNomComplet: string;
  prescripteurEtablissementNom: string;
  dateFinValiditeISO: string;
  expiree: boolean;
  lignes: LignePourDelivrance[];
  delivrances: DelivranceResume[];
}

/** Une ordonnance partiellement delivree par CETTE pharmacie et encore valable (F-PHA-01). */
export interface OrdonnancePartielleResume {
  id: string;
  numero: string;
  patientNomComplet: string;
  dateFinValiditeISO: string;
  derniereDelivranceISO: string;
  lignesManquantes: { medicamentNom: string; quantiteRestante: number }[];
}

/** Une delivrance enregistree aujourd'hui par CETTE pharmacie (F-PHA-01). */
export interface DelivranceDuJourResume {
  id: string;
  heureISO: string;
  numeroOrdonnance: string;
  nombreLignes: number;
  statutOrdonnance: string;
  annulee: boolean;
}

export interface TableauDeBordPharmacie {
  partielles: OrdonnancePartielleResume[];
  delivrancesDuJour: DelivranceDuJourResume[];
}

/**
 * Tableau de bord de la pharmacie du pharmacien connecte (F-PHA-01 du pack) :
 * ses delivrances du jour et les ordonnances qu'elle a delivrees en partie et
 * qui sont encore valables (patients qui reviennent). Rien d'autre : une
 * ordonnance qui n'a pas ete presentee a cette pharmacie n'apparait jamais
 * ici (RG-PHA-02), elle se retrouve par numero et annee de naissance
 * (rechercherOrdonnancePresenteeAction). Ni motif de consultation ni
 * instructions ne sont charges. L'etablissement vient toujours de la fiche
 * professionnelle, jamais du client. null si l'appelant n'est pas pharmacien.
 */
export async function getTableauDeBordPharmacie(): Promise<TableauDeBordPharmacie | null> {
  const session = await getSession();

  if (!session || !session.roles.includes("pharmacien") || !can("pharmacien", "read", "delivrance")) {
    return null;
  }

  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return null;
  }

  const maintenant = new Date();
  const premiereDatePossible = new Date(maintenant.getTime() - JOURS_VALIDITE_ORDONNANCE * 24 * 60 * 60 * 1000);
  const etablissementId = professionnel.etablissementId;

  const [partielles, delivrancesDuJour] = await Promise.all([
    prisma.prescription.findMany({
      where: {
        statut: "delivree_partiellement",
        date: { gte: premiereDatePossible },
        delivrances: { some: { etablissementId, annulee: false } },
      },
      select: {
        id: true,
        numero: true,
        date: true,
        patient: { select: { user: { select: { nom: true, prenom: true } } } },
        lignes: {
          select: {
            quantite: true,
            medicament: { select: { nom: true } },
            lignesDelivrees: {
              where: { delivrance: { annulee: false } },
              select: { quantiteDelivree: true },
            },
          },
        },
        delivrances: {
          where: { etablissementId, annulee: false },
          orderBy: { date: "desc" },
          take: 1,
          select: { date: true },
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.delivrance.findMany({
      where: {
        etablissementId,
        date: { gte: debutJourBenin(maintenant), lt: debutJourSuivantBenin(maintenant) },
      },
      select: {
        id: true,
        date: true,
        annulee: true,
        prescription: { select: { numero: true, statut: true } },
        _count: { select: { lignes: true } },
      },
      orderBy: { date: "desc" },
    }),
  ]);

  return {
    partielles: partielles.map((prescription) => ({
      id: prescription.id,
      numero: prescription.numero,
      patientNomComplet: nomComplet(prescription.patient.user),
      dateFinValiditeISO: dateFinValiditeOrdonnance(prescription.date).toISOString(),
      derniereDelivranceISO: (prescription.delivrances[0]?.date ?? prescription.date).toISOString(),
      lignesManquantes: prescription.lignes
        .map((ligne) => ({
          medicamentNom: ligne.medicament.nom,
          quantiteRestante:
            ligne.quantite - ligne.lignesDelivrees.reduce((somme, livree) => somme + livree.quantiteDelivree, 0),
        }))
        .filter((ligne) => ligne.quantiteRestante > 0),
    })),
    delivrancesDuJour: delivrancesDuJour.map((delivrance) => ({
      id: delivrance.id,
      heureISO: delivrance.date.toISOString(),
      numeroOrdonnance: delivrance.prescription.numero,
      nombreLignes: delivrance._count.lignes,
      statutOrdonnance: delivrance.prescription.statut,
      annulee: delivrance.annulee,
    })),
  };
}

/** Etat renvoye par rechercherOrdonnancePresenteeAction, consomme via useActionState. */
export interface RechercheOrdonnanceActionState {
  error: string | null;
  success: boolean;
  prescriptionId?: string;
  // Preuve de presentation (presentation.ts) : a transmettre a l'ecran de delivrance.
  jeton?: string;
}

const schemaRechercheOrdonnance = z.object({
  numero: z.string().trim().min(1, "Le numero d'ordonnance est obligatoire."),
  anneeNaissance: z.coerce
    .number({ message: "L'annee de naissance doit etre un nombre." })
    .int("L'annee de naissance doit etre un nombre entier.")
    .min(1900, "Annee de naissance invalide.")
    .max(new Date().getFullYear(), "Annee de naissance invalide."),
});

const MAX_RECHERCHES_ORDONNANCE_PAR_HEURE = 5;
const MESSAGE_ORDONNANCE_INTROUVABLE =
  "Ordonnance introuvable. Verifiez le numero et l'annee de naissance.";

/**
 * F-PHA-02 du pack (RG-PHA-01), version reduite volontaire : recherche par
 * numero d'ordonnance (Prescription.numero, deja existant, format
 * RX-<annee>-<sequence>, voir genererNumeroOrdonnance plus haut) + annee de
 * naissance du patient, sans le parcours QR/jeton separe du pack (RG-PRE-40 a
 * 42, hors perimetre ce soir) ni l'ASSIGNMENT persistant "pharmacie <->
 * ordonnance" de 30 jours du pack (demanderait un nouveau modele Prisma, le
 * schema est deja en pleine activite concurrente ce soir, migration
 * analytics F-PIL-07). Resout l'identifiant de prescription et delivre un
 * jeton de presentation signe (presentation.ts), sans lequel l'ecran de
 * delivrance (getDetailPrescriptionPourDelivrance) et la delivrance elle-meme
 * restent fermes a cette pharmacie tant qu'elle n'a rien delivre sur cette
 * ordonnance. Ni la consultation ni son motif ne sont jamais charges
 * (RG-PHA-02 du pack).
 *
 * RG-PHA-01 : 5 essais par pharmacien et par heure. Throttling par comptage
 * des echecs recents dans JournalAudit (action "recherche_ordonnance_echec")
 * plutot qu'un compteur en memoire : pas de nouvelle table, coherent avec le
 * reste du depot (toute action sensible y est deja journalisee) et resiste a
 * un redemarrage du serveur. Limite assumee : fenetre glissante d'une heure
 * sur les echecs, pas un blocage a duree fixe declenche pile au 5e echec
 * (approximation suffisante pour ce MVP mono-process ; un deploiement
 * multi-instance devrait de toute facon compter en base plutot qu'en memoire
 * locale a chaque instance, donc cette approche resterait la bonne base).
 * CA-1 du pack : un numero correct avec une mauvaise annee de naissance
 * renvoie le meme message generique qu'un numero inexistant, jamais
 * d'indice sur laquelle des deux informations etait fausse.
 */
export async function rechercherOrdonnancePresenteeAction(
  prevState: RechercheOrdonnanceActionState,
  formData: FormData
): Promise<RechercheOrdonnanceActionState> {
  const session = await getSession();

  if (!session || !session.roles.includes("pharmacien") || !can("pharmacien", "read", "delivrance")) {
    return { error: "Action reservee aux pharmaciens.", success: false };
  }

  const validation = schemaRechercheOrdonnance.safeParse({
    numero: texte(formData, "numero"),
    anneeNaissance: texte(formData, "anneeNaissance"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Numero ou annee de naissance invalide."),
      success: false,
    };
  }

  const { numero, anneeNaissance } = validation.data;

  const uneHeureAvant = new Date(Date.now() - 60 * 60 * 1000);
  const echecsRecents = await prisma.journalAudit.count({
    where: {
      utilisateurId: session.userId,
      action: "recherche_ordonnance_echec",
      date: { gte: uneHeureAvant },
    },
  });

  if (echecsRecents >= MAX_RECHERCHES_ORDONNANCE_PAR_HEURE) {
    return {
      error: "Trop de tentatives infructueuses. Reessayez dans une heure.",
      success: false,
    };
  }

  const adresseTechnique = await adresseTechniqueCourante();
  const prescription = await prisma.prescription.findUnique({
    where: { numero },
    include: { patient: true },
  });

  const trouvee =
    prescription !== null && prescription.patient.dateNaissance.getFullYear() === anneeNaissance;

  if (!trouvee) {
    await journaliser({
      utilisateurId: session.userId,
      action: "recherche_ordonnance_echec",
      donneeConcernee: `numero_ordonnance:${numero}`,
      adresseTechnique,
      justification:
        "Recherche d'ordonnance presentee : numero ou annee de naissance ne correspond a aucune prescription.",
    });

    return { error: MESSAGE_ORDONNANCE_INTROUVABLE, success: false };
  }

  await journaliser({
    utilisateurId: session.userId,
    action: "recherche_ordonnance",
    donneeConcernee: `prescription:${prescription.id}`,
    adresseTechnique,
    justification: `Ordonnance ${prescription.numero} retrouvee par numero et annee de naissance (patient presente au comptoir).`,
  });

  return {
    error: null,
    success: true,
    prescriptionId: prescription.id,
    jeton: creerJetonPresentation(session.userId, prescription.id),
  };
}

/**
 * Detail d'une prescription pour l'ecran de delivrance (F-PHA-03) : chaque
 * ligne avec sa quantite deja livree (somme des LigneDelivrance non
 * annulees), sa quantite restante, et la liste des medicaments candidats a
 * une substitution (meme principe actif, dosage et forme), sauf si la ligne
 * est marquee non substituable (RG-PHA-12 : le formulaire ne doit alors meme
 * pas proposer de choix). Inclut aussi l'historique des delivrances deja
 * enregistrees pour cette prescription, avec pour chacune si le pharmacien
 * connecte peut encore l'annuler (RG-PHA-13 : meme pharmacie, dans les 24h).
 * Zero Trust : verifie le role et la permission a chaque appel, ne fait
 * aucune supposition sur l'identifiant de prescription transmis par le
 * client. Retourne null si la prescription est introuvable ou si
 * l'utilisateur connecte n'est pas un pharmacien.
 */
export async function getDetailPrescriptionPourDelivrance(
  prescriptionId: string,
  jeton?: string
): Promise<DetailPrescriptionPourDelivrance | null> {
  const session = await getSession();

  if (!session || !session.roles.includes("pharmacien") || !can("pharmacien", "read", "delivrance")) {
    return null;
  }

  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return null;
  }

  const identifiantNettoye = prescriptionId.trim();

  if (identifiantNettoye.length === 0) {
    return null;
  }

  const prescription = await prisma.prescription.findUnique({
    where: { id: identifiantNettoye },
    include: {
      patient: { include: { user: true } },
      medecinPrescripteur: { include: { user: true } },
      consultation: { select: { etablissement: { select: { nom: true } } } },
      lignes: { include: { medicament: true } },
      delivrances: {
        include: {
          pharmacien: { include: { user: true } },
          lignes: {
            include: {
              medicamentDelivre: true,
              lignePrescription: { include: { medicament: true } },
            },
          },
        },
        orderBy: { date: "desc" },
      },
    },
  });

  if (!prescription) {
    return null;
  }

  // RG-PHA-02 : ouverte seulement si l'ordonnance a ete presentee a ce pharmacien
  // (jeton signe de la recherche) ou si sa pharmacie a deja delivre dessus.
  const dejaServieIci = prescription.delivrances.some(
    (delivrance) => delivrance.etablissementId === professionnel.etablissementId
  );
  if (!dejaServieIci && !jetonPresentationValide(jeton, session.userId, prescription.id)) {
    return null;
  }

  // RG-PHA-13 : une delivrance annulee ne compte plus dans les quantites
  // deja livrees (l'annulation restitue la quantite au niveau du calcul).
  const dejaLivreParLigne = new Map<string, number>();
  for (const delivrance of prescription.delivrances) {
    if (delivrance.annulee) continue;
    for (const ligneDelivree of delivrance.lignes) {
      dejaLivreParLigne.set(
        ligneDelivree.lignePrescriptionId,
        (dejaLivreParLigne.get(ligneDelivree.lignePrescriptionId) ?? 0) + ligneDelivree.quantiteDelivree
      );
    }
  }

  const lignes: LignePourDelivrance[] = [];

  for (const ligne of prescription.lignes) {
    const quantiteDejaLivree = dejaLivreParLigne.get(ligne.id) ?? 0;

    // RG-PHA-12 : une ligne non substituable ne propose meme pas de choix.
    const substitutsPossibles = ligne.nonSubstituable
      ? []
      : (
          await prisma.medicament.findMany({
            where: {
              principeActif: ligne.medicament.principeActif,
              dosage: ligne.medicament.dosage,
              forme: ligne.medicament.forme,
              id: { not: ligne.medicamentId },
            },
            orderBy: { nom: "asc" },
          })
        ).map((medicament) => ({
          id: medicament.id,
          nom: medicament.nom,
          dosage: medicament.dosage,
          forme: medicament.forme,
        }));

    lignes.push({
      ligneId: ligne.id,
      medicamentId: ligne.medicamentId,
      medicamentNom: ligne.medicament.nom,
      principeActif: ligne.medicament.principeActif,
      dosage: ligne.medicament.dosage,
      forme: ligne.medicament.forme,
      posologie: ligne.posologie,
      quantitePrescrite: ligne.quantite,
      quantiteDejaLivree,
      quantiteRestante: Math.max(0, ligne.quantite - quantiteDejaLivree),
      nonSubstituable: ligne.nonSubstituable,
      substitutsPossibles,
    });
  }

  const delivrances: DelivranceResume[] = prescription.delivrances.map((delivrance) => ({
    id: delivrance.id,
    date: delivrance.date.toISOString(),
    annulee: delivrance.annulee,
    motifAnnulation: delivrance.motifAnnulation,
    dateAnnulation: delivrance.dateAnnulation ? delivrance.dateAnnulation.toISOString() : null,
    pharmacienNomComplet: nomCompletProfessionnel(delivrance.pharmacien.user),
    lignes: delivrance.lignes.map((ligneDelivree) => ({
      medicamentNom: ligneDelivree.lignePrescription.medicament.nom,
      quantiteDelivree: ligneDelivree.quantiteDelivree,
      medicamentDelivreNom: ligneDelivree.medicamentDelivre?.nom ?? null,
      motifNonDelivrance: ligneDelivree.motifNonDelivrance,
      numeroLot: ligneDelivree.numeroLot,
      datePeremption: ligneDelivree.datePeremption ? ligneDelivree.datePeremption.toISOString() : null,
    })),
    // RG-PHA-13 : annulable par la meme pharmacie (etablissement), dans les 24h.
    peutEtreAnnulee:
      !delivrance.annulee &&
      delivrance.etablissementId === professionnel.etablissementId &&
      !delaiAnnulationDelivranceDepasse(delivrance.date),
  }));

  return {
    id: prescription.id,
    numero: prescription.numero,
    statut: prescription.statut,
    date: prescription.date.toISOString(),
    instructions: prescription.instructions,
    patientNomComplet: nomComplet(prescription.patient.user),
    patientAgeAnnees: ageAnnees(prescription.patient.dateNaissance, new Date()),
    patientSexe: prescription.patient.sexe,
    patientAllergies: parseListeJSON(prescription.patient.allergies),
    prescripteurNomComplet: nomCompletProfessionnel(prescription.medecinPrescripteur.user),
    prescripteurEtablissementNom: prescription.consultation.etablissement.nom,
    dateFinValiditeISO: dateFinValiditeOrdonnance(prescription.date).toISOString(),
    expiree: ordonnanceExpiree(prescription.date, new Date()),
    lignes,
    delivrances,
  };
}

/**
 * Enregistre une delivrance (F-PHA-03 du pack) : une ou plusieurs lignes,
 * chacune avec sa quantite reellement remise (0 a la quantite restante), le
 * produit delivre (identique au medicament prescrit, ou substitue), et un
 * motif si la quantite est nulle ou partielle. Le formulaire doit couvrir
 * exactement chaque ligne de la prescription (le pack decrit un parcours
 * "pour chaque ligne de l'ordonnance").
 *
 * RG-PHA-11 : la quantite delivree cumulee par ligne ne doit jamais depasser
 * la quantite prescrite, meme si deux delivrances sont tentees au meme
 * moment. La transaction commence donc par un verrou de ligne sur
 * l'ordonnance (`SELECT ... FOR UPDATE`, voir verrou.ts) : une seconde
 * delivrance attend la fin de la premiere, puis relit la quantite deja
 * livree, jamais deduite des donnees affichees au pharmacien au chargement
 * de l'ecran (qui peuvent etre perimees). PostgreSQL, READ COMMITTED.
 */
export async function delivrerPrescriptionAction(
  prevState: PrescriptionActionState,
  formData: FormData
): Promise<PrescriptionActionState> {
  const session = await getSession();

  if (!session || !session.roles.includes("pharmacien") || !can("pharmacien", "create", "delivrance")) {
    return { error: "Action reservee au role pharmacien.", success: false };
  }

  if (!(await estFonctionnaliteActive("pharmacy.module"))) {
    return { error: MESSAGE_MODULE_INACTIF, success: false };
  }

  const lignesJSON = texte(formData, "lignesJSON");
  let lignesBrutes: unknown;

  try {
    lignesBrutes = lignesJSON.trim().length > 0 ? JSON.parse(lignesJSON) : [];
  } catch {
    return { error: "Les lignes de delivrance sont mal formees.", success: false };
  }

  const validation = schemaDelivrance.safeParse({
    prescriptionId: texte(formData, "prescriptionId"),
    lignes: lignesBrutes,
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de delivrance invalides."),
      success: false,
    };
  }

  const { prescriptionId, lignes } = validation.data;

  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return { error: "Aucun profil professionnel associe a ce compte.", success: false };
  }

  for (const ligneSoumise of lignes) {
    if (
      ligneSoumise.motifNonDelivrance.length > 0 &&
      !MOTIFS_NON_DELIVRANCE_VALEURS.includes(ligneSoumise.motifNonDelivrance as MotifNonDelivrance)
    ) {
      return { error: "Motif de non delivrance invalide.", success: false };
    }

    if (
      ligneSoumise.datePeremption.length > 0 &&
      Number.isNaN(new Date(ligneSoumise.datePeremption).getTime())
    ) {
      return { error: "Une date de peremption saisie est invalide.", success: false };
    }
  }

  const adresseTechnique = await adresseTechniqueCourante();

  try {
    const resultat = await prisma.$transaction(async (tx) => {
      if (!(await verrouillerOrdonnance(tx, prescriptionId))) {
        return { ok: false as const, error: "Cette prescription est introuvable." };
      }

      const prescriptionActuelle = await tx.prescription.findUnique({
        where: { id: prescriptionId },
        include: {
          patient: { include: { user: true } },
          lignes: { include: { medicament: true } },
          delivrances: { where: { etablissementId: professionnel.etablissementId }, select: { id: true }, take: 1 },
        },
      });

      if (!prescriptionActuelle) {
        return { ok: false as const, error: "Cette prescription est introuvable." };
      }

      // RG-PHA-02 : pas de delivrance sur une ordonnance qui n'a pas ete presentee a
      // cette pharmacie (jeton de la recherche) et sur laquelle elle n'a rien delivre.
      if (
        prescriptionActuelle.delivrances.length === 0 &&
        !jetonPresentationValide(texte(formData, "jeton"), session.userId, prescriptionActuelle.id)
      ) {
        return {
          ok: false as const,
          error:
            "Cette ordonnance n'a pas ete presentee a cette pharmacie : retrouvez-la avec son numero et l'annee de naissance du patient.",
        };
      }

      // RG-PHA-10 : message distinct selon l'etat bloquant reel.
      if (
        !STATUTS_EN_ATTENTE_DE_DELIVRANCE.includes(
          prescriptionActuelle.statut as (typeof STATUTS_EN_ATTENTE_DE_DELIVRANCE)[number]
        )
      ) {
        return {
          ok: false as const,
          error:
            prescriptionActuelle.statut === "delivree"
              ? "Cette prescription a deja ete entierement delivree."
              : prescriptionActuelle.statut === "annulee"
                ? "Cette prescription est annulee et ne peut pas etre delivree."
                : prescriptionActuelle.statut === "arretee"
                  ? "Cette prescription a ete arretee par le medecin et ne peut plus etre delivree."
                  : "Cette prescription n'est pas dans un etat permettant une delivrance.",
        };
      }

      // RG-PHA-10 : une ordonnance perimee n'est plus delivrable.
      if (ordonnanceExpiree(prescriptionActuelle.date, new Date())) {
        return {
          ok: false as const,
          error: `Cette ordonnance a expire le ${dateFinValiditeOrdonnance(prescriptionActuelle.date).toLocaleDateString("fr-FR")} et ne peut plus etre delivree.`,
        };
      }

      const ligneParId = new Map(prescriptionActuelle.lignes.map((ligne) => [ligne.id, ligne]));
      const idsSoumis = lignes.map((ligne) => ligne.lignePrescriptionId);
      const ensembleIdsSoumis = new Set(idsSoumis);

      // Le formulaire doit couvrir exactement chaque ligne de l'ordonnance,
      // sans doublon (parcours du pack : "pour chaque ligne de l'ordonnance").
      if (
        ensembleIdsSoumis.size !== idsSoumis.length ||
        ensembleIdsSoumis.size !== ligneParId.size ||
        ![...ligneParId.keys()].every((id) => ensembleIdsSoumis.has(id))
      ) {
        return {
          ok: false as const,
          error: "Le formulaire doit renseigner exactement chaque ligne de cette prescription, sans doublon.",
        };
      }

      // RG-PHA-11 : lecture fraiche, a l'interieur de cette transaction (voir
      // le commentaire de fonction pour la garantie que cela apporte ici).
      const sommesExistantes = await tx.ligneDelivrance.groupBy({
        by: ["lignePrescriptionId"],
        where: { lignePrescriptionId: { in: [...ligneParId.keys()] }, delivrance: { annulee: false } },
        _sum: { quantiteDelivree: true },
      });
      const dejaLivreParLigne = new Map(
        sommesExistantes.map((somme) => [somme.lignePrescriptionId, somme._sum.quantiteDelivree ?? 0])
      );

      const lignesAEnregistrer: {
        lignePrescriptionId: string;
        quantiteDelivree: number;
        medicamentDelivreId: string | null;
        motifNonDelivrance: string | null;
        numeroLot: string | null;
        datePeremption: Date | null;
      }[] = [];

      for (const ligneSoumise of lignes) {
        const lignePrescrite = ligneParId.get(ligneSoumise.lignePrescriptionId);

        if (!lignePrescrite) {
          return {
            ok: false as const,
            error: "Une des lignes soumises ne correspond pas a cette prescription.",
          };
        }

        const dejaLivree = dejaLivreParLigne.get(ligneSoumise.lignePrescriptionId) ?? 0;
        const restanteAvant = lignePrescrite.quantite - dejaLivree;

        if (ligneSoumise.quantiteDelivree > restanteAvant) {
          return {
            ok: false as const,
            error: `La quantite delivree pour ${lignePrescrite.medicament.nom} depasse la quantite restante disponible (${restanteAvant}). Une autre delivrance a peut-etre eu lieu entre-temps : rafraichissez la page et reessayez.`,
          };
        }

        if (ligneSoumise.quantiteDelivree < restanteAvant && ligneSoumise.motifNonDelivrance.length === 0) {
          return {
            ok: false as const,
            error: `Un motif est obligatoire pour ${lignePrescrite.medicament.nom} : quantite delivree nulle ou partielle.`,
          };
        }

        let medicamentDelivreId: string | null = null;

        if (
          ligneSoumise.medicamentDelivreId.length > 0 &&
          ligneSoumise.medicamentDelivreId !== lignePrescrite.medicamentId
        ) {
          // RG-PHA-12 : une ligne non substituable ne peut jamais recevoir un
          // autre medicament que celui prescrit.
          if (lignePrescrite.nonSubstituable) {
            return {
              ok: false as const,
              error: `${lignePrescrite.medicament.nom} n'est pas substituable : impossible de delivrer un autre medicament.`,
            };
          }

          const medicamentSubstitut = await tx.medicament.findUnique({
            where: { id: ligneSoumise.medicamentDelivreId },
          });

          if (!medicamentSubstitut) {
            return {
              ok: false as const,
              error: `Le medicament de substitution choisi pour ${lignePrescrite.medicament.nom} est introuvable au catalogue.`,
            };
          }

          const memeDCIDosageForme =
            medicamentSubstitut.principeActif === lignePrescrite.medicament.principeActif &&
            medicamentSubstitut.dosage === lignePrescrite.medicament.dosage &&
            medicamentSubstitut.forme === lignePrescrite.medicament.forme;

          if (!memeDCIDosageForme) {
            return {
              ok: false as const,
              error: `Le medicament de substitution choisi pour ${lignePrescrite.medicament.nom} n'a pas le meme principe actif, dosage et forme.`,
            };
          }

          medicamentDelivreId = medicamentSubstitut.id;
        }

        lignesAEnregistrer.push({
          lignePrescriptionId: ligneSoumise.lignePrescriptionId,
          quantiteDelivree: ligneSoumise.quantiteDelivree,
          medicamentDelivreId,
          motifNonDelivrance: ligneSoumise.motifNonDelivrance.length > 0 ? ligneSoumise.motifNonDelivrance : null,
          numeroLot: ligneSoumise.numeroLot.length > 0 ? ligneSoumise.numeroLot : null,
          datePeremption: ligneSoumise.datePeremption.length > 0 ? new Date(ligneSoumise.datePeremption) : null,
        });
      }

      if (lignesAEnregistrer.every((ligne) => ligne.quantiteDelivree === 0)) {
        return {
          ok: false as const,
          error: "Aucune quantite n'est delivree : renseignez au moins une quantite superieure a zero.",
        };
      }

      const delivranceCreee = await tx.delivrance.create({
        data: {
          prescriptionId: prescriptionActuelle.id,
          pharmacienId: professionnel.id,
          etablissementId: professionnel.etablissementId,
          lignes: { create: lignesAEnregistrer },
        },
      });

      const nomsLignesIncompletes: string[] = [];

      for (const lignePrescrite of prescriptionActuelle.lignes) {
        const dejaLivreeAvant = dejaLivreParLigne.get(lignePrescrite.id) ?? 0;
        const soumise = lignesAEnregistrer.find((ligne) => ligne.lignePrescriptionId === lignePrescrite.id);
        const nouveauTotal = dejaLivreeAvant + (soumise?.quantiteDelivree ?? 0);

        if (nouveauTotal < lignePrescrite.quantite) {
          nomsLignesIncompletes.push(lignePrescrite.medicament.nom);
        }
      }

      const nouveauStatut = nomsLignesIncompletes.length === 0 ? "delivree" : "delivree_partiellement";

      await tx.prescription.update({
        where: { id: prescriptionActuelle.id },
        data: { statut: nouveauStatut },
      });

      await tx.evenementPrescription.create({
        data: {
          prescriptionId: prescriptionActuelle.id,
          type: nouveauStatut === "delivree" ? "delivrance" : "delivrance_partielle",
          utilisateurId: session.userId,
          commentaire: null,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_delivrance",
          donneeConcernee: `delivrance:${delivranceCreee.id}`,
          adresseTechnique,
          justification:
            nouveauStatut === "delivree"
              ? `Prescription ${prescriptionActuelle.numero} entierement delivree`
              : `Prescription ${prescriptionActuelle.numero} partiellement delivree (manquant : ${nomsLignesIncompletes.join(", ")})`,
        },
        tx
      );

      return {
        ok: true as const,
        statut: nouveauStatut,
        numero: prescriptionActuelle.numero,
        patientUserId: prescriptionActuelle.patient.userId,
        nomsLignesIncompletes,
      };
    });

    if (!resultat.ok) {
      return { error: resultat.error, success: false };
    }

    const etablissement = await prisma.etablissementSanitaire.findUnique({
      where: { id: professionnel.etablissementId },
    });
    const nomEtablissement = etablissement?.nom ?? "la pharmacie";

    const message =
      resultat.statut === "delivree"
        ? `Votre ordonnance ${resultat.numero} a ete delivree a ${nomEtablissement}.`
        : `Votre ordonnance ${resultat.numero} a ete delivree en partie a ${nomEtablissement}. Encore en attente : ${resultat.nomsLignesIncompletes.join(", ")}.`;

    await creerNotification(resultat.patientUserId, "delivrance", message, "/app/patient/prescriptions");

    revalidatePath("/app/medecin/pharmacie");
    revalidatePath(`/app/medecin/pharmacie/${prescriptionId}`);

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la delivrance de la prescription :", erreur);
    return {
      error: "Une erreur est survenue lors de la delivrance. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Annule une delivrance (RG-PHA-13) : la seule facon de corriger une
 * delivrance deja enregistree (immuable, jamais modifiee sur place). Reserve
 * a un pharmacien de la meme pharmacie (etablissement) que celle qui a
 * enregistre la delivrance, dans les 24 heures suivant sa creation ; passe ce
 * delai, ou pour une autre pharmacie, le refus est explicite. Restitue les
 * quantites annulees (au niveau du calcul de la quantite restante, voir
 * getDetailPrescriptionPourDelivrance) et fait redescendre le statut global
 * de la prescription si necessaire (une prescription "delivree" ou
 * "delivree_partiellement" peut ainsi redevenir "validee" si plus aucune
 * quantite n'est effectivement delivree apres l'annulation).
 */
export async function annulerDelivranceAction(
  prevState: PrescriptionActionState,
  formData: FormData
): Promise<PrescriptionActionState> {
  const session = await getSession();

  if (!session || !session.roles.includes("pharmacien") || !can("pharmacien", "update", "delivrance")) {
    return { error: "Action reservee au role pharmacien.", success: false };
  }

  if (!(await estFonctionnaliteActive("pharmacy.module"))) {
    return { error: MESSAGE_MODULE_INACTIF, success: false };
  }

  const validation = schemaAnnulationDelivrance.safeParse({
    delivranceId: texte(formData, "delivranceId"),
    motif: texte(formData, "motif"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees d'annulation invalides."),
      success: false,
    };
  }

  const { delivranceId, motif } = validation.data;

  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return { error: "Aucun profil professionnel associe a ce compte.", success: false };
  }

  const adresseTechnique = await adresseTechniqueCourante();

  try {
    const resultat = await prisma.$transaction(async (tx) => {
      // Meme verrou que la delivrance : corriger une delivrance ne doit pas
      // s'entrelacer avec une autre delivrance de la meme ordonnance.
      const cible = await tx.delivrance.findUnique({ where: { id: delivranceId }, select: { prescriptionId: true } });
      if (cible) {
        await verrouillerOrdonnance(tx, cible.prescriptionId);
      }

      const delivrance = await tx.delivrance.findUnique({
        where: { id: delivranceId },
        include: { prescription: { include: { lignes: true } } },
      });

      if (!delivrance) {
        return { ok: false as const, error: "Cette delivrance est introuvable." };
      }

      if (delivrance.annulee) {
        return { ok: false as const, error: "Cette delivrance a deja ete annulee." };
      }

      // RG-PHA-13 : "par la meme pharmacie", verifie sur l'etablissement,
      // pas sur le pharmacien individuel (un collegue de la meme officine
      // peut corriger une delivrance qu'il n'a pas lui-meme enregistree).
      if (delivrance.etablissementId !== professionnel.etablissementId) {
        return {
          ok: false as const,
          error: "Cette delivrance releve d'une autre pharmacie et ne peut pas etre annulee ici.",
        };
      }

      if (delaiAnnulationDelivranceDepasse(delivrance.date)) {
        return {
          ok: false as const,
          error: `Le delai de ${HEURES_FENETRE_ANNULATION_DELIVRANCE} heures suivant la delivrance est depasse : cette annulation n'est plus possible.`,
        };
      }

      const maintenant = new Date();

      await tx.delivrance.update({
        where: { id: delivranceId },
        data: { annulee: true, motifAnnulation: motif, dateAnnulation: maintenant },
      });

      // Recalcule le statut global a partir des delivrances non annulees
      // restantes (celle-ci exclue desormais).
      const sommesRestantes = await tx.ligneDelivrance.groupBy({
        by: ["lignePrescriptionId"],
        where: {
          lignePrescriptionId: { in: delivrance.prescription.lignes.map((ligne) => ligne.id) },
          delivrance: { annulee: false },
        },
        _sum: { quantiteDelivree: true },
      });
      const livreParLigne = new Map(
        sommesRestantes.map((somme) => [somme.lignePrescriptionId, somme._sum.quantiteDelivree ?? 0])
      );

      const toutesCompletes = delivrance.prescription.lignes.every(
        (ligne) => (livreParLigne.get(ligne.id) ?? 0) >= ligne.quantite
      );
      const aucuneLivraison = delivrance.prescription.lignes.every(
        (ligne) => (livreParLigne.get(ligne.id) ?? 0) === 0
      );
      // Une ordonnance annulee ou arretee par le medecin garde son statut : corriger
      // une delivrance ne doit jamais la rendre a nouveau delivrable.
      const statutFigeParLeMedecin =
        delivrance.prescription.statut === "annulee" || delivrance.prescription.statut === "arretee";
      const nouveauStatut = statutFigeParLeMedecin
        ? delivrance.prescription.statut
        : toutesCompletes
          ? "delivree"
          : aucuneLivraison
            ? "validee"
            : "delivree_partiellement";

      await tx.prescription.update({
        where: { id: delivrance.prescriptionId },
        data: { statut: nouveauStatut },
      });

      await tx.evenementPrescription.create({
        data: {
          prescriptionId: delivrance.prescriptionId,
          type: "annulation_delivrance",
          utilisateurId: session.userId,
          commentaire: motif,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "annulation_delivrance",
          donneeConcernee: `delivrance:${delivranceId}`,
          adresseTechnique,
          justification: motif,
        },
        tx
      );

      return { ok: true as const, prescriptionId: delivrance.prescriptionId };
    });

    if (!resultat.ok) {
      return { error: resultat.error, success: false };
    }

    revalidatePath("/app/medecin/pharmacie");
    revalidatePath(`/app/medecin/pharmacie/${resultat.prescriptionId}`);

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'annulation de la delivrance :", erreur);
    return {
      error: "Une erreur est survenue lors de l'annulation. Veuillez reessayer.",
      success: false,
    };
  }
}

/** Une ligne delivree, telle qu'affichee dans la vue transversale de l'historique pharmacie (F-PHA-04). */
export interface LigneDelivranceHistorique {
  medicamentNom: string;
  quantiteDelivree: number;
  medicamentDelivreNom: string | null;
  motifNonDelivrance: string | null;
}

/**
 * Une delivrance telle qu'affichee dans la vue transversale F-PHA-04.
 * RG-PHA du pack ("aucune donnee de patient au-dela du nom et de l'age") :
 * jamais l'identifiant sante, jamais le motif de consultation, jamais autre
 * chose que le nom complet et l'age au jour de la delivrance.
 */
export interface DelivranceHistoriqueEtablissement {
  id: string;
  date: string; // ISO
  numeroOrdonnance: string;
  patientNomComplet: string;
  patientAge: number;
  pharmacienNomComplet: string;
  annulee: boolean;
  lignes: LigneDelivranceHistorique[];
}

export interface FiltresHistoriqueDelivrances {
  /** "AAAA-MM-JJ", incluse. Par defaut, 30 jours avant dateFin. */
  dateDebut?: string;
  /** "AAAA-MM-JJ", incluse. Par defaut, aujourd'hui. */
  dateFin?: string;
  /** Recherche texte sur le nom du medicament (prescrit ou substitue), insensible a la casse. */
  medicament?: string;
}

/**
 * Resultat de listerDelivrancesEtablissement. Structure explicite plutot
 * qu'un simple null (meme principe que getStatistiquesNationales dans
 * src/modules/analytics/actions.ts) : acces=false et plageInvalide=true sont
 * deux causes distinctes d'une liste vide, que l'ecran doit pouvoir
 * distinguer pour afficher le bon message (droits insuffisants vs periode a
 * corriger), plutot qu'un null unique qui les confondrait.
 */
export interface ResultatHistoriqueDelivrances {
  /** false si l'appelant n'est pas pharmacien ou n'a pas de fiche professionnelle associee. */
  acces: boolean;
  /** true si la plage demandee est invalide (fin avant debut, ou plus de JOURS_PLAGE_HISTORIQUE_MAXIMUM jours). */
  plageInvalide: boolean;
  delivrances: DelivranceHistoriqueEtablissement[];
}

const JOURS_PLAGE_HISTORIQUE_PAR_DEFAUT = 30;
/** Plage maximale autorisee pour une recherche (memes principes que rechercherJournalAudit : une requete non bornee sur toute la pharmacie serait couteuse et peu lisible). */
const JOURS_PLAGE_HISTORIQUE_MAXIMUM = 92;

function dateSeuleVersDate(valeur: string, finDeJournee: boolean): Date | null {
  const date = new Date(`${valeur}T${finDeJournee ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const ACCES_REFUSE: ResultatHistoriqueDelivrances = { acces: false, plageInvalide: false, delivrances: [] };
const PLAGE_INVALIDE: ResultatHistoriqueDelivrances = { acces: true, plageInvalide: true, delivrances: [] };

/**
 * Historique des delivrances de la pharmacie du pharmacien connecte
 * (F-PHA-04 du pack), filtrable par periode et par medicament. Contrairement
 * a la recherche par numero (n'importe quelle pharmacie peut retrouver une
 * ordonnance presentee), cette vue est explicitement
 * scopee a l'etablissement du pharmacien connecte ("de SA pharmacie", texte
 * du pack) : Zero Trust, l'etablissement est toujours derive de sa fiche
 * ProfessionnelSante, jamais d'un identifiant transmis par le client.
 */
export async function listerDelivrancesEtablissement(
  filtres: FiltresHistoriqueDelivrances
): Promise<ResultatHistoriqueDelivrances> {
  const session = await getSession();

  if (!session || !session.roles.includes("pharmacien") || !can("pharmacien", "read", "delivrance")) {
    return ACCES_REFUSE;
  }

  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return ACCES_REFUSE;
  }

  const maintenant = new Date();
  const dateFin = filtres.dateFin ? dateSeuleVersDate(filtres.dateFin, true) : maintenant;
  if (!dateFin) {
    return PLAGE_INVALIDE;
  }

  let dateDebut: Date;
  if (filtres.dateDebut) {
    const parsee = dateSeuleVersDate(filtres.dateDebut, false);
    if (!parsee) return PLAGE_INVALIDE;
    dateDebut = parsee;
  } else {
    dateDebut = new Date(dateFin.getTime() - JOURS_PLAGE_HISTORIQUE_PAR_DEFAUT * 24 * 60 * 60 * 1000);
  }

  if (dateFin < dateDebut) {
    return PLAGE_INVALIDE;
  }
  if (dateFin.getTime() - dateDebut.getTime() > JOURS_PLAGE_HISTORIQUE_MAXIMUM * 24 * 60 * 60 * 1000) {
    return PLAGE_INVALIDE;
  }

  const delivrances = await prisma.delivrance.findMany({
    where: {
      etablissementId: professionnel.etablissementId,
      date: { gte: dateDebut, lte: dateFin },
    },
    include: {
      prescription: { include: { patient: { include: { user: true } } } },
      pharmacien: { include: { user: true } },
      lignes: {
        include: {
          lignePrescription: { include: { medicament: true } },
          medicamentDelivre: true,
        },
      },
    },
    orderBy: { date: "desc" },
  });

  const termeMedicament = filtres.medicament?.trim().toLowerCase();

  const resultat = delivrances
    .map((delivrance) => ({
      id: delivrance.id,
      date: delivrance.date.toISOString(),
      numeroOrdonnance: delivrance.prescription.numero,
      patientNomComplet: nomComplet(delivrance.prescription.patient.user),
      patientAge: ageAnnees(delivrance.prescription.patient.dateNaissance, delivrance.date),
      pharmacienNomComplet: nomComplet(delivrance.pharmacien.user),
      annulee: delivrance.annulee,
      lignes: delivrance.lignes.map((ligne) => ({
        medicamentNom: ligne.lignePrescription.medicament.nom,
        quantiteDelivree: ligne.quantiteDelivree,
        medicamentDelivreNom: ligne.medicamentDelivre?.nom ?? null,
        motifNonDelivrance: ligne.motifNonDelivrance,
      })),
    }))
    .filter((delivrance) => {
      if (!termeMedicament) return true;
      return delivrance.lignes.some(
        (ligne) =>
          ligne.medicamentNom.toLowerCase().includes(termeMedicament) ||
          (ligne.medicamentDelivreNom?.toLowerCase().includes(termeMedicament) ?? false)
      );
    });

  return { acces: true, plageInvalide: false, delivrances: resultat };
}
