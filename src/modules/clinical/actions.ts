"use server";

/**
 * Server Actions du module clinical : consultations et contenu clinique.
 * Contrat d'integration Phase 4, consomme par les ecrans
 * src/app/app/patient/** et src/app/app/medecin/** (autres agents).
 *
 * Meme principe applique de bout en bout que src/modules/patient/actions.ts :
 * Zero Trust. Le patient ou le professionnel courant est toujours derive de
 * getSession(), jamais d'un id transmis par le client dans un formulaire.
 * Regle metier centrale de ce module : un professionnel ne peut creer une
 * consultation pour un patient que si ce patient lui a accorde un
 * Consentement actif ("dossier_complet" ou "consultations"), verifie ici en
 * base avant toute ecriture, jamais suppose. Toute creation de consultation
 * est tracee dans JournalAudit.
 */

import { headers } from "next/headers";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { publierEvenementPilotage } from "@/modules/pilotage/file-taches";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import {
  ageAnnees,
  calculerIMC,
  controlerFrequenceRespiratoire,
  controlerGlycemie,
  controlerIMC,
  controlerPoids,
  controlerPouls,
  controlerSaturationOxygene,
  controlerTaille,
  controlerTemperature,
  controlerTensionDiastolique,
  controlerTensionSystolique,
  type ResultatControleConstante,
} from "./controles-constantes";

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface ClinicalActionState {
  error: string | null;
  success: boolean;
  // Rempli par enregistrerConsultationAction : permet au formulaire de
  // savoir qu'un brouillon existe desormais (bascule create -> update aux
  // enregistrements suivants, active les actions "Prescrire"/"Demander un
  // examen"/"Valider").
  consultationId?: string;
  // Vrai uniquement si cet appel a valide la consultation (intent=valider) :
  // distingue un simple enregistrement de brouillon reussi d'une validation
  // reussie, les deux renvoyant success=true et le meme consultationId.
  valide?: boolean;
}

/** Addendum d'une consultation (F-CLI-08 du pack), pret a afficher. */
export interface AddendumResume {
  id: string;
  motif: string;
  contenu: string;
  date: string;
  auteurNomComplet: string;
}

/** Resume d'une consultation, pret a afficher cote ecran patient ou professionnel. */
export interface ConsultationResume {
  id: string;
  patientId: string;
  date: string;
  motif: string;
  symptomes: string[];
  // Constantes vitales structurees (F-CLI-06 du pack) : chaque champ est
  // facultatif (toutes les constantes ne sont pas toujours prises).
  temperatureCelsius: number | null;
  pouls: number | null;
  tensionSystolique: number | null;
  tensionDiastolique: number | null;
  frequenceRespiratoire: number | null;
  saturationOxygene: number | null;
  poidsKg: number | null;
  tailleCm: number | null;
  glycemieGL: number | null;
  observations: string;
  conclusion: string;
  statut: string;
  professionnelNomComplet: string | null; // rempli cote patient
  patientNomComplet: string | null; // rempli cote professionnel
  patientIdentifiantSante: string | null; // rempli cote professionnel
  // F-CLI-08 du pack : addendum/retrait, jamais une modification du contenu original.
  saisieParErreur: boolean;
  motifRetrait: string | null;
  addenda: AddendumResume[];
}

/** Motifs d'addendum autorises (F-CLI-08 du pack). */
const MOTIFS_ADDENDUM = [
  "complement_information",
  "correction",
  "resultat_recu",
  "autre",
] as const;

const LONGUEUR_MAX_ADDENDUM = 2000;

const schemaAjoutAddendum = z.object({
  consultationId: z.string().trim().min(1, "La consultation est obligatoire."),
  motif: z.enum(MOTIFS_ADDENDUM, { message: "Le motif est invalide." }),
  contenu: z
    .string()
    .trim()
    .min(1, "Le contenu de l'addendum est obligatoire.")
    .max(LONGUEUR_MAX_ADDENDUM, `${LONGUEUR_MAX_ADDENDUM} caracteres maximum.`),
});

const schemaRetraitConsultation = z.object({
  consultationId: z.string().trim().min(1, "La consultation est obligatoire."),
  motif: z.string().trim().min(1, "Le motif du retrait est obligatoire."),
  motDePasse: z.string().min(1, "Votre mot de passe est obligatoire pour confirmer."),
});

/** Duree pendant laquelle addendum et retrait restent possibles apres la date de la consultation (RG-CLI-70). */
const MOIS_FENETRE_ADDENDUM_RETRAIT = 12;

function fenetreAddendumRetraitDepassee(dateConsultation: Date): boolean {
  const dateLimite = new Date(dateConsultation);
  dateLimite.setMonth(dateLimite.getMonth() + MOIS_FENETRE_ADDENDUM_RETRAIT);
  return new Date() > dateLimite;
}

/** Types d'acces de consentement autorisant un professionnel a creer une consultation. */
const TYPES_ACCES_CONSULTATION = ["dossier_complet", "consultations"] as const;

/** Champ numerique facultatif : une chaine vide devient undefined plutot qu'une erreur de coercion. */
const champNumeriqueOptionnel = z.preprocess(
  (valeur) => (typeof valeur === "string" && valeur.trim() === "" ? undefined : valeur),
  z.coerce.number().optional()
);

/**
 * Champs cliniques saisissables sur un brouillon (F-CLI-05/06 du pack) :
 * seul patientId est obligatoire a ce stade. motif et conclusion ne sont
 * exiges qu'a la validation (enregistrerConsultationAction, CA-1 du pack).
 */
const schemaEnregistrementBrouillon = z.object({
  consultationId: z.string().trim().optional().default(""),
  patientId: z.string().trim().min(1, "Le patient est obligatoire."),
  rendezVousId: z.string().trim().optional().default(""),
  // F-CLI-12 : prise en charge infirmiere dont les constantes ont pre-rempli
  // ce formulaire, marquee "recuperee" a la creation du brouillon uniquement
  // (jamais a une simple mise a jour d'un brouillon deja existant).
  priseEnChargeId: z.string().trim().optional().default(""),
  motif: z.string().trim().optional().default(""),
  symptomes: z.string().trim().optional().default(""),
  temperatureCelsius: champNumeriqueOptionnel,
  pouls: champNumeriqueOptionnel,
  tensionSystolique: champNumeriqueOptionnel,
  tensionDiastolique: champNumeriqueOptionnel,
  frequenceRespiratoire: champNumeriqueOptionnel,
  saturationOxygene: champNumeriqueOptionnel,
  poidsKg: champNumeriqueOptionnel,
  tailleCm: champNumeriqueOptionnel,
  glycemieGL: champNumeriqueOptionnel,
  // F-CLI-06 / RG-CLI-50 : confirmation globale exigee si au moins une
  // constante saisie est dans sa plage d'alerte (pas hors plage acceptee,
  // qui reste toujours refusee sans possibilite de forcage).
  confirmerAlerteConstantes: z.coerce.boolean().optional().default(false),
  observations: z.string().trim().optional().default(""),
  conclusion: z.string().trim().optional().default(""),
});

