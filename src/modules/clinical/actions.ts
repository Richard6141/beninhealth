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
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { publierEvenementPilotage } from "@/modules/pilotage/file-taches";
import { creerNotification } from "@/modules/notification/creer";
import { destinataireNotificationPatient } from "@/modules/facility/destinataire-notification-patient";
import { STATUTS_ACTIFS, transitionnerRendezVous } from "@/modules/facility/rendez-vous-etats";
import { bornesJourneeBenin } from "@/modules/transfert/code-acces";
import { MESSAGE_ORDRE_NON_VERIFIE, professionnelValide } from "@/modules/administration/validation-professionnels-controle";
import { FORMAT_CODE_CIM10, estChapitreSymptome, normaliserCodeCim10 } from "@/modules/administration/cim10-groupes";
import { getSession, destroySession } from "@/lib/session";
import { can } from "@/security/permissions";
// RG-AUTH-53 : module partage (corrige le 2026-09-28, voir
// docs/coordination-agents.md, prise F-CLI-08). retirerConsultationAction
// n'avait jusque-la ni la fenetre de grace partagee ni la verification MFA.
import {
  reauthentificationBloquee,
  reauthentificationRecente,
  enregistrerReauthentificationReussie,
  enregistrerEchecReauthentification,
  motDePasseEtCodeMfaValides,
  type MotifEchecReauthentification,
} from "@/modules/identity/reauthentification";
import {
  ageAnnees,
  calculerIMC,
  controlerFrequenceRespiratoire,
  controlerGlycemie,
  controlerIMC,
  controlerPoids,
  controlerVariationPoids,
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
  // F-CLI-06/07 du pack (RG-CLI-52/53) : diagnostic principal codifie
  // CIM-10, sa certitude, et 0 a 5 diagnostics secondaires. Null/vide pour
  // toute consultation validee avant ce champ.
  diagnosticPrincipalCode: string | null;
  diagnosticPrincipalLibelle: string | null;
  diagnosticPrincipalCertitude: string | null;
  diagnosticsSecondaires: { code: string; libelle: string }[];
  // Vrai si le diagnostic principal appartient a un groupe sensible
  // (VIH, IST, sante mentale...) : confidentialite renforcee, RG-CLI-53.
  sensible: boolean;
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
/** F-CLI-06 : motif limite a 200 caracteres (section "Sections de saisie" du pack). */
const LONGUEUR_MAX_MOTIF = 200;

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
  // RG-AUTH-53 : vide et accepte si la fenetre de grace est deja ouverte
  // (identity/reauthentification.ts), sinon obligatoire, revalide dans
  // l'action elle-meme (Zero Trust).
  motDePasse: z.string().optional().default(""),
  codeMfa: z.string().optional().default(""),
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

/** RG-ACC-15 / base B4 : duree du contexte de soins depuis l'arrivee du patient. */
const DUREE_CONTEXTE_SOINS_HEURES = 72;

/** Types de consentement qui ouvrent la lecture du resume et de l'historique du dossier (l'acces d'urgence en fait partie, sans donnee sensible). */
const TYPES_ACCES_LECTURE_DOSSIER = ["dossier_complet", "consultations", "urgence"] as const;

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
  motif: z.string().trim().max(LONGUEUR_MAX_MOTIF, `${LONGUEUR_MAX_MOTIF} caracteres maximum.`).optional().default(""),
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
  // F-CLI-06 / RG-CLI-52/53 du pack : diagnostic principal codifie CIM-10,
  // branche sur administration/referentiel-cim10.ts. Le code est revalide
  // aupres du referentiel avant tout enregistrement (Zero Trust : jamais le
  // libelle ni le caractere sensible transmis par le client). Facultatif
  // pour un simple brouillon, exige pour valider (voir plus bas).
  diagnosticPrincipalCode: z.string().trim().optional().default(""),
  // confirme | suspecte ; ignore (toujours "suspecte") pour un code du
  // chapitre symptomes (R00-R99).
  diagnosticPrincipalCertitude: z.string().trim().optional().default(""),
  // JSON d'un tableau de codes CIM-10 (0 a 5), revalides un par un.
  diagnosticsSecondaires: z.string().trim().optional().default("[]"),
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
  diagnosticPrincipalCode: string | null;
  diagnosticPrincipalCertitude: string | null;
  diagnosticsSecondaires: string;
}): string {
  const contenuCanonique = JSON.stringify(champs, Object.keys(champs).sort());
  return createHash("sha256").update(contenuCanonique).digest("hex");
}

const CERTITUDES_DIAGNOSTIC = ["confirme", "suspecte"] as const;
const MAXIMUM_DIAGNOSTICS_SECONDAIRES = 5;

interface DiagnosticCim10Valide {
  code: string;
  libelle: string;
  sensible: boolean;
}

/**
 * Revalide un code CIM-10 aupres du referentiel (Zero Trust : jamais le
 * libelle ni le caractere sensible transmis par le client, toujours relus en
 * base). Renvoie null si le code est mal forme, introuvable ou desactive
 * (F-ADM-04, RG-ADM-20 : une entree desactivee ne doit plus etre choisie
 * pour une nouvelle consultation, meme si d'anciennes consultations la
 * portent encore).
 */