/**
 * Empreinte SHA-256 du contenu clinique canonique d'une consultation
 * (F-CLI-07 du pack), calculee a la validation. Les cles sont triees et le
 * format est stable pour que la meme empreinte soit reproductible a partir
 * des memes donnees.
 */
function calculerEmpreinteConsultation(champs: {
  motif: string;
  symptomes: string;
  temperatureCelsius: number | null;
  pouls: number | null;
  tensionSystolique: number | null;
  tensionDiastolique: number | null;
  frequenceRespiratoire: number | null;
  saturationOxygene: number | null;
  poidsKg: number | null;
  tailleCm: number | null;
  glycemieGL: number | null;
  observations: string;
  conclusion: string;
}): string {
  const contenuCanonique = JSON.stringify(champs, Object.keys(champs).sort());
  return createHash("sha256").update(contenuCanonique).digest("hex");
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

/** Nom complet d'un professionnel de sante, prefixe de "Dr." (meme convention que le module patient). */
function nomCompletProfessionnel(utilisateur: { nom: string; prenom: string }): string {
  return `Dr. ${utilisateur.prenom} ${utilisateur.nom}`;
}

/** Met en forme les addenda d'une consultation (F-CLI-08) en AddendumResume, du plus ancien au plus recent. */
function versAddendaResume(
  addenda: {
    id: string;
    motif: string;
    contenu: string;
    date: Date;
    auteur: { nom: string; prenom: string };
  }[]
): AddendumResume[] {
  return addenda.map((addendum) => ({
    id: addendum.id,
    motif: addendum.motif,
    contenu: addendum.contenu,
    date: addendum.date.toISOString(),
    auteurNomComplet: nomCompletProfessionnel(addendum.auteur),
  }));
}

/** Decoupe un champ "une entree par ligne" en tableau de chaines non vides, nettoyees. */
function parseListeLignes(valeur: string): string[] {
  return valeur
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.length > 0);
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

/**
 * Recupere l'historique des consultations du patient connecte (derive de
 * getSession(), jamais d'id en parametre), du plus recent au plus ancien.
 * RG-CLI-41 du pack : un brouillon n'est visible que par son auteur, jamais
 * par le patient - exclu explicitement ici, pas seulement par l'absence de
 * lien dans l'UI.
 */
export async function getMesConsultations(): Promise<ConsultationResume[]> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return [];
  }

  const consultations = await prisma.consultation.findMany({
    where: { patientId: patient.id, statut: { not: "brouillon" } },
    include: {
      professionnel: { include: { user: true } },
      addenda: { include: { auteur: true }, orderBy: { date: "asc" } },
    },
    orderBy: { date: "desc" },
  });

  return consultations.map((consultation) => ({
    id: consultation.id,
    patientId: consultation.patientId,
    date: consultation.date.toISOString(),
    motif: consultation.motif,
    symptomes: parseListeJSON(consultation.symptomes),
    temperatureCelsius: consultation.temperatureCelsius,
    pouls: consultation.pouls,
    tensionSystolique: consultation.tensionSystolique,
    tensionDiastolique: consultation.tensionDiastolique,
    frequenceRespiratoire: consultation.frequenceRespiratoire,
    saturationOxygene: consultation.saturationOxygene,
    poidsKg: consultation.poidsKg,
    tailleCm: consultation.tailleCm,
    glycemieGL: consultation.glycemieGL,
    // Notes internes reservees au professionnel (RG-CLI-54 du pack) : jamais
    // transmises au patient, meme si un futur ecran patient venait a
    // afficher ConsultationResume.observations sans y penser.
    observations: "",
    conclusion: consultation.conclusion,
    statut: consultation.statut,
    professionnelNomComplet: nomCompletProfessionnel(consultation.professionnel.user),
    patientNomComplet: null,
    patientIdentifiantSante: null,
    saisieParErreur: consultation.saisieParErreur,
    motifRetrait: consultation.motifRetrait,
    addenda: versAddendaResume(consultation.addenda),
  }));
}

/**
 * Liste les patients ayant accorde un Consentement actif (dossier_complet ou
 * consultations) au professionnel connecte, pour peupler le selecteur de
 * patient cote ecran de creation de consultation.
 */
export async function getPatientsAvecConsentement(): Promise<
  {
    patientId: string;
    nomComplet: string;
    identifiantSante: string;
    allergies: string[];
    dateNaissance: string;
    sexe: string;
    avatarUrl: string | null;
  }[]
> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const consentements = await prisma.consentement.findMany({
    where: {
      acteurAutoriseId: professionnel.userId,
      statut: "actif",
      typeAcces: { in: [...TYPES_ACCES_CONSULTATION] },
      OR: [{ dateFin: null }, { dateFin: { gt: new Date() } }],
    },
    include: { patient: { include: { user: true } } },
  });

  return consentements.map((consentement) => ({
    patientId: consentement.patientId,
    nomComplet: nomComplet(consentement.patient.user),
    identifiantSante: consentement.patient.identifiantSante,
    allergies: parseListeJSON(consentement.patient.allergies),
    dateNaissance: consentement.patient.dateNaissance.toISOString(),
    sexe: consentement.patient.sexe,
    avatarUrl: consentement.patient.user.avatarUrl,
  }));
}

/** Contenu d'un brouillon de consultation, pret a pre-remplir le formulaire de reprise. */
export interface BrouillonConsultation {
  id: string;
  motif: string;
  symptomes: string[];
  temperatureCelsius: number | null;
  pouls: number | null;
  tensionSystolique: number | null;
  tensionDiastolique: number | null;
  frequenceRespiratoire: number | null;
  saturationOxygene: number | null;
  poidsKg: number | null;
  tailleCm: number | null;
  glycemieGL: number | null;
  observations: string;
  conclusion: string;
}

/**
 * Recherche un brouillon deja ouvert par le medecin connecte pour ce
 * patient (RG-CLI-40 du pack) : s'il en existe un, l'ecran "Nouvelle
 * consultation" doit le rouvrir plutot que d'en laisser creer un second.
 */