async function diagnosticCim10Valide(codeBrut: string): Promise<DiagnosticCim10Valide | null> {
  const code = normaliserCodeCim10(codeBrut);

  if (!FORMAT_CODE_CIM10.test(code)) {
    return null;
  }

  const diagnostic = await prisma.diagnosticCim10.findUnique({ where: { code } });

  if (!diagnostic || !diagnostic.actif) {
    return null;
  }

  return { code: diagnostic.code, libelle: diagnostic.libelle, sensible: diagnostic.sensible };
}

/** Diagnostics secondaires (0 a 5) tels que stockes en base : JSON de {code, libelle}. */
function parseDiagnosticsSecondaires(valeur: string): { code: string; libelle: string }[] {
  try {
    const donnees: unknown = JSON.parse(valeur);
    if (!Array.isArray(donnees)) return [];
    return donnees.filter(
      (item): item is { code: string; libelle: string } =>
        typeof item === "object" && item !== null && typeof (item as { code?: unknown }).code === "string" && typeof (item as { libelle?: unknown }).libelle === "string"
    );
  } catch {
    return [];
  }
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
    diagnosticPrincipalCode: consultation.diagnosticPrincipalCode,
    diagnosticPrincipalLibelle: consultation.diagnosticPrincipalLibelle,
    diagnosticPrincipalCertitude: consultation.diagnosticPrincipalCertitude,
    diagnosticsSecondaires: parseDiagnosticsSecondaires(consultation.diagnosticsSecondaires),
    sensible: consultation.sensible,
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
  diagnosticPrincipalCode: string | null;
  diagnosticPrincipalLibelle: string | null;
  diagnosticPrincipalCertitude: string | null;
  diagnosticsSecondaires: { code: string; libelle: string }[];
  sensible: boolean;
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
    diagnosticPrincipalCode: brouillon.diagnosticPrincipalCode,
    diagnosticPrincipalLibelle: brouillon.diagnosticPrincipalLibelle,
    diagnosticPrincipalCertitude: brouillon.diagnosticPrincipalCertitude,
    diagnosticsSecondaires: parseDiagnosticsSecondaires(brouillon.diagnosticsSecondaires),
    sensible: brouillon.sensible,
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
  // RG-ACC-50 : niveau de verification d'identite (N0 a N3, voir le
  // commentaire de User.niveauVerification dans prisma/schema.prisma), a
  // afficher au professionnel dans le bandeau patient.
  niveauVerification: string;
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
  // RG-CLI-30 : vrai quand au moins une consultation "sensible" du patient
  // existe mais n'est pas dans derniersEvenements a cause de la restriction
  // de cet acces (urgence ou reference, RG-CLI-91) : l'ecran doit alors dire
  // explicitement que le resume n'est pas complet, plutot que de laisser
  // croire a un dossier sans historique sensible.
  elementsSensiblesMasques: boolean;
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
  | { source: "consentement"; typeAcces: string; niveauAcces: string; dateFin: Date | null }
  | { source: "reference"; referenceId: string; dateFinAcces: Date };

/**
 * Un consentement dont le niveau d'acces (F-CIT-10, RG-ACC-11) n'ouvre pas
 * les elements sensibles : "SUMMARY" et "FULL" (par opposition a
 * "FULL_SENSITIVE"). Absence de niveauAcces (anciennes lignes non migrees ou
 * fixtures de test) traitee comme "FULL_SENSITIVE", comportement d'origine
 * de ce module avant l'ajout des niveaux (voir migration
 * 20260928030000_niveau_acces_consentement, qui reclasse deja toutes les
 * lignes "dossier_complet" existantes ainsi).
 */
function niveauAccesRestreintAuxNonSensibles(niveauAcces: string | null | undefined): boolean {
  const niveau = niveauAcces ?? "FULL_SENSITIVE";
  return niveau === "SUMMARY" || niveau === "FULL";
}

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

  // Moindre privilege : un consentement etroit ("prescriptions", "examens",
  // "documents") ne donne acces qu'a son propre type de donnee, via le module
  // concerne. Il n'ouvre ni le resume ni l'historique du dossier.
  if (consentementValide && (TYPES_ACCES_LECTURE_DOSSIER as readonly string[]).includes(consentement.typeAcces)) {
    return {
      source: "consentement",
      typeAcces: consentement.typeAcces,
      niveauAcces: consentement.niveauAcces,
      dateFin: consentement.dateFin,
    };
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
 * - retourne null plutot que de filtrer partiellement). Le niveau d'acces du
 * consentement (F-CIT-10, RG-ACC-11 : SUMMARY/FULL/FULL_SENSITIVE) masque les
 * elements sensibles hors du niveau FULL_SENSITIVE, voir
 * niveauAccesRestreintAuxNonSensibles ci-dessus. Journalise la consultation
 * du resume (RG-CLI-31).
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

  // F-CIT-10 (RG-ACC-11) : en plus de l'urgence et de la reference, un
  // consentement normal de niveau SUMMARY ou FULL (par opposition a
  // FULL_SENSITIVE) masque aussi les elements sensibles.
  const accesRestreint =
    acces.source === "reference" ||
    acces.typeAcces === "urgence" ||
    niveauAccesRestreintAuxNonSensibles(acces.niveauAcces);

  // CA-1 (F-CLI-04, 10-fiches-clinique.md) : "avec une base SUMMARY, la
  // reponse de l'API ne contient AUCUNE consultation" - une exigence
  // distincte du filtrage par sensibilite ci-dessus, qui s'applique aussi
  // au niveau FULL (moins strict : consultations non sensibles visibles).
  // Corrige le 2026-09-28 : jusqu'ici seul getHistoriquePatient refusait
  // entierement l'acces pour SUMMARY, le resume affichait encore les 5
  // dernieres consultations non sensibles, violation directe de ce CA-1.
  const niveauSummarySeul = acces.source === "consentement" && acces.niveauAcces === "SUMMARY";

  const [prescriptionsActives, consultationsRecentes, consultationsMasquees] = await Promise.all([
    prisma.prescription.findMany({
      where: { patientId, statut: { in: ["validee", "delivree_partiellement"] } },
      include: {
        medecinPrescripteur: { include: { user: true } },
        lignes: { include: { medicament: true } },
      },
      orderBy: { date: "desc" },
    }),
    niveauSummarySeul
      ? Promise.resolve([])
      : prisma.consultation.findMany({
          where: {
            patientId,
            statut: "terminee",
            // RG-CLI-91 : un acces d'urgence ou via reference n'ouvre jamais une
            // consultation sensible (meme filtre que getHistoriquePatient).
            ...(accesRestreint ? { sensible: false } : {}),
          },
          include: { professionnel: { include: { user: true } } },
          orderBy: { date: "desc" },
          take: NOMBRE_DERNIERS_EVENEMENTS,
        }),
    // RG-CLI-30 : le resume doit dire explicitement qu'il est incomplet plutot
    // que de laisser croire a un dossier sans historique (sensible OU,
    // depuis ce correctif, simplement hors du niveau SUMMARY). Un simple
    // count, jamais le contenu des consultations exclues.
    niveauSummarySeul
      ? prisma.consultation.count({ where: { patientId, statut: "terminee" } })
      : accesRestreint
        ? prisma.consultation.count({ where: { patientId, statut: "terminee", sensible: true } })
        : Promise.resolve(0),
  ]);
  const elementsSensiblesMasques = consultationsMasquees;

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
    niveauVerification: patient.user.niveauVerification,
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
    elementsSensiblesMasques: elementsSensiblesMasques > 0,
  };
}

export type TypeEvenementHistorique =
  | "consultation"
  | "prescription"
  | "examen"
  | "suivi_communautaire"
  | "vaccination"
  | "document"
  | "delivrance";

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
 * validees, prescriptions, examens, visites de suivi communautaire,
 * vaccinations, documents medicaux et delivrances de medicaments, fusionnes
 * et tries du plus recent au plus ancien. Meme garde Zero Trust que
 * getResumePatient (Consentement actif requis, RG-CLI-30).
 *
 * Corrige le 2026-09-28 : l'affirmation "aucun modele de donnees dans ce
 * depot" pour les vaccinations et les documents medicaux etait perimee
 * (les deux existent, voir prisma/schema.prisma, Vaccination et
 * DocumentMedical) ; les deux sont desormais inclus, ainsi que les
 * delivrances de medicaments (Delivrance), absentes elles aussi jusqu'ici.
 *
 * Limite assumee, encore reelle : chaque type est charge en entier
 * (findMany sans filtre de periode/etablissement cote SQL) puis fusionne,
 * filtre et pagine en memoire (RG-ACC-05) ; pas de curseur. Voir aussi
 * getMesAccesDossier/ListeAccesDossier.tsx (F-CIT-12) pour la meme
 * simplification, deja acceptee dans ce depot pour un historique.
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

  // F-CIT-10 (CA-1, 10-fiches-clinique.md) : un consentement de niveau
  // SUMMARY n'ouvre que le resume (getResumePatient), jamais l'historique
  // complet. Aucune requete supplementaire n'est lancee, meme motif que
  // "acces" absent ci-dessus.
  if (acces.source === "consentement" && acces.niveauAcces === "SUMMARY") {
    return null;
  }

  const [consultations, prescriptions, examens, suivis, vaccinations, documents, delivrances] = await Promise.all([
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
    // patientId est nullable sur Vaccination (une PersonneCommunautaire peut
    // aussi etre vaccinee) : le filtre where exclut naturellement ce cas ici.
    prisma.vaccination.findMany({
      where: { patientId },
      include: { professionnel: { include: { user: true } }, etablissement: true },
    }),
    // DocumentMedical n'a pas d'etablissement propre : resolu via
    // auteur -> professionnel -> etablissement (medecin ou infirmier, voir
    // create:document_medical dans permissions.ts).
    prisma.documentMedical.findMany({
      where: { patientId },
      include: { auteur: { include: { professionnel: { include: { etablissement: true } } } } },
    }),
    // Delivrance n'a pas de patientId propre : atteinte via sa prescription.
    prisma.delivrance.findMany({
      where: { prescription: { patientId } },
      include: {
        pharmacien: { include: { user: true } },
        etablissement: true,
        lignes: { include: { lignePrescription: { include: { medicament: true } }, medicamentDelivre: true } },
      },
    }),
  ]);

  // RG-CLI-91 : un acces d'urgence "bris de glace" (F-CLI-10) ne donne jamais
  // acces aux examens ni aux consultations sensibles (ex. serologie VIH,
  // consultation dont le diagnostic principal est dans un groupe sensible),
  // exclus entierement de la chronologie plutot que masques partiellement.
  // Meme restriction pour un acces via reference (F-CLI-14) : ni l'un ni
  // l'autre n'est un consentement explicite et specifique du patient.
  const accesRestreint =
    acces.source === "reference" ||
    acces.typeAcces === "urgence" ||
    niveauAccesRestreintAuxNonSensibles(acces.niveauAcces);
  const examensAccessibles = accesRestreint ? examens.filter((e) => !e.sensible) : examens;
  const consultationsAccessibles = accesRestreint ? consultations.filter((c) => !c.sensible) : consultations;
  // Meme principe RG-CLI-91 applique a DocumentMedical.niveauConfidentialite :
  // un document "sensible" n'est jamais accessible via un acces d'urgence ou
  // une reference, meme principe que acces-documents.ts pour le
  // telechargement effectif (le detail depuis l'historique ne fait
  // qu'exposer les memes metadonnees, jamais le fichier lui-meme).
  const documentsAccessibles = accesRestreint
    ? documents.filter((d) => d.niveauConfidentialite !== "sensible")
    : documents;

  const tousLesEvenements: EvenementHistorique[] = [
    ...consultationsAccessibles.map((c): EvenementHistorique => ({
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
    ...vaccinations.map((v): EvenementHistorique => ({
      id: v.id,
      type: "vaccination",
      date: v.dateAdministration.toISOString(),
      titre: `Vaccination : ${v.vaccin}`,
      description: `Dose ${v.numeroDose}`,
      statut: v.saisieParErreur ? "retiree" : "administree",
      saisieParErreur: v.saisieParErreur,
      professionnelNomComplet: nomCompletProfessionnel(v.professionnel.user),
      etablissementId: v.etablissementId,
      etablissementNom: v.etablissement.nom,
      detailLignes: [
        `Vaccin : ${v.vaccin} (dose ${v.numeroDose})`,
        `Site d'injection : ${v.siteInjection}, voie : ${v.voie}`,
        v.lieu === "campagne" && v.nomCampagne ? `Campagne : ${v.nomCampagne}` : `Lieu : ${v.lieu}`,
        v.saisieParErreur && v.motifRetrait ? `Retiree (saisie par erreur) : ${v.motifRetrait}` : "",
      ].filter(Boolean),
    })),
    ...documentsAccessibles.map((d): EvenementHistorique => ({
      id: d.id,
      type: "document",
      date: d.dateDocument.toISOString(),
      titre: d.titre,
      description: d.nomFichierOriginal,
      statut: d.retirePourErreur ? "retiree" : null,
      saisieParErreur: d.retirePourErreur,
      professionnelNomComplet: nomComplet(d.auteur),
      etablissementId: d.auteur.professionnel?.etablissementId ?? "",
      etablissementNom: d.auteur.professionnel?.etablissement.nom ?? "Non precise",
      detailLignes: [
        `Type : ${d.type}`,
        `Fichier : ${d.nomFichierOriginal}`,
        d.retirePourErreur && d.motifRetrait ? `Retire (ajoute par erreur) : ${d.motifRetrait}` : "",
      ].filter(Boolean),
    })),
    ...delivrances.map((del): EvenementHistorique => ({
      id: del.id,
      type: "delivrance",
      date: del.date.toISOString(),
      titre: "Delivrance de medicaments",
      description: del.lignes
        .map((ligne) => ligne.medicamentDelivre?.nom ?? ligne.lignePrescription.medicament.nom)
        .join(", "),
      statut: del.annulee ? "annulee" : "delivree",
      saisieParErreur: false,
      professionnelNomComplet: nomCompletProfessionnel(del.pharmacien.user),
      etablissementId: del.etablissementId,
      etablissementNom: del.etablissement.nom,
      detailLignes: [
        ...del.lignes.map((ligne) => {
          const nomMedicament = ligne.medicamentDelivre?.nom ?? ligne.lignePrescription.medicament.nom;
          return ligne.quantiteDelivree > 0
            ? `${nomMedicament} : ${ligne.quantiteDelivree} delivre(s)`
            : `${nomMedicament} : non delivre${ligne.motifNonDelivrance ? ` (${ligne.motifNonDelivrance})` : ""}`;
        }),
        del.annulee && del.motifAnnulation ? `Delivrance annulee : ${del.motifAnnulation}` : "",
      ].filter(Boolean),
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
async function patientIdDeLElementDHistorique(type: string, id: string): Promise<string | null> {
  switch (type) {
    case "consultation":
      return (await prisma.consultation.findUnique({ where: { id }, select: { patientId: true } }))?.patientId ?? null;
    case "prescription":
      return (await prisma.prescription.findUnique({ where: { id }, select: { patientId: true } }))?.patientId ?? null;
    case "examen":
      return (await prisma.examenMedical.findUnique({ where: { id }, select: { patientId: true } }))?.patientId ?? null;
    case "suivi_communautaire":
      return (await prisma.suiviCommunautaire.findUnique({ where: { id }, select: { patientId: true } }))?.patientId ?? null;
    case "vaccination":
      return (await prisma.vaccination.findUnique({ where: { id }, select: { patientId: true } }))?.patientId ?? null;
    case "document":
      return (await prisma.documentMedical.findUnique({ where: { id }, select: { patientId: true } }))?.patientId ?? null;
    case "delivrance": {
      const delivrance = await prisma.delivrance.findUnique({
        where: { id },
        select: { prescription: { select: { patientId: true } } },
      });
      return delivrance?.prescription.patientId ?? null;
    }
    default:
      return null;
  }
}

/**
 * Trace l'ouverture du detail d'un element de l'historique (RG-CLI-80). Ecrit
 * seulement si l'element existe ET si l'appelant a une base d'acces valide sur
 * son patient : sinon n'importe quelle session pourrait fabriquer de fausses
 * lignes "detail ouvert" dans le "Qui a consulte mon dossier" d'un tiers.
 */
export async function journaliserOuvertureDetailHistoriqueAction(
  type: TypeEvenementHistorique,
  id: string
): Promise<void> {
  const session = await getSession();

  if (!session || typeof id !== "string" || id.length === 0 || id.length > 64) {
    return;
  }

  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return;
  }

  const patientId = await patientIdDeLElementDHistorique(type, id);

  if (!patientId || !(await accesPatientAutorise(patientId, professionnel, session.userId))) {
    return;
  }

  const cible = type === "examen" ? "examen_medical" : type === "document" ? "document_medical" : type;
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
    diagnosticPrincipalCode: consultation.diagnosticPrincipalCode,
    diagnosticPrincipalLibelle: consultation.diagnosticPrincipalLibelle,
    diagnosticPrincipalCertitude: consultation.diagnosticPrincipalCertitude,
    diagnosticsSecondaires: parseDiagnosticsSecondaires(consultation.diagnosticsSecondaires),
    sensible: consultation.sensible,
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
  const session = await getSession();

  // Seuls les soignants (medecin, infirmier) : un compte d'administration rattache
  // au meme etablissement n'a aucune raison de lire des constantes et des
  // conclusions nominatives.
  if (!session || !session.roles.some((role) => role === "infirmier" || role === "medecin")) {
    return [];
  }

  const professionnel = await prisma.professionnelSante.findUnique({ where: { userId: session.userId } });

  if (!professionnel) {
    return [];
  }

  // Lecture de donnees de sante nominatives sans consentement individuel : au
  // minimum, elle laisse une trace (RG-CLI-31, RG-ACC-60).
  await journaliser({
    utilisateurId: session.userId,
    action: "consultation_liste_etablissement",
    donneeConcernee: `etablissement:${professionnel.etablissementId}`,
    adresseTechnique: await adresseTechniqueCourante(),
    justification: "Liste des consultations validees de l'etablissement (suivi par un soignant).",
  });

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
    // Notes reservees du medecin : jamais renvoyees dans cette liste transversale.
    observations: "",
    conclusion: consultation.conclusion,
    diagnosticPrincipalCode: consultation.diagnosticPrincipalCode,
    diagnosticPrincipalLibelle: consultation.diagnosticPrincipalLibelle,
    diagnosticPrincipalCertitude: consultation.diagnosticPrincipalCertitude,
    diagnosticsSecondaires: parseDiagnosticsSecondaires(consultation.diagnosticsSecondaires),
    sensible: consultation.sensible,
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
 * enregistrement (RG-CLI-41) mais deviennent obligatoires pour valider, de
 * meme que le diagnostic principal codifie CIM-10 (RG-CLI-52, CA-1 du pack) :
 * un code fourni est toujours revalide aupres du referentiel
 * (administration/referentiel-cim10.ts), jamais son libelle ni son
 * caractere sensible ne sont crus sur parole du client. Un code du chapitre
 * symptomes (R00-R99) force la certitude "suspecte" (RG-CLI-52). Un
 * diagnostic principal dans un groupe sensible (VIH, IST, sante mentale...)
 * marque la consultation `sensible` (RG-CLI-53), fige au moment de
 * l'enregistrement du brouillon (jamais recalcule apres validation,
 * RG-CLI-00). La validation calcule l'empreinte SHA-256 du contenu
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
    diagnosticPrincipalCode: texte(formData, "diagnosticPrincipalCode"),
    diagnosticPrincipalCertitude: texte(formData, "diagnosticPrincipalCertitude"),
    diagnosticsSecondaires: texte(formData, "diagnosticsSecondaires"),
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
    diagnosticPrincipalCode,
    diagnosticPrincipalCertitude,
    diagnosticsSecondaires,
  } = validation.data;

  // RG-CLI-52/53 : le diagnostic principal est revalide aupres du referentiel
  // avant toute ecriture, brouillon ou validation - jamais un code fantaisiste
  // enregistre tel quel. Un code fourni mais introuvable/desactive est
  // toujours refuse (pas seulement a la validation) : mieux vaut le signaler
  // tout de suite que de laisser un brouillon reposer sur un code invalide.
  const diagnosticPrincipalCodeNettoye = diagnosticPrincipalCode.trim();
  let diagnosticPrincipal: DiagnosticCim10Valide | null = null;

  if (diagnosticPrincipalCodeNettoye.length > 0) {
    diagnosticPrincipal = await diagnosticCim10Valide(diagnosticPrincipalCodeNettoye);
    if (!diagnosticPrincipal) {
      return {
        error: "Ce diagnostic est introuvable ou desactive dans le referentiel. Choisissez-le depuis la recherche.",
        success: false,
      };
    }
  }

  const diagnosticPrincipalCertitudeFinale: "confirme" | "suspecte" | null = diagnosticPrincipal
    ? estChapitreSymptome(diagnosticPrincipal.code)
      ? "suspecte"
      : (CERTITUDES_DIAGNOSTIC as readonly string[]).includes(diagnosticPrincipalCertitude)
        ? (diagnosticPrincipalCertitude as "confirme" | "suspecte")
        : "confirme"
    : null;

  const codesSecondairesBruts = (() => {
    try {
      const donnees: unknown = JSON.parse(diagnosticsSecondaires);
      return Array.isArray(donnees) ? donnees.filter((c): c is string => typeof c === "string") : [];
    } catch {
      return [];
    }
  })();

  if (codesSecondairesBruts.length > MAXIMUM_DIAGNOSTICS_SECONDAIRES) {
    return { error: `${MAXIMUM_DIAGNOSTICS_SECONDAIRES} diagnostics secondaires au maximum.`, success: false };
  }

  const diagnosticsSecondairesValides: DiagnosticCim10Valide[] = [];
  for (const codeSecondaireBrut of codesSecondairesBruts) {
    const valide = await diagnosticCim10Valide(codeSecondaireBrut);
    if (!valide) {
      return {
        error: "Un des diagnostics secondaires est introuvable ou desactive dans le referentiel.",
        success: false,
      };
    }
    diagnosticsSecondairesValides.push(valide);
  }

  if (valider) {
    const champsManquants = [
      motif.trim().length === 0 ? "motif" : null,
      conclusion.trim().length === 0 ? "conclusion" : null,
      diagnosticPrincipal === null ? "diagnostic principal (CIM-10)" : null,
    ].filter((champ): champ is string => champ !== null);

    if (champsManquants.length > 0) {
      return {
        error: `Impossible de valider : renseignez ${champsManquants.join(", ")}.`,
        success: false,
      };
    }
  }

  // F-ADM-03 : si l'interrupteur est actif, seul un numero d'Ordre verifie valide (le brouillon reste libre).
  if (valider && !(await professionnelValide(session.userId))) {
    return { error: MESSAGE_ORDRE_NON_VERIFIE, success: false };
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
    if (poidsKg !== undefined) {
      controles.push(controlerPoids(poidsKg));

      // F-CLI-06 : alerte si le poids varie de plus de 10% par rapport a la
      // derniere mesure de moins de 30 jours. Lecture separee de
      // controlerPoids (module pur, pas d'acces base) : cherche la consultation
      // la plus recente de CE patient avec un poids renseigne dans les 30
      // derniers jours (n'importe quel professionnel, meme principe que le
      // reste de l'historique clinique du patient).
      const ilYA30Jours = new Date(dateReference.getTime() - 30 * 24 * 60 * 60 * 1000);
      const derniereMesurePoids = await prisma.consultation.findFirst({
        where: {
          patientId,
          // Exclut ce brouillon lui-meme : une correction de saisie (poids
          // deja enregistre puis modifie sur le meme brouillon) n'est pas une
          // "derniere mesure" anterieure, juste la meme mesure corrigee.
          ...(consultationId ? { id: { not: consultationId } } : {}),
          poidsKg: { not: null },
          date: { gte: ilYA30Jours, lte: dateReference },
        },
        orderBy: { date: "desc" },
        select: { poidsKg: true },
      });
      controles.push(controlerVariationPoids(poidsKg, derniereMesurePoids?.poidsKg ?? null));
    }
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

    // F-CLI-10 / base B5 (RG-ACC-15) : un acces d'urgence "bris de glace" en
    // cours (Consentement.typeAcces = "urgence", src/modules/urgence/actions.ts)
    // donne lui seul le droit d'ecrire une consultation, sans consentement
    // ordinaire ni rendez-vous/arrivee (B3/B4 ci-dessous) : c'est precisement
    // le cas d'usage de l'acces d'urgence, un patient hors d'etat de
    // consentir. Deja limite dans le temps (4 h), quotidiennement plafonne et
    // integralement journalise par le module urgence : aucune verification
    // supplementaire necessaire ici.
    const accesUrgence = consentement?.typeAcces === "urgence";

    const consentementValide =
      consentement !== null &&
      consentement.statut === "actif" &&
      (consentement.dateFin === null || consentement.dateFin > new Date()) &&
      ((TYPES_ACCES_CONSULTATION as readonly string[]).includes(consentement.typeAcces) || accesUrgence);

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
      diagnosticPrincipalCode: diagnosticPrincipal?.code ?? null,
      diagnosticPrincipalLibelle: diagnosticPrincipal?.libelle ?? null,
      diagnosticPrincipalCertitude: diagnosticPrincipalCertitudeFinale,
      diagnosticsSecondaires: JSON.stringify(
        diagnosticsSecondairesValides.map((diagnostic) => ({ code: diagnostic.code, libelle: diagnostic.libelle }))
      ),
      // RG-CLI-53 : fige a chaque enregistrement de brouillon sur l'etat
      // ACTUEL du diagnostic principal ; une consultation validee (RG-CLI-00)
      // n'est plus jamais reecrite, donc jamais recalculee ensuite.
      sensible: diagnosticPrincipal?.sensible ?? false,
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

        // Le patient du formulaire est celui dont le consentement vient d'etre
        // verifie : le brouillon doit etre le sien, sinon on signerait la
        // consultation d'un patient A avec le consentement d'un patient B.
        if (!existante || existante.professionnelId !== professionnel.id || existante.patientId !== patientId) {
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
          // RG-ACC-15 (docs/pack claude/specs/05-acces-consentement.md) : un
          // consentement ORDINAIRE (verifie plus haut) ne donne jamais lui
          // seul le droit d'ECRIRE une consultation. Il faut en plus, au
          // moment de la CREATION seulement (un brouillon deja ouvert reste
          // modifiable ensuite, base B7 "auteur") : soit un contexte de soins
          // B4 (le patient est arrive dans cet etablissement, heureArrivee
          // posee, fenetre de 72 h, n'importe quel clinicien de
          // l'etablissement), soit un rendez-vous confirme du jour avec CE
          // professionnel precis, SOIT un acces d'urgence actif (base B5,
          // F-CLI-10) qui suffit seul, sans aucune des deux verifications
          // suivantes. Verification de presence par QR/SMS/piece (RG-ACC-20)
          // non modelisee dans ce depot : meme simplification assumee que
          // F-RDV-04 (heureArrivee seul fait foi).
          const seuilContexteSoins = new Date(dateReference.getTime() - DUREE_CONTEXTE_SOINS_HEURES * 60 * 60 * 1000);
          const { debut: debutJour, fin: finJour } = bornesJourneeBenin(dateReference);

          const baseEcritureValide =
            accesUrgence ||
            (await tx.rendezVous.findFirst({
              where: {
                patientId,
                OR: [
                  {
                    etablissementId: professionnel.etablissementId,
                    statut: { in: [...STATUTS_ACTIFS] },
                    heureArrivee: { gte: seuilContexteSoins },
                  },
                  {
                    professionnelId: professionnel.id,
                    statut: "confirme",
                    date: { gte: debutJour, lt: finJour },
                  },
                ],
              },
            }));

          if (!baseEcritureValide) {
            throw new Error("BASE_ACCES_ECRITURE_ABSENTE");
          }

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

          // F-RDV-05 : le rendez-vous lie passe "en consultation" (IN_CARE du pack), sans jamais bloquer le brouillon.
          if (rendezVousIdValide) {
            await transitionnerRendezVous(tx, rendezVousIdValide, "demarrer_consultation");
          }

          cible = consultationCreee;
        }
      }

      if (!valider) {
        return cible.id;
      }

      // F-CLI-07, etape 3 (docs/pack claude/specs/10-fiches-clinique.md) :
      // aucune ordonnance liee ne doit rester un "brouillon d'ordonnance
      // orphelin" au moment de la validation, seulement signee (validee,
      // delivree partiellement ou totalement) ou abandonnee (annulee,
      // arretee). Dans ce depot, prescription/actions.ts cree toujours une
      // Prescription directement au statut "validee" (Phase 5, voir
      // prescription/actions.ts) : le statut "creee" (brouillon) n'est
      // atteint par aucune voie d'ecriture actuelle, donc cette verification
      // ne trouve normalement jamais rien. Elle reste une garde defensive
      // fidele au pack, utile si une future evolution introduit un vrai
      // brouillon d'ordonnance : mieux vaut bloquer la signature de la
      // consultation que de la laisser verrouillee derriere une ordonnance
      // incomplete.
      const ordonnanceOrpheline = await tx.prescription.findFirst({
        where: { consultationId: cible.id, statut: "creee" },
        select: { id: true },
      });

      if (ordonnanceOrpheline) {
        throw new Error("ORDONNANCE_ORPHELINE");
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
        // Un rendez-vous deja annule ou termine reste tel quel : la signature
        // d'un acte clinique n'est jamais bloquee par l'etat administratif.
        await transitionnerRendezVous(tx, cible.rendezVousId, "terminer");
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

    // F-CLI-07 du pack : le patient doit etre notifie a la validation de sa
    // consultation, manquait entierement avant ce correctif (seul le
    // rendez-vous change d'etat, aucune notification). Hors transaction (une
    // notification manquee ne doit jamais defaire une signature deja actee
    // en base) ; destinataireNotificationPatient route vers le tuteur si le
    // patient est une personne a charge (sans_compte), meme principe deja
    // applique dans prescription/actions.ts et laboratoire/actions.ts.
    if (valider) {
      await creerNotification(
        await destinataireNotificationPatient(patientId),
        "consultation",
        "Une consultation a ete finalisee dans votre dossier.",
        "/app/patient/dossier"
      );
    }

    return { error: null, success: true, consultationId: idFinal, valide: valider };
  } catch (erreur) {
    if (erreur instanceof Error && erreur.message === "CONSULTATION_INTROUVABLE") {
      return { error: "Cette consultation est introuvable.", success: false };
    }
    if (erreur instanceof Error && erreur.message === "CONSULTATION_DEJA_VALIDEE") {
      return { error: "Cette consultation est deja validee et ne peut plus etre modifiee.", success: false };
    }
    if (erreur instanceof Error && erreur.message === "ORDONNANCE_ORPHELINE") {
      return {
        error:
          "Impossible de valider : une ordonnance liee a cette consultation est encore un brouillon non finalise. Signez-la ou abandonnez-la avant de valider.",
        success: false,
      };
    }
    if (erreur instanceof Error && erreur.message === "BASE_ACCES_ECRITURE_ABSENTE") {
      return {
        error:
          "Un consentement seul ne permet pas de creer une consultation : il faut que le patient soit arrive dans l'etablissement, ou un rendez-vous confirme aujourd'hui avec vous.",
        success: false,
      };
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
 * verifie en base, jamais suppose depuis le role seul).
 *
 * RG-CLI-70 du pack, texte exact : "Addendum et retrait sont possibles
 * pendant 12 mois apres la validation ; ensuite, seul un addendum de
 * l'auteur ou du responsable medical designe est possible." Corrige le
 * 2026-09-28 : cette fonction bloquait a tort l'addendum de l'AUTEUR
 * au-dela de 12 mois (seul le retrait doit s'arreter pour de bon a cette
 * echeance, voir retirerConsultationAction plus bas). "Responsable medical
 * designe" : aucun role ni designation de ce type n'existe dans ce depot
 * (limite assumee, chantier d'architecture a part) ; seul le cas de
 * l'auteur, couvert par ce correctif, est implemente.
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

    if (!consultation.dateValidation) {
      // Etat incoherent (une consultation "terminee" a toujours une date de
      // validation) : jamais suppose, refuse plutot que d'ecrire un addendum
      // sur une consultation dont la validation n'est pas confirmee en base.
      return { error: "Cette consultation est introuvable.", success: false };
    }

    // RG-CLI-70 : plus de fenetre de 12 mois ici, seulement pour le retrait
    // (voir retirerConsultationAction) - l'auteur peut ajouter un addendum
    // sans limite de temps, texte exact du pack (voir le commentaire en tete
    // de cette fonction).

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

/** Libelle utilisateur d'un motif d'echec de re-authentification (RG-AUTH-53), pour le retrait de consultation. */
function messageEchecReauthentificationRetrait(motif: MotifEchecReauthentification): string {
  switch (motif) {
    case "compte_introuvable":
    case "mot_de_passe_incorrect":
      return "Mot de passe incorrect.";
    case "code_mfa_requis":
      return "Le code de votre application d'authentification (ou un code de secours) est obligatoire.";
    case "code_mfa_incorrect":
      return "Code de double authentification incorrect.";
  }
}

/**
 * Retire une consultation saisie par erreur (F-CLI-08 du pack, "entered in
 * error") : reserve au cas d'une consultation enregistree sur le mauvais
 * patient. La consultation n'est jamais supprimee, seulement marquee comme
 * retiree (elle reste visible, barree a l'ecran, et exclue des
 * statistiques). Exige une re-authentification (mot de passe, et code MFA en
 * plus si actif sur ce compte, RG-AUTH-53), sauf fenetre de grace de 5
 * minutes deja ouverte pour un autre acte sensible (identity/reauthentification.ts,
 * corrige le 2026-09-28 : mot de passe seul et toujours redemande
 * auparavant) ; 3 echecs deconnectent la session, meme regle que la
 * signature d'ordonnance (F-PRE-04), RG-AUTH-53 etant deja explicitement
 * nommee ici avant ce correctif. Reserve a l'auteur de la consultation, dans
 * la fenetre de 12 mois suivant la consultation (RG-CLI-70) : a la
 * difference de l'addendum (voir ajouterAddendumConsultationAction),
 * strictement 12 mois pour tous, aucune exception, texte exact du pack.
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
    codeMfa: texte(formData, "codeMfa"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de retrait invalides."),
      success: false,
    };
  }

  const { consultationId, motif, motDePasse, codeMfa } = validation.data;

  try {
    if (reauthentificationBloquee(session.userId)) {
      await destroySession();
      return {
        error: "Trop d'echecs de re-authentification. Vous avez ete deconnecte, veuillez vous reconnecter.",
        success: false,
      };
    }

    if (!reauthentificationRecente(session.userId)) {
      if (motDePasse.length === 0) {
        return { error: "Votre mot de passe est obligatoire pour confirmer.", success: false };
      }

      const resultatReauth = await motDePasseEtCodeMfaValides(session.userId, motDePasse, codeMfa);

      if (!resultatReauth.valide) {
        const troisiemeEchec = enregistrerEchecReauthentification(session.userId);

        if (troisiemeEchec) {
          await destroySession();
          return {
            error: "Trop d'echecs de re-authentification. Vous avez ete deconnecte, veuillez vous reconnecter.",
            success: false,
          };
        }

        return { error: messageEchecReauthentificationRetrait(resultatReauth.motif), success: false };
      }

      enregistrerReauthentificationReussie(session.userId);
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
      const { creerNotification } = await import("@/modules/notification/creer");
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