export async function getBrouillonExistant(patientId: string): Promise<BrouillonConsultation | null> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return null;
  }

  const brouillon = await prisma.consultation.findFirst({
    where: { patientId, professionnelId: professionnel.id, statut: "brouillon" },
  });

  if (!brouillon) {
    return null;
  }

  return {
    id: brouillon.id,
    motif: brouillon.motif,
    symptomes: parseListeJSON(brouillon.symptomes),
    temperatureCelsius: brouillon.temperatureCelsius,
    pouls: brouillon.pouls,
    tensionSystolique: brouillon.tensionSystolique,
    tensionDiastolique: brouillon.tensionDiastolique,
    frequenceRespiratoire: brouillon.frequenceRespiratoire,
    saturationOxygene: brouillon.saturationOxygene,
    poidsKg: brouillon.poidsKg,
    tailleCm: brouillon.tailleCm,
    glycemieGL: brouillon.glycemieGL,
    observations: brouillon.observations,
    conclusion: brouillon.conclusion,
  };
}

/** Contact d'urgence tel qu'affiche dans le resume patient. */
export interface ContactUrgenceResume {
  nom: string;
  telephone: string;
  lienParente: string;
}

/** Traitement actif (prescription non delivree/annulee) affiche dans le resume patient. */
export interface TraitementActifResume {
  id: string;
  medecinNomComplet: string;
  date: string;
  lignes: { medicamentNom: string; posologie: string }[];
}

/** Evenement recent (consultation validee) affiche dans le resume patient. */
export interface EvenementRecentResume {
  id: string;
  date: string;
  medecinNomComplet: string;
  motif: string;
  conclusion: string;
}

/** Resume patient (F-CLI-04 du pack) : bandeau, alertes cliniques, traitements en cours, derniers evenements. */
export interface ResumePatient {
  id: string;
  nomComplet: string;
  avatarUrl: string | null;
  identifiantSante: string;
  telephone: string;
  dateNaissance: string;
  age: number;
  sexe: string;
  groupeSanguin: string;
  allergies: string[];
  antecedents: string[];
  maladiesChroniques: string[];
  contactsUrgence: ContactUrgenceResume[];
  traitementsActifs: TraitementActifResume[];
  derniersEvenements: EvenementRecentResume[];
  // F-CLI-10 : present uniquement quand l'acces courant est un acces
  // d'urgence "bris de glace" (RG-CLI-91), pour afficher le bandeau rouge et
  // son expiration cote ecran.
  accesUrgenceExpirationLe: string | null;
  // F-CLI-14 : present uniquement quand l'acces courant vient d'une
  // reference ouverte vers l'etablissement du professionnel connecte (pas
  // d'un consentement individuel), pour afficher un bandeau informatif et
  // son expiration cote ecran.
  accesReferenceExpirationLe: string | null;
}

function parseContactsUrgenceResume(valeur: string): ContactUrgenceResume[] {
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

const NOMBRE_DERNIERS_EVENEMENTS = 5;

/** Base d'acces effective au dossier d'un patient, quelle que soit son origine. */
type AccesPatient =
  | { source: "consentement"; typeAcces: string; dateFin: Date | null }
  | { source: "reference"; referenceId: string; dateFinAcces: Date };

/**
 * Verifie l'acces d'un professionnel au dossier d'un patient : Consentement
 * individuel actif (cas normal, Zero Trust RG-CLI-30), ou a defaut une base
 * d'acces temporaire via une reference ouverte adressee a son etablissement
 * (F-CLI-14, RG-CLI-14x) tant qu'elle n'est pas expiree (30 jours a partir de
 * la creation, voir prisma/schema.prisma ReferencePatient.dateFinAcces).
 * Volontairement limite a la lecture (getResumePatient, getHistoriquePatient) :
 * comme l'acces d'urgence "bris de glace" (dont le typeAcces "urgence" est
 * deja exclu de TYPES_ACCES_CONSULTATION ci-dessus), une reference ne donne
 * jamais le droit de creer une nouvelle Consultation pour ce patient, qui
 * reste soumis a un Consentement explicite du patient.
 */
async function accesPatientAutorise(
  patientId: string,
  professionnel: { etablissementId: string },
  userId: string
): Promise<AccesPatient | null> {
  const consentement = await prisma.consentement.findUnique({
    where: {
      patientId_acteurAutoriseId: {
        patientId,
        acteurAutoriseId: userId,
      },
    },
  });

  const consentementValide =
    consentement !== null &&
    consentement.statut === "actif" &&
    (consentement.dateFin === null || consentement.dateFin > new Date());

  if (consentementValide) {
    return { source: "consentement", typeAcces: consentement.typeAcces, dateFin: consentement.dateFin };
  }

  const reference = await prisma.referencePatient.findFirst({
    where: {
      patientId,
      etablissementDestinationId: professionnel.etablissementId,
      dateFinAcces: { gt: new Date() },
    },
    orderBy: { dateFinAcces: "desc" },
  });

  if (reference) {
    return { source: "reference", referenceId: reference.id, dateFinAcces: reference.dateFinAcces };
  }

  return null;
}

/**
 * Resume d'un patient (F-CLI-04 du pack), reserve au professionnel connecte
 * s'il detient un Consentement actif pour ce patient, ou une base d'acces
 * temporaire via reference (F-CLI-14, voir accesPatientAutorise ci-dessus)
 * (Zero Trust, RG-CLI-30 : jamais de donnee envoyee sans base d'acces valide
 * - retourne null plutot que de filtrer partiellement, ce depot n'ayant
 * qu'un seul niveau d'acces "dossier_complet"/"consultations", pas les
 * niveaux SUMMARY/FULL du pack). Journalise la consultation du resume
 * (RG-CLI-31).
 */
export async function getResumePatient(patientId: string): Promise<ResumePatient | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return null;
  }

  const acces = await accesPatientAutorise(patientId, professionnel, session.userId);

  if (!acces) {
    return null;
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { user: true },
  });

  if (!patient) {
    return null;
  }

  const [prescriptionsActives, consultationsRecentes] = await Promise.all([
    prisma.prescription.findMany({
      where: { patientId, statut: { in: ["validee", "delivree_partiellement"] } },
      include: {
        medecinPrescripteur: { include: { user: true } },
        lignes: { include: { medicament: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.consultation.findMany({
      where: { patientId, statut: "terminee" },
      include: { professionnel: { include: { user: true } } },
      orderBy: { date: "desc" },
      take: NOMBRE_DERNIERS_EVENEMENTS,
    }),
  ]);

  const adresseTechnique = await adresseTechniqueCourante();

  await journaliser({
    utilisateurId: session.userId,
    action: "consultation_resume_patient",
    donneeConcernee: `patient:${patientId}`,
    adresseTechnique,
    justification:
      acces.source === "consentement"
        ? `Resume patient consulte (consentement ${acces.typeAcces})`
        : `Resume patient consulte (reference ${acces.referenceId}, base d'acces etablissement)`,
  });

  return {
    id: patient.id,
    nomComplet: nomComplet(patient.user),
    avatarUrl: patient.user.avatarUrl,
    identifiantSante: patient.identifiantSante,
    telephone: patient.user.telephone,
    dateNaissance: patient.dateNaissance.toISOString(),
    age: ageAnnees(patient.dateNaissance, new Date()),
    sexe: patient.sexe,
    groupeSanguin: patient.groupeSanguin,
    allergies: parseListeJSON(patient.allergies),
    antecedents: parseListeJSON(patient.antecedents),
    maladiesChroniques: parseListeJSON(patient.maladiesChroniques),
    contactsUrgence: parseContactsUrgenceResume(patient.contactsUrgence),
    traitementsActifs: prescriptionsActives.map((prescription) => ({
      id: prescription.id,
      medecinNomComplet: nomCompletProfessionnel(prescription.medecinPrescripteur.user),
      date: prescription.date.toISOString(),
      lignes: prescription.lignes.map((ligne) => ({
        medicamentNom: ligne.medicament.nom,
        posologie: ligne.posologie,
      })),
    })),
    derniersEvenements: consultationsRecentes.map((consultation) => ({
      id: consultation.id,
      date: consultation.date.toISOString(),
      medecinNomComplet: nomCompletProfessionnel(consultation.professionnel.user),
      motif: consultation.motif,
      conclusion: consultation.conclusion,
    })),
    accesUrgenceExpirationLe:
      acces.source === "consentement" && acces.typeAcces === "urgence" && acces.dateFin
        ? acces.dateFin.toISOString()
        : null,
    accesReferenceExpirationLe: acces.source === "reference" ? acces.dateFinAcces.toISOString() : null,
  };
}

export type TypeEvenementHistorique = "consultation" | "prescription" | "examen" | "suivi_communautaire";

/** Un element de la chronologie complete d'un patient (F-CLI-09 du pack). */
export interface EvenementHistorique {
  id: string;
  type: TypeEvenementHistorique;
  date: string; // ISO
  titre: string;
  description: string;
  statut: string | null;
  saisieParErreur: boolean;
  professionnelNomComplet: string;
  etablissementId: string;
  etablissementNom: string;
  /** Lignes de detail affichees dans le panneau lateral (F-CLI-09). */
  detailLignes: string[];
}

export interface FiltresHistorique {
  type?: TypeEvenementHistorique;
  dateDebut?: string; // ISO yyyy-mm-dd
  dateFin?: string; // ISO yyyy-mm-dd
  etablissementId?: string;
  page?: number;
}

export interface HistoriquePatientResultat {
  evenements: EvenementHistorique[]; // page courante, deja filtree et triee
  total: number;
  page: number;
  nombreDePages: number;
  etablissementsDisponibles: { id: string; nom: string }[];
}

const TAILLE_PAGE_HISTORIQUE = 25;

/**
 * Chronologie complete d'un patient (F-CLI-09 du pack) : consultations
 * validees, prescriptions, examens et visites de suivi communautaire,
 * fusionnes et tries du plus recent au plus ancien. Meme garde Zero Trust
 * que getResumePatient (Consentement actif requis, RG-CLI-30).
 *
 * Limite assumee : n'inclut ni vaccinations ni documents medicaux, ces deux
 * types d'evenements n'ayant aucun modele de donnees dans ce depot (voir
 * docs/audit-cote-medecin.md, F-CLI-11 et F-CLI-13).
 *
 * RG-CLI-80 : l'affichage de la liste est journalise une fois par page
 * (ci-dessous) ; l'ouverture du detail d'un element est journalisee
 * separement par journaliserOuvertureDetailHistoriqueAction, appelee cote
 * ecran au moment de l'ouverture du panneau lateral.
 */
export async function getHistoriquePatient(
  patientId: string,
  filtres: FiltresHistorique = {}
): Promise<HistoriquePatientResultat | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return null;
  }

  const acces = await accesPatientAutorise(patientId, professionnel, session.userId);

  if (!acces) {
    return null;
  }

  const [consultations, prescriptions, examens, suivis] = await Promise.all([
    prisma.consultation.findMany({
      where: { patientId, statut: "terminee" },
      include: { professionnel: { include: { user: true } }, etablissement: true },
    }),
    prisma.prescription.findMany({
      where: { patientId },
      include: {
        medecinPrescripteur: { include: { user: true } },
        consultation: { include: { etablissement: true } },
        lignes: { include: { medicament: true } },
      },
    }),
    prisma.examenMedical.findMany({
      where: { patientId },
      include: { demandeur: { include: { user: true } }, laboratoire: true },
    }),
    prisma.suiviCommunautaire.findMany({
      where: { patientId },
      include: { agent: { include: { user: true } }, etablissement: true },
    }),
  ]);

  // RG-CLI-91 : un acces d'urgence "bris de glace" (F-CLI-10) ne donne jamais
  // acces aux examens sensibles (ex. serologie VIH), exclus entierement de la
  // chronologie plutot que masques partiellement. Meme restriction pour un
  // acces via reference (F-CLI-14) : ni l'un ni l'autre n'est un consentement
  // explicite et specifique du patient.
  const accesRestreint = acces.source === "reference" || acces.typeAcces === "urgence";
  const examensAccessibles = accesRestreint ? examens.filter((e) => !e.sensible) : examens;

  const tousLesEvenements: EvenementHistorique[] = [
    ...consultations.map((c): EvenementHistorique => ({
      id: c.id,
      type: "consultation",
      date: c.date.toISOString(),
      titre: c.motif || "Consultation",
      description: c.conclusion,
      statut: c.saisieParErreur ? "retiree" : "terminee",
      saisieParErreur: c.saisieParErreur,
      professionnelNomComplet: nomCompletProfessionnel(c.professionnel.user),
      etablissementId: c.etablissementId,
      etablissementNom: c.etablissement.nom,
      detailLignes: [
        `Motif : ${c.motif || "non precise"}`,
        c.conclusion ? `Conclusion : ${c.conclusion}` : "",
        c.saisieParErreur && c.motifRetrait ? `Retiree (saisie par erreur) : ${c.motifRetrait}` : "",
      ].filter(Boolean),
    })),
    ...prescriptions.map((p): EvenementHistorique => ({
      id: p.id,
      type: "prescription",
      date: p.date.toISOString(),
      titre: `Prescription ${p.numero}`,
      description: p.lignes.map((ligne) => ligne.medicament.nom).join(", "),
      statut: p.statut,
      saisieParErreur: false,
      professionnelNomComplet: nomCompletProfessionnel(p.medecinPrescripteur.user),
      etablissementId: p.consultation.etablissementId,
      etablissementNom: p.consultation.etablissement.nom,
      detailLignes: p.lignes.map((ligne) => `${ligne.medicament.nom} : ${ligne.posologie}`),
    })),
    ...examensAccessibles.map((e): EvenementHistorique => {
      // RG-LAB-30 du pack : un resultat saisi mais pas encore valide par un
      // second professionnel de laboratoire (F-LAB-04, principe des quatre
      // yeux) n'est jamais visible en dehors du laboratoire, y compris ici.
      const resultatVisible = e.statut === "termine" ? e.resultat : null;
      return {
        id: e.id,
        type: "examen",
        date: e.date.toISOString(),
        titre: e.typeExamen,
        description: resultatVisible ?? "",
        statut: e.statut,
        saisieParErreur: false,
        professionnelNomComplet: nomCompletProfessionnel(e.demandeur.user),
        etablissementId: e.laboratoireId,
        etablissementNom: e.laboratoire.nom,
        detailLignes: [
          `Statut : ${e.statut}`,
          resultatVisible ? `Résultat : ${resultatVisible}` : "En attente de résultat validé.",
        ],
      };
    }),
    ...suivis.map((s): EvenementHistorique => ({
      id: s.id,
      type: "suivi_communautaire",
      date: s.dateVisite.toISOString(),
      titre: `Visite communautaire (${s.typeVisite})`,
      description: s.notes,
      statut: null,
      saisieParErreur: false,
      professionnelNomComplet: nomComplet(s.agent.user),
      etablissementId: s.etablissementId,
      etablissementNom: s.etablissement.nom,
      detailLignes: [s.localisation ? `Lieu : ${s.localisation}` : "", s.notes].filter(Boolean),
    })),
  ];

  const etablissementsDisponibles = [
    ...new Map(tousLesEvenements.map((e) => [e.etablissementId, e.etablissementNom])).entries(),
  ]
    .map(([id, nom]) => ({ id, nom }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  let evenementsFiltres = tousLesEvenements;

  if (filtres.type) {
    evenementsFiltres = evenementsFiltres.filter((e) => e.type === filtres.type);
  }
  if (filtres.etablissementId) {
    evenementsFiltres = evenementsFiltres.filter((e) => e.etablissementId === filtres.etablissementId);
  }
  if (filtres.dateDebut) {
    evenementsFiltres = evenementsFiltres.filter((e) => e.date >= filtres.dateDebut!);
  }
  if (filtres.dateFin) {
    const borneFin = `${filtres.dateFin}T23:59:59.999Z`;
    evenementsFiltres = evenementsFiltres.filter((e) => e.date <= borneFin);
  }

  evenementsFiltres = [...evenementsFiltres].sort((a, b) => (a.date < b.date ? 1 : -1));

  const total = evenementsFiltres.length;
  const nombreDePages = Math.max(1, Math.ceil(total / TAILLE_PAGE_HISTORIQUE));
  const page = Math.min(Math.max(1, filtres.page ?? 1), nombreDePages);
  const debut = (page - 1) * TAILLE_PAGE_HISTORIQUE;

  const adresseTechnique = await adresseTechniqueCourante();

  // RG-CLI-80 : l'affichage de la liste est journalise une fois par page,
  // jamais une fois par element (voir journaliserOuvertureDetailHistoriqueAction).
  await journaliser({
    utilisateurId: session.userId,
    action: "consultation_historique_patient",
    donneeConcernee: `patient:${patientId}`,
    adresseTechnique,
    justification: `Historique consulte (page ${page}/${nombreDePages})`,
  });

  return {
    evenements: evenementsFiltres.slice(debut, debut + TAILLE_PAGE_HISTORIQUE),
    total,
    page,
    nombreDePages,
    etablissementsDisponibles,
  };
}

/**
 * RG-CLI-80 : journalise l'ouverture du panneau de detail d'un element de
 * l'historique, individuellement (VIEW + type + identifiant), en plus de
 * l'entree unique deja posee par getHistoriquePatient pour l'affichage de la
 * liste. Aucune nouvelle donnee n'est exposee par cet appel (le detail est
 * deja present cote client, issu du meme chargement de page) : uniquement de
 * la journalisation, donc pas de re-verification du consentement ici.
 */
export async function journaliserOuvertureDetailHistoriqueAction(
  type: TypeEvenementHistorique,
  id: string
): Promise<void> {
  const session = await getSession();

  if (!session) {
    return;
  }

  const cible = type === "examen" ? "examen_medical" : type;
  const adresseTechnique = await adresseTechniqueCourante();

  await journaliser({
    utilisateurId: session.userId,
    action: "consultation_historique_detail",
    donneeConcernee: `${cible}:${id}`,
    adresseTechnique,
    justification: "Detail ouvert depuis l'historique du patient",
  });
}

/**
 * Recupere les consultations creees par le professionnel connecte (derive de
 * getSession() -> ProfessionnelSante lie), de la plus recente a la plus
 * ancienne.
 */
export async function getConsultationsDuProfessionnel(): Promise<ConsultationResume[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const consultations = await prisma.consultation.findMany({
    where: { professionnelId: professionnel.id },
    include: {
      patient: { include: { user: true } },
      addenda: { include: { auteur: true }, orderBy: { date: "asc" } },
    },
    orderBy: { date: "desc" },
  });

  return consultations.map((consultation) => ({
    id: consultation.id,
    patientId: consultation.patientId,
    date: consultation.date.toISOString(),
    motif: consultation.motif,
    symptomes: parseListeJSON(consultation.symptomes),
    temperatureCelsius: consultation.temperatureCelsius,
    pouls: consultation.pouls,
    tensionSystolique: consultation.tensionSystolique,
    tensionDiastolique: consultation.tensionDiastolique,
    frequenceRespiratoire: consultation.frequenceRespiratoire,
    saturationOxygene: consultation.saturationOxygene,
    poidsKg: consultation.poidsKg,
    tailleCm: consultation.tailleCm,
    glycemieGL: consultation.glycemieGL,
    observations: consultation.observations,
    conclusion: consultation.conclusion,
    statut: consultation.statut,
    professionnelNomComplet: null,
    patientNomComplet: nomComplet(consultation.patient.user),
    patientIdentifiantSante: consultation.patient.identifiantSante,
    saisieParErreur: consultation.saisieParErreur,
    motifRetrait: consultation.motifRetrait,
    addenda: versAddendaResume(consultation.addenda),
  }));
}

/**
 * Recupere les consultations de tout l'etablissement du professionnel connecte
 * (derive de getSession() -> ProfessionnelSante lie), tous medecins confondus,
 * de la plus recente a la plus ancienne. A la difference de
 * getConsultationsDuProfessionnel (filtre sur professionnelId = moi), utile a
 * un role qui ne cree jamais lui-meme de consultation mais doit pouvoir
 * suivre celles de son etablissement, comme l'infirmier (read:consultation
 * dans la matrice RBAC, sans create:consultation). RG-CLI-41 du pack : un
 * brouillon n'est visible que par son auteur, jamais par les autres
 * soignants - exclu explicitement ici.
 */
export async function getConsultationsDeLEtablissement(): Promise<ConsultationResume[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const consultations = await prisma.consultation.findMany({
    where: {
      professionnel: { etablissementId: professionnel.etablissementId },
      statut: { not: "brouillon" },
    },
    include: {
      patient: { include: { user: true } },
      professionnel: { include: { user: true } },
      addenda: { include: { auteur: true }, orderBy: { date: "asc" } },
    },
    orderBy: { date: "desc" },
  });

  return consultations.map((consultation) => ({
    id: consultation.id,
    patientId: consultation.patientId,
    date: consultation.date.toISOString(),
    motif: consultation.motif,
    symptomes: parseListeJSON(consultation.symptomes),
    temperatureCelsius: consultation.temperatureCelsius,
    pouls: consultation.pouls,
    tensionSystolique: consultation.tensionSystolique,
    tensionDiastolique: consultation.tensionDiastolique,
    frequenceRespiratoire: consultation.frequenceRespiratoire,
    saturationOxygene: consultation.saturationOxygene,
    poidsKg: consultation.poidsKg,
    tailleCm: consultation.tailleCm,
    glycemieGL: consultation.glycemieGL,
    observations: consultation.observations,
    conclusion: consultation.conclusion,
    statut: consultation.statut,
    professionnelNomComplet: nomCompletProfessionnel(consultation.professionnel.user),
    patientNomComplet: nomComplet(consultation.patient.user),
    patientIdentifiantSante: consultation.patient.identifiantSante,
    saisieParErreur: consultation.saisieParErreur,
    motifRetrait: consultation.motifRetrait,
    addenda: versAddendaResume(consultation.addenda),
  }));
}

/**
 * Enregistre un brouillon de consultation et, si demande, le valide dans la
 * meme operation (F-CLI-05/06/07 du pack). Une seule action pour les deux
 * boutons du formulaire (intent = "brouillon" ou "valider", porte par le
 * bouton cliquee via son propre attribut name/value) : valider sans
 * resoumettre les champs saurait sinon verrouiller une version perimee du
 * contenu si le medecin n'avait pas prealablement enregistre son brouillon.
 *
 * Zero Trust : le patient et la consultation cible sont toujours revalides
 * en base. RG-CLI-40 : un medecin ne peut avoir qu'un seul brouillon ouvert
 * par patient - si consultationId est vide et qu'un brouillon existe deja
 * pour (patientId, medecin connecte), il est repris plutot que d'en creer un
 * second. Le motif et la conclusion restent facultatifs pour un simple
 * enregistrement (RG-CLI-41) mais deviennent obligatoires pour valider
 * (CA-1 du pack, tient lieu de "diagnostic principal" - ce depot n'ayant pas
 * de codage CIM-10). La validation calcule l'empreinte SHA-256 du contenu
 * canonique et horodate separement de la date de demarrage (RG-CLI-61) ;
 * apres validation, seul un addendum pourra completer la consultation
 * (RG-CLI-00, voir ajouterAddendumConsultationAction).
 */
export async function enregistrerConsultationAction(
  prevState: ClinicalActionState,
  formData: FormData
): Promise<ClinicalActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  // RBAC (voir src/security/permissions.ts) : creer/modifier une
  // consultation est reserve au role medecin. Posseder un profil
  // ProfessionnelSante ne suffit pas (un infirmier, un pharmacien ou un
  // administrateur d'etablissement en ont aussi un).
  if (!session.roles.some((role) => can(role, "create", "consultation"))) {
    return { error: "Action reservee aux medecins.", success: false };
  }

  const validation = schemaEnregistrementBrouillon.safeParse({
    consultationId: texte(formData, "consultationId"),
    patientId: texte(formData, "patientId"),
    rendezVousId: texte(formData, "rendezVousId"),
    priseEnChargeId: texte(formData, "priseEnChargeId"),
    motif: texte(formData, "motif"),
    symptomes: texte(formData, "symptomes"),
    temperatureCelsius: texte(formData, "temperatureCelsius"),
    pouls: texte(formData, "pouls"),
    tensionSystolique: texte(formData, "tensionSystolique"),
    tensionDiastolique: texte(formData, "tensionDiastolique"),
    frequenceRespiratoire: texte(formData, "frequenceRespiratoire"),
    saturationOxygene: texte(formData, "saturationOxygene"),
    poidsKg: texte(formData, "poidsKg"),
    tailleCm: texte(formData, "tailleCm"),
    glycemieGL: texte(formData, "glycemieGL"),
    confirmerAlerteConstantes: texte(formData, "confirmerAlerteConstantes"),
    observations: texte(formData, "observations"),
    conclusion: texte(formData, "conclusion"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de consultation invalides."),
      success: false,
    };
  }

  const valider = texte(formData, "intent") === "valider";

  const {
    consultationId,
    patientId,
    rendezVousId,
    priseEnChargeId,
    motif,
    symptomes,
    temperatureCelsius,
    pouls,
    tensionSystolique,
    tensionDiastolique,
    frequenceRespiratoire,
    saturationOxygene,
    poidsKg,
    tailleCm,
    glycemieGL,
    confirmerAlerteConstantes,
    observations,
    conclusion,
  } = validation.data;

  if (valider && (motif.trim().length === 0 || conclusion.trim().length === 0)) {
    const champsManquants = [
      motif.trim().length === 0 ? "motif" : null,
      conclusion.trim().length === 0 ? "conclusion (diagnostic)" : null,
    ].filter((champ): champ is string => champ !== null);

    return {
      error: `Impossible de valider : renseignez ${champsManquants.join(" et ")}.`,
      success: false,
    };
  }

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });

    if (!patient) {
      return { error: "Ce patient est introuvable.", success: false };
    }

    // F-CLI-06 / RG-CLI-50 : chaque constante saisie est verifiee (plage
    // acceptee sinon refus definitif, plage d'alerte dependante de l'age
    // sinon confirmation exigee). controles-constantes.ts est la seule
    // autorite reelle : le formulaire ne fait qu'anticiper le meme calcul.
    const dateReference = new Date();
    const controles: ResultatControleConstante[] = [];

    if (temperatureCelsius !== undefined) controles.push(controlerTemperature(temperatureCelsius));
    if (pouls !== undefined) controles.push(controlerPouls(pouls, patient.dateNaissance, dateReference));
    if (tensionSystolique !== undefined && tensionDiastolique !== undefined) {
      controles.push(
        controlerTensionSystolique(tensionSystolique, tensionDiastolique, patient.dateNaissance, dateReference)
      );
      controles.push(controlerTensionDiastolique(tensionDiastolique));
    }
    if (frequenceRespiratoire !== undefined) {
      controles.push(controlerFrequenceRespiratoire(frequenceRespiratoire, patient.dateNaissance, dateReference));
    }
    if (saturationOxygene !== undefined) controles.push(controlerSaturationOxygene(saturationOxygene));
    if (poidsKg !== undefined) controles.push(controlerPoids(poidsKg));
    if (tailleCm !== undefined) controles.push(controlerTaille(tailleCm));
    if (glycemieGL !== undefined) controles.push(controlerGlycemie(glycemieGL));

    const imc = calculerIMC(poidsKg ?? null, tailleCm ?? null);
    if (imc !== null) controles.push(controlerIMC(imc));

    const refus = controles.find((controle) => controle.statut === "refus");
    if (refus) {
      return { error: refus.message, success: false };
    }

    const uneAlerte = controles.some((controle) => controle.statut === "alerte");
    if (uneAlerte && !confirmerAlerteConstantes) {
      return {
        error: "Au moins une constante est inhabituelle. Confirmez pour enregistrer malgre tout.",
        success: false,
      };
    }

    const consentement = await prisma.consentement.findUnique({
      where: {
        patientId_acteurAutoriseId: {
          patientId,
          acteurAutoriseId: session.userId,
        },
      },
    });

    const consentementValide =
      consentement !== null &&
      consentement.statut === "actif" &&
      (consentement.dateFin === null || consentement.dateFin > new Date()) &&
      (TYPES_ACCES_CONSULTATION as readonly string[]).includes(consentement.typeAcces);

    if (!consentementValide) {
      return {
        error:
          "Aucun consentement actif pour ce patient. Le patient doit d'abord vous autoriser depuis son espace.",
        success: false,
      };
    }

    const rendezVousIdNettoye = rendezVousId.trim();
    let rendezVousIdValide: string | null = null;

    if (rendezVousIdNettoye.length > 0) {
      const rendezVous = await prisma.rendezVous.findUnique({
        where: { id: rendezVousIdNettoye },
      });

      if (
        !rendezVous ||
        rendezVous.patientId !== patientId ||
        rendezVous.professionnelId !== professionnel.id
      ) {
        return { error: "Ce rendez-vous est introuvable.", success: false };
      }

      rendezVousIdValide = rendezVous.id;
    }

    const donneesConsultation = {
      motif,
      symptomes: JSON.stringify(parseListeLignes(symptomes)),
      temperatureCelsius: temperatureCelsius ?? null,
      pouls: pouls ?? null,
      tensionSystolique: tensionSystolique ?? null,
      tensionDiastolique: tensionDiastolique ?? null,
      frequenceRespiratoire: frequenceRespiratoire ?? null,
      saturationOxygene: saturationOxygene ?? null,
      poidsKg: poidsKg ?? null,
      tailleCm: tailleCm ?? null,
      glycemieGL: glycemieGL ?? null,
      observations,
      conclusion,
    };

    const adresseTechnique = await adresseTechniqueCourante();
    const consultationIdNettoye = consultationId.trim();

    const idFinal = await prisma.$transaction(async (tx) => {
      let cible: { id: string; rendezVousId: string | null; date: Date; etablissementId: string };

      // Consultation deja identifiee par le formulaire (enregistrements
      // suivants d'un meme brouillon) : verifie l'appartenance (Zero Trust)
      // et le statut avant toute ecriture.
      if (consultationIdNettoye.length > 0) {
        const existante = await tx.consultation.findUnique({ where: { id: consultationIdNettoye } });

        if (!existante || existante.professionnelId !== professionnel.id) {
          throw new Error("CONSULTATION_INTROUVABLE");
        }

        if (existante.statut !== "brouillon") {
          throw new Error("CONSULTATION_DEJA_VALIDEE");
        }

        await tx.consultation.update({ where: { id: existante.id }, data: donneesConsultation });
        cible = existante;
      } else {
        // RG-CLI-40 : un seul brouillon ouvert par (medecin, patient) - le
        // reouvre au lieu d'en creer un second si un formulaire concurrent
        // (deux onglets, par exemple) n'a pas transmis son id.
        const brouillonExistant = await tx.consultation.findFirst({
          where: { patientId, professionnelId: professionnel.id, statut: "brouillon" },
        });

        if (brouillonExistant) {
          await tx.consultation.update({ where: { id: brouillonExistant.id }, data: donneesConsultation });
          cible = brouillonExistant;
        } else {
          const consultationCreee = await tx.consultation.create({
            data: {
              patientId,
              professionnelId: professionnel.id,
              etablissementId: professionnel.etablissementId,
              rendezVousId: rendezVousIdValide,
              statut: "brouillon",
              ...donneesConsultation,
            },
          });

          await journaliser(
            {
              utilisateurId: session.userId,
              action: "creation_brouillon",
              donneeConcernee: `consultation:${consultationCreee.id}`,
              adresseTechnique,
              justification: `Brouillon de consultation cree pour le patient ${patientId}`,
            },
            tx
          );

          // F-CLI-12 : la prise en charge infirmiere ayant pre-rempli ce
          // brouillon est marquee "recuperee" pour ne plus etre proposee au
          // prochain medecin qui demarre une consultation pour ce patient.
          const priseEnChargeIdNettoye = priseEnChargeId.trim();
          if (priseEnChargeIdNettoye.length > 0) {
            await tx.priseEnChargeInfirmiere.updateMany({
              where: { id: priseEnChargeIdNettoye, patientId, statut: "en_attente" },
              data: { statut: "recuperee", consultationRattacheeId: consultationCreee.id },
            });
          }

          cible = consultationCreee;
        }
      }

      if (!valider) {
        return cible.id;
      }

      // F-CLI-07 / RG-CLI-61 : verrouille definitivement le contenu.
      const empreinteContenu = calculerEmpreinteConsultation(donneesConsultation);
      const dateValidation = new Date();

      await tx.consultation.update({
        where: { id: cible.id },
        data: { statut: "terminee", dateValidation, empreinteContenu },
      });

      // F-PIL-07 : publie l'evenement qui declenchera le recalcul des
      // agregats (IND-01/02/03/04) du jour et de l'etablissement concernes.
      await publierEvenementPilotage(tx, {
        type: "consultation_validee",
        date: cible.date,
        etablissementId: cible.etablissementId,
      });

      if (cible.rendezVousId) {
        await tx.rendezVous.update({
          where: { id: cible.rendezVousId },
          data: { statut: "termine" },
        });
      }

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "validation_consultation",
          donneeConcernee: `consultation:${cible.id}`,
          adresseTechnique,
          justification: `Consultation validee pour le patient ${patientId}`,
        },
        tx
      );

      return cible.id;
    });

    return { error: null, success: true, consultationId: idFinal, valide: valider };
  } catch (erreur) {
    if (erreur instanceof Error && erreur.message === "CONSULTATION_INTROUVABLE") {
      return { error: "Cette consultation est introuvable.", success: false };
    }
    if (erreur instanceof Error && erreur.message === "CONSULTATION_DEJA_VALIDEE") {
      return { error: "Cette consultation est deja validee et ne peut plus etre modifiee.", success: false };
    }
    console.error("Erreur lors de l'enregistrement de la consultation :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Ajoute un addendum a une consultation (F-CLI-08 du pack) : jamais une
 * modification du contenu original (RG-CLI-00, immuabilite), toujours un
 * ajout date et signe. Reserve a l'auteur de la consultation (Zero Trust :
 * verifie en base, jamais suppose depuis le role seul), dans la fenetre de
 * 12 mois suivant la consultation (RG-CLI-70).
 */
export async function ajouterAddendumConsultationAction(
  prevState: ClinicalActionState,
  formData: FormData
): Promise<ClinicalActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  // RBAC explicite (voir src/security/permissions.ts), en plus de la
  // verification d'appartenance plus bas : la meme convention Zero Trust que
  // enregistrerConsultationAction, pas seulement une consequence indirecte
  // du fait qu'un non-medecin ne peut de toute facon jamais etre l'auteur
  // d'une consultation existante.
  if (!session.roles.some((role) => can(role, "create", "consultation"))) {
    return { error: "Action reservee aux medecins.", success: false };
  }

  const validation = schemaAjoutAddendum.safeParse({
    consultationId: texte(formData, "consultationId"),
    motif: texte(formData, "motif"),
    contenu: texte(formData, "contenu"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees d'addendum invalides."),
      success: false,
    };
  }

  const { consultationId, motif, contenu } = validation.data;

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

    if (consultation.statut !== "terminee") {
      return {
        error: "Seule une consultation validee peut recevoir un addendum.",
        success: false,
      };
    }

    if (consultation.saisieParErreur) {
      return {
        error: "Cette consultation a ete retiree (saisie par erreur) : aucun addendum n'est possible.",
        success: false,
      };
    }

    if (!consultation.dateValidation || fenetreAddendumRetraitDepassee(consultation.dateValidation)) {
      return {
        error: `La fenetre de ${MOIS_FENETRE_ADDENDUM_RETRAIT} mois pour ajouter un addendum a cette consultation est depassee.`,
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      const addendumCree = await tx.addendumConsultation.create({
        data: {
          consultationId: consultation.id,
          auteurId: session.userId,
          motif,
          contenu,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "ajout_addendum",
          donneeConcernee: `consultation:${consultation.id}`,
          adresseTechnique,
          justification: `Addendum ${addendumCree.id} ajoute a la consultation ${consultation.id} (motif : ${motif})`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'ajout de l'addendum :", erreur);
    return {
      error: "Une erreur est survenue lors de l'ajout de l'addendum. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Retire une consultation saisie par erreur (F-CLI-08 du pack, "entered in
 * error") : reserve au cas d'une consultation enregistree sur le mauvais
 * patient. La consultation n'est jamais supprimee, seulement marquee comme
 * retiree (elle reste visible, barree a l'ecran, et exclue des
 * statistiques). Exige une re-authentification par mot de passe (RG-AUTH-53
 * du pack) : ce depot n'a pas de flux de re-authentification de session
 * dedie, la verification du mot de passe actuel en tient lieu, au meme
 * niveau que changerMotDePasseAction. Reserve a l'auteur de la consultation,
 * dans la fenetre de 12 mois suivant la consultation (RG-CLI-70).
 */
export async function retirerConsultationAction(
  prevState: ClinicalActionState,
  formData: FormData
): Promise<ClinicalActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  // RBAC explicite (voir ajouterAddendumConsultationAction ci-dessus pour la
  // meme remarque) : verifie en plus de l'appartenance, pas a sa place.
  if (!session.roles.some((role) => can(role, "create", "consultation"))) {
    return { error: "Action reservee aux medecins.", success: false };
  }

  const validation = schemaRetraitConsultation.safeParse({
    consultationId: texte(formData, "consultationId"),
    motif: texte(formData, "motif"),
    motDePasse: texte(formData, "motDePasse"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de retrait invalides."),
      success: false,
    };
  }

  const { consultationId, motif, motDePasse } = validation.data;

  try {
    const utilisateur = await prisma.user.findUnique({ where: { id: session.userId } });

    if (!utilisateur) {
      return { error: "Compte introuvable.", success: false };
    }

    const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.motDePasseHash);

    if (!motDePasseValide) {
      return { error: "Mot de passe incorrect.", success: false };
    }

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

    if (consultation.statut !== "terminee") {
      return { error: "Seule une consultation validee peut etre retiree.", success: false };
    }

    if (consultation.saisieParErreur) {
      return { error: "Cette consultation a deja ete retiree.", success: false };
    }

    if (!consultation.dateValidation || fenetreAddendumRetraitDepassee(consultation.dateValidation)) {
      return {
        error: `La fenetre de ${MOIS_FENETRE_ADDENDUM_RETRAIT} mois pour retirer cette consultation est depassee.`,
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.consultation.update({
        where: { id: consultation.id },
        data: { saisieParErreur: true, motifRetrait: motif, dateRetrait: new Date() },
      });

      // F-PIL-07 / RG-PIL-61 : republie l'evenement pour ce meme jour et
      // etablissement, afin que le prochain recalcul fasse disparaitre cette
      // consultation des agregats.
      await publierEvenementPilotage(tx, {
        type: "consultation_retiree",
        date: consultation.date,
        etablissementId: consultation.etablissementId,
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "retrait_consultation",
          donneeConcernee: `consultation:${consultation.id}`,
          adresseTechnique,
          justification: `Consultation retiree (saisie par erreur), motif : ${motif}`,
        },
        tx
      );
    });

    // Notification du responsable de l'etablissement (F-CLI-08 du pack), hors
    // transaction : une notification manquee ne doit jamais faire echouer le
    // retrait lui-meme (deja acte en base a ce stade).
    const responsable = await prisma.professionnelSante.findFirst({
      where: {
        etablissementId: professionnel.etablissementId,
        user: { roles: { some: { nom: "admin_etablissement" } } },
      },
    });

    if (responsable) {
      const { creerNotification } = await import("@/modules/notification/actions");
      await creerNotification(
        responsable.userId,
        "consultation_retiree",
        "Une consultation a ete retiree (saisie par erreur) dans votre etablissement.",
        "/app/medecin/consultations"
      );
    }

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du retrait de la consultation :", erreur);
    return {
      error: "Une erreur est survenue lors du retrait de la consultation. Veuillez reessayer.",
      success: false,
    };
  }
}
