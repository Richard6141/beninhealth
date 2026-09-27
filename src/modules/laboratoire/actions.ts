"use server";

/**
 * Server Actions du module laboratoire : demande et resultat d'examens
 * medicaux. Contrat d'integration Phase 8, consomme par les ecrans
 * src/app/app/patient/**, src/app/app/medecin/** et src/app/app/laboratoire/**
 * (autres agents).
 *
 * Meme principe applique de bout en bout que src/modules/clinical/actions.ts
 * et src/modules/prescription/actions.ts : Zero Trust. Le patient ou le
 * professionnel courant est toujours derive de getSession(), jamais d'un id
 * transmis par le client dans un formulaire. Regle metier centrale de ce
 * module : un professionnel ne peut demander un examen medical pour un
 * patient que si ce patient lui a accorde un Consentement actif
 * ("dossier_complet" ou "examens"), verifie ici en base avant toute
 * ecriture, jamais suppose. Cote laboratoire, un professionnel ne peut saisir
 * un resultat que pour un examen assigne a l'etablissement auquel il est
 * rattache (meme verification de propriete/rattachement, jamais confiance en
 * l'id transmis). Toute creation ou modification d'examen est tracee dans
 * JournalAudit.
 *
 * F-LAB-04 du pack (principe des quatre yeux, RG-ROL-30) : un resultat saisi
 * ("resultat_saisi") doit etre valide par un second professionnel avant de
 * devenir visible en dehors du laboratoire ("termine", RG-LAB-30). Ce depot
 * n'a pas de role LAB_SUPERVISOR distinct : la validation est ouverte a tout
 * professionnel du role laboratoire de ce meme etablissement, autre que celui
 * ayant saisi le resultat (quatre yeux entre pairs, pas une hierarchie
 * superviseur/technicien). La re-authentification exigee par le pack (si
 * derniere connexion de plus de 5 minutes) est remplacee par une re-saisie
 * systematique du mot de passe a chaque validation, ce depot ne tracant pas
 * d'horodatage de derniere authentification au niveau de la session (voir
 * validerResultatExamenAction, meme pattern que retirerConsultationAction
 * dans src/modules/clinical/actions.ts).
 */

import { headers } from "next/headers";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { estExamenSensible } from "./referentiel-examens-sensibles";
import {
  ageEnMois,
  parametresPourExamen,
  evaluerParametre,
  valeurPhysiologiquementPossible,
  type Sexe,
  type Indicateur,
} from "./referentiel-parametres-examens";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification, type OptionsNotification } from "@/modules/notification/creer";
import { estCollisionUnicite, genererNumeroExamen } from "./numero-examen";
import { construireAnterieurs } from "./anterieurs";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { MESSAGE_MODULE_INACTIF } from "@/modules/administration/modules-actifs";

/** Une valeur de parametre structure saisie et son indicateur calcule (F-LAB-03). Snapshot autonome, stocke tel quel dans ExamenMedical.resultatsParametres : jamais recalcule depuis le referentiel a l'affichage, pour rester stable si le referentiel change. */
export interface ResultatParametre {
  code: string;
  libelle: string;
  unite: string;
  valeur: number;
  indicateur: Indicateur;
  /** Patient de moins de 15 ans evalue avec la plage adulte faute de valeur pediatrique sourcee : a interpreter par le medecin. */
  referenceAdulteParDefaut?: boolean;
}

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface LaboratoireActionState {
  error: string | null;
  success: boolean;
}

/** Etablissement de type laboratoire, tel que propose dans un selecteur de demande d'examen. */
export interface LaboratoireOption {
  id: string;
  nom: string;
  localisation: string;
}

/** Resume d'un examen medical, pret a afficher cote ecran patient, medecin ou laboratoire. */
export interface ExamenResume {
  id: string;
  // F-LAB-01 : numero de demande LB-XXXX-XXXX, null pour un examen cree avant
  // l'introduction de cette colonne.
  numero: string | null;
  typeExamen: string;
  date: string; // ISO
  statut: string;
  resultat: string | null;
  // F-LAB-03 du pack : renseigne uniquement pour le perimetre reduit
  // d'examens quantitatifs couvert par referentiel-parametres-examens.ts,
  // null sinon (resultat en texte libre uniquement, comportement inchange).
  resultatsParametres: ResultatParametre[] | null;
  dateResultat: string | null; // ISO ou null
  patientNomComplet: string | null; // rempli cote medecin/laboratoire
  patientIdentifiantSante: string | null; // rempli cote medecin/laboratoire
  demandeurNomComplet: string | null; // rempli cote patient/laboratoire ("Dr. Prenom Nom")
  laboratoireNom: string; // toujours rempli
  // F-LAB-01/02/05 du pack : un examen sensible (ex. serologie VIH) a son
  // resultat masque au patient tant que resultatAnnonceAuPatient est faux
  // (voir getMesExamens et annoncerResultatExamenAction ci-dessous).
  sensible: boolean;
  resultatAnnonceAuPatient: boolean;
  // F-LAB-04 du pack (principe des quatre yeux) : ces quatre champs ne sont
  // renseignes que pour une lecture cote laboratoire (getExamensPourLaboratoire),
  // null pour les lectures medecin/patient qui n'ont pas a connaitre
  // l'identite des professionnels du laboratoire ni le motif d'un renvoi.
  saisiParId: string | null;
  saisiParNomComplet: string | null;
  valideParNomComplet: string | null;
  commentaireValidation: string | null;
  // F-LAB-02 du pack : etape de prelevement, visible cote patient/medecin
  // aussi (rien de sensible ici, contrairement aux quatre champs ci-dessus).
  identiteVerifiee: boolean;
  datePrelevement: string | null; // ISO ou null
  typeEchantillon: string | null;
  identifiantEchantillon: string | null;
  motifRejetEchantillon: string | null;
  // F-LAB-01 du pack : renseignes a la demande, visibles cote patient/medecin/
  // laboratoire (rien de sensible ici, comme le prelevement ci-dessus).
  niveauUrgence: string; // "normal" | "urgent"
  aJeunRequis: boolean;
  // F-LAB-04 / RG-ROL-31 : numero de la version courante du resultat (1 tant
  // qu'aucune correction d'un resultat valide n'a eu lieu), visible de tous.
  versionResultat: number;
  // Versions validees remplacees par une correction (motif compris). Renseigne
  // uniquement pour une lecture cote laboratoire, null ailleurs : le medecin et
  // le patient voient la version courante, jamais l'historique interne.
  versionsPrecedentes: VersionPrecedenteResume[] | null;
  // F-LAB-04 : antecedents du meme patient pour le meme examen dans ce
  // laboratoire (resultats valides plus anciens, les plus recents d'abord).
  // Renseigne uniquement pour une lecture cote laboratoire, null ailleurs.
  anterieurs: AnterieurResultatResume[] | null;
}

/** Un resultat valide plus ancien du meme patient pour le meme examen, dans le meme laboratoire (F-LAB-04). */
export interface AnterieurResultatResume {
  date: string; // ISO, date de la demande
  resultat: string | null;
}

/** Nombre maximal d'antecedents affiches sur l'ecran de validation (non exporte : fichier "use server"). */
const NOMBRE_MAX_ANTERIEURS = 3;

/** Une version validee remplacee par une correction (RG-ROL-31), lecture laboratoire. */
export interface VersionPrecedenteResume {
  numero: number;
  resultat: string | null;
  motifCorrection: string;
  dateCorrection: string; // ISO
}

/** Types d'acces de consentement autorisant un professionnel a demander un examen. */
const TYPES_ACCES_EXAMEN = ["dossier_complet", "examens"] as const;

/**
 * Statuts consideres comme "en attente de traitement" cote laboratoire,
 * prioritaires dans la file : couvre aussi bien un examen pas encore traite
 * qu'un resultat en attente de validation ou renvoye pour correction
 * (F-LAB-04), seul un resultat "termine" ou "annule" quitte la file active.
 */
const STATUTS_EN_ATTENTE_LABORATOIRE = [
  "demande",
  "en_cours",
  "resultat_saisi",
  "correction_demandee",
] as const;

/** Statuts a partir desquels un resultat peut etre saisi ou resaisi (RG-ROL-31 : une resaisie apres correction reste une saisie, pas une modification silencieuse d'un resultat deja soumis). */
const STATUTS_SAISIE_AUTORISEE = ["demande", "en_cours", "correction_demandee"] as const;

/**
 * Statuts a partir desquels une demande d'examen peut encore etre annulee
 * (F-LAB-06) : uniquement avant qu'un resultat, meme provisoire, n'existe.
 * "correction_demandee" est exclu expres : `examen.resultat` y conserve
 * encore l'ancienne valeur saisie (voir renvoyerPourCorrectionAction), donc
 * annuler a ce stade ferait disparaitre une donnee de resultat deja produite.
 */
const STATUTS_ANNULATION_AUTORISEE = ["demande", "en_cours"] as const;

const NIVEAUX_URGENCE_EXAMEN = ["normal", "urgent"] as const;

const schemaDemandeExamen = z.object({
  patientId: z.string().trim().min(1, "Le patient est obligatoire."),
  consultationId: z.string().trim().optional().default(""),
  laboratoireId: z.string().trim().min(1, "Le laboratoire est obligatoire."),
  typeExamen: z.string().trim().min(1, "Le type d'examen est obligatoire."),
  // F-LAB-01 du pack. "normal" par defaut si le champ est absent (formulaire
  // non mis a jour, ou soumission directe), jamais bloquant.
  niveauUrgence: z
    .enum(NIVEAUX_URGENCE_EXAMEN, { message: "Le niveau d'urgence est invalide." })
    .optional()
    .default("normal"),
  aJeunRequis: z.coerce.boolean().optional().default(false),
});

const schemaSaisieResultat = z.object({
  examenId: z.string().trim().min(1, "L'examen est obligatoire."),
  // L'un ou l'autre selon que l'examen fait partie du perimetre structure
  // (referentiel-parametres-examens.ts) : resultat en texte libre, ou
  // parametresJson (tableau JSON [{ code, valeur }], valeur en texte pour
  // tolerer un champ de saisie HTML standard).
  resultat: z.string().trim().optional().default(""),
  parametresJson: z.string().trim().optional().default(""),
});

const schemaAnnonceResultat = z.object({
  examenId: z.string().trim().min(1, "L'examen est obligatoire."),
});

const schemaAnnulationExamen = z.object({
  examenId: z.string().trim().min(1, "L'examen est obligatoire."),
  motif: z
    .string()
    .trim()
    .min(5, "Le motif d'annulation est obligatoire (5 caracteres minimum).")
    .max(300, "Le motif ne peut pas depasser 300 caracteres."),
});

const schemaValidationResultat = z.object({
  examenId: z.string().trim().min(1, "L'examen est obligatoire."),
  motDePasse: z.string().min(1, "Votre mot de passe est obligatoire pour confirmer."),
});

const schemaCorrectionResultat = z.object({
  examenId: z.string().trim().min(1, "L'examen est obligatoire."),
  commentaire: z.string().trim().min(1, "Le motif du renvoi pour correction est obligatoire."),
});

const schemaCorrectionResultatValide = z.object({
  examenId: z.string().trim().min(1, "L'examen est obligatoire."),
  motif: z
    .string()
    .trim()
    .min(10, "Le motif de la correction est obligatoire (10 caracteres minimum).")
    .max(500, "Le motif ne peut pas depasser 500 caracteres."),
  motDePasse: z.string().min(1, "Votre mot de passe est obligatoire pour confirmer."),
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

/**
 * Notifie chaque professionnel du role laboratoire rattache a ce laboratoire.
 * Non exportee : dans un fichier "use server", une fonction exportee est un
 * point d'entree atteignable, or celle-ci n'a aucun controle de session (le
 * laboratoire cible est determine par l'appelant a partir de donnees deja
 * verifiees).
 */
async function notifierPersonnelLaboratoire(
  laboratoireId: string,
  type: string,
  message: string,
  lien: string,
  options?: OptionsNotification
): Promise<void> {
  const personnel = await prisma.professionnelSante.findMany({
    where: { etablissementId: laboratoireId, user: { roles: { some: { nom: "laboratoire" } } } },
    select: { userId: true },
  });
  await Promise.all(personnel.map((membre) => creerNotification(membre.userId, type, message, lien, options)));
}

/**
 * F-ADM-07 : le module laboratoire peut etre retire par l'administration
 * nationale (fonctionnalite lab.module, relue en base a chaque appel, RG-ADM-50).
 * Non exportee : dans un fichier "use server", une fonction exportee est un point
 * d'entree. Les lectures et l'annulation d'une demande restent possibles.
 */
async function refuserSiModuleLaboratoireInactif(): Promise<LaboratoireActionState | null> {
  return (await estFonctionnaliteActive("lab.module")) ? null : { error: MESSAGE_MODULE_INACTIF, success: false };
}

/** Nom complet d'un utilisateur, sans prefixe. */
function nomComplet(utilisateur: { nom: string; prenom: string }): string {
  return `${utilisateur.prenom} ${utilisateur.nom}`;
}

/** Nom complet d'un professionnel de sante, prefixe de "Dr." (meme convention que les autres modules). */
function nomCompletProfessionnel(utilisateur: { nom: string; prenom: string }): string {
  return `Dr. ${utilisateur.prenom} ${utilisateur.nom}`;
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
 * Identifiant ProfessionnelSante du titulaire de la session courante, utilise
 * cote ecran (F-LAB-04) pour masquer des l'affichage le bouton "Valider" sur
 * un resultat que le professionnel connecte a lui-meme saisi. Le controle
 * serveur dans validerResultatExamenAction reste la seule autorite Zero
 * Trust ; ce masquage cote client n'est qu'un confort d'interface.
 */
export async function getIdProfessionnelCourant(): Promise<string | null> {
  const professionnel = await professionnelDeLaSessionCourante();
  return professionnel ? professionnel.id : null;
}

/**
 * Empreinte SHA-256 du resultat au moment de la validation (F-LAB-04), meme
 * principe que calculerEmpreinteConsultation dans
 * src/modules/clinical/actions.ts : cles triees, format stable, reproductible
 * a partir des memes donnees.
 */
function calculerEmpreinteResultat(champs: {
  examenId: string;
  resultat: string;
  // F-LAB-03 : inclus dans l'empreinte pour que la garantie d'integrite
  // (F-LAB-04) couvre aussi un resultat structure, jamais seulement le
  // resume texte genere a partir de lui.
  resultatsParametres: ResultatParametre[] | null;
  saisiParId: string;
}): string {
  const contenuCanonique = JSON.stringify(champs, Object.keys(champs).sort());
  return createHash("sha256").update(contenuCanonique).digest("hex");
}

/** Met en forme un examen medical (avec patient/demandeur/laboratoire selon besoin) en ExamenResume. */
function versExamenResume(
  examen: {
    id: string;
    numero: string | null;
    typeExamen: string;
    date: Date;
    statut: string;
    resultat: string | null;
    resultatsParametres: unknown;
    dateResultat: Date | null;
    laboratoire: { nom: string };
    sensible: boolean;
    resultatAnnonceAuPatient: boolean;
    identiteVerifiee: boolean;
    datePrelevement: Date | null;
    typeEchantillon: string | null;
    identifiantEchantillon: string | null;
    motifRejetEchantillon: string | null;
    niveauUrgence: string;
    aJeunRequis: boolean;
    versionResultat: number;
  },
  options: {
    patientNomComplet: string | null;
    patientIdentifiantSante: string | null;
    demandeurNomComplet: string | null;
    /** F-LAB-04, ne renseigner que depuis getExamensPourLaboratoire. */
    saisiParId?: string | null;
    saisiParNomComplet?: string | null;
    valideParNomComplet?: string | null;
    commentaireValidation?: string | null;
    versionsPrecedentes?: VersionPrecedenteResume[] | null;
    anterieurs?: AnterieurResultatResume[] | null;
  }
): ExamenResume {
  return {
    id: examen.id,
    numero: examen.numero,
    typeExamen: examen.typeExamen,
    date: examen.date.toISOString(),
    statut: examen.statut,
    resultat: examen.resultat,
    resultatsParametres: (examen.resultatsParametres as ResultatParametre[] | null) ?? null,
    dateResultat: examen.dateResultat ? examen.dateResultat.toISOString() : null,
    patientNomComplet: options.patientNomComplet,
    patientIdentifiantSante: options.patientIdentifiantSante,
    demandeurNomComplet: options.demandeurNomComplet,
    laboratoireNom: examen.laboratoire.nom,
    sensible: examen.sensible,
    resultatAnnonceAuPatient: examen.resultatAnnonceAuPatient,
    saisiParId: options.saisiParId ?? null,
    saisiParNomComplet: options.saisiParNomComplet ?? null,
    valideParNomComplet: options.valideParNomComplet ?? null,
    commentaireValidation: options.commentaireValidation ?? null,
    identiteVerifiee: examen.identiteVerifiee,
    datePrelevement: examen.datePrelevement ? examen.datePrelevement.toISOString() : null,
    typeEchantillon: examen.typeEchantillon,
    identifiantEchantillon: examen.identifiantEchantillon,
    motifRejetEchantillon: examen.motifRejetEchantillon,
    niveauUrgence: examen.niveauUrgence,
    aJeunRequis: examen.aJeunRequis,
    versionResultat: examen.versionResultat,
    versionsPrecedentes: options.versionsPrecedentes ?? null,
    anterieurs: options.anterieurs ?? null,
  };
}

/** Liste tous les etablissements sanitaires de type "laboratoire", tries par nom. */
export async function listLaboratoires(): Promise<LaboratoireOption[]> {
  const laboratoires = await prisma.etablissementSanitaire.findMany({
    where: { type: "laboratoire" },
    orderBy: { nom: "asc" },
  });

  return laboratoires.map((laboratoire) => ({
    id: laboratoire.id,
    nom: laboratoire.nom,
    localisation: laboratoire.localisation,
  }));
}

/**
 * Resout le patient d'une consultation pour pre-selectionner le bon patient
 * a l'ecran "Demander un examen" quand on y arrive depuis le lien "Demander
 * un examen" d'une consultation (Zero Trust : verifie que la consultation
 * appartient bien au professionnel connecte, jamais suppose valide).
 */
export async function getConsultationPourExamen(
  consultationId: string
): Promise<{ patientId: string; patientNomComplet: string; motif: string } | null> {
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
    include: { patient: { include: { user: true } } },
  });

  if (!consultation || consultation.professionnelId !== professionnel.id) {
    return null;
  }

  return {
    patientId: consultation.patientId,
    patientNomComplet: nomComplet(consultation.patient.user),
    motif: consultation.motif,
  };
}

/**
 * Demande un examen medical a l'initiative du professionnel connecte
 * (derive de getSession(), jamais d'un id transmis par le client), pour un
 * patient identifie par patientId (Zero Trust : verifie systematiquement,
 * jamais suppose valide). Verification obligatoire avant toute ecriture : un
 * Consentement actif (dossier_complet ou examens) doit exister pour
 * (patientId, acteurAutoriseId = professionnel connecte). Verifie egalement
 * que le laboratoire cible existe et est bien de type "laboratoire". Si un
 * consultationId est fourni, verifie qu'il appartient bien a ce patient et a
 * ce professionnel. Cree l'ExamenMedical (statut "demande") et trace la
 * creation dans JournalAudit.
 */
export async function demanderExamenAction(
  prevState: LaboratoireActionState,
  formData: FormData
): Promise<LaboratoireActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  // RBAC (voir src/security/permissions.ts) : demander un examen est reserve
  // au role medecin. Posseder un profil ProfessionnelSante ne suffit pas.
  if (!session.roles.some((role) => can(role, "create", "examen_medical"))) {
    return { error: "Action reservee aux medecins.", success: false };
  }

  const moduleInactif = await refuserSiModuleLaboratoireInactif();
  if (moduleInactif) return moduleInactif;

  const validation = schemaDemandeExamen.safeParse({
    patientId: texte(formData, "patientId"),
    consultationId: texte(formData, "consultationId"),
    laboratoireId: texte(formData, "laboratoireId"),
    typeExamen: texte(formData, "typeExamen"),
    // texte() renvoie toujours une chaine (jamais undefined) : "" ne
    // declencherait pas le .default() de zod (reserve a undefined), d'ou ce
    // repli explicite plutot qu'un refus surprenant si le champ est absent.
    niveauUrgence: texte(formData, "niveauUrgence") || "normal",
    aJeunRequis: texte(formData, "aJeunRequis"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de demande d'examen invalides."),
      success: false,
    };
  }

  const { patientId, consultationId, laboratoireId, typeExamen, niveauUrgence, aJeunRequis } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
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
      (TYPES_ACCES_EXAMEN as readonly string[]).includes(consentement.typeAcces);

    if (!consentementValide) {
      return { error: "Aucun consentement actif pour ce patient.", success: false };
    }

    const laboratoire = await prisma.etablissementSanitaire.findUnique({
      where: { id: laboratoireId },
    });

    if (!laboratoire || laboratoire.type !== "laboratoire") {
      return { error: "Ce laboratoire est introuvable.", success: false };
    }

    const consultationIdNettoye = consultationId.trim();
    let consultationIdValide: string | null = null;

    if (consultationIdNettoye.length > 0) {
      const consultation = await prisma.consultation.findUnique({
        where: { id: consultationIdNettoye },
      });

      if (
        !consultation ||
        consultation.patientId !== patientId ||
        consultation.professionnelId !== professionnel.id
      ) {
        return { error: "Cette consultation est introuvable.", success: false };
      }

      consultationIdValide = consultation.id;
    }

    const adresseTechnique = await adresseTechniqueCourante();

    // F-LAB-01 : numero LB-XXXX-XXXX aleatoire ; en cas (improbable) de
    // collision sur la contrainte d'unicite, la transaction entiere est
    // rejouee avec un nouveau numero (une violation d'unicite invalide la
    // transaction Postgres en cours, on ne peut pas reessayer a l'interieur).
    const NB_ESSAIS_NUMERO = 5;
    for (let essai = 1; ; essai += 1) {
      try {
        await prisma.$transaction(async (tx) => {
          const examenCree = await tx.examenMedical.create({
            data: {
              patientId,
              demandeurId: professionnel.id,
              laboratoireId: laboratoire.id,
              consultationId: consultationIdValide,
              typeExamen,
              numero: genererNumeroExamen(),
              statut: "demande",
              sensible: estExamenSensible(typeExamen),
              niveauUrgence,
              aJeunRequis,
            },
          });

          await journaliser(
            {
              utilisateurId: session.userId,
              action: "creation",
              donneeConcernee: `examen_medical:${examenCree.id}`,
              adresseTechnique,
              justification: `Examen medical ${examenCree.numero} demande pour le patient ${patientId}`,
            },
            tx
          );
        });
        break;
      } catch (erreur) {
        if (estCollisionUnicite(erreur) && essai < NB_ESSAIS_NUMERO) continue;
        throw erreur;
      }
    }

    // F-LAB-01 : le laboratoire destinataire est prevenu de la nouvelle
    // demande (message sans nom de patient ni d'examen : rien de sensible
    // dans une notification). Hors transaction, une notification manquee ne
    // doit pas defaire la demande.
    await notifierPersonnelLaboratoire(
      laboratoire.id,
      "examen_demande",
      "Une nouvelle demande d'examen est arrivee dans votre laboratoire.",
      "/app/medecin/laboratoire"
    );

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la demande d'examen medical :", erreur);
    return {
      error: "Une erreur est survenue lors de la demande d'examen. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * F-LAB-06 du pack : annule une demande d'examen, reservee au medecin
 * demandeur (verifie en base, jamais suppose du seul role). Autorisee tant
 * qu'aucun resultat n'existe encore (statut "demande" ou "en_cours") ; refuse
 * des qu'un resultat a ete saisi, valide ou renvoye pour correction, pour ne
 * jamais faire disparaitre une donnee de resultat deja produite. Meme
 * pattern qu'annulerRendezVousProfessionnelAction (src/modules/facility/actions.ts) :
 * pas de re-authentification, ce n'est pas un acte clinique deja signe.
 */
export async function annulerExamenAction(
  prevState: LaboratoireActionState,
  formData: FormData
): Promise<LaboratoireActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "update", "examen_medical"))) {
    return { error: "Action reservee aux medecins.", success: false };
  }

  const validation = schemaAnnulationExamen.safeParse({
    examenId: texte(formData, "examenId"),
    motif: texte(formData, "motif"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Examen invalide."),
      success: false,
    };
  }

  const { examenId, motif } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const examen = await prisma.examenMedical.findUnique({
      where: { id: examenId },
      include: { patient: { select: { userId: true } } },
    });

    if (!examen || examen.demandeurId !== professionnel.id) {
      return { error: "Cet examen est introuvable.", success: false };
    }

    if (
      !STATUTS_ANNULATION_AUTORISEE.includes(
        examen.statut as (typeof STATUTS_ANNULATION_AUTORISEE)[number]
      )
    ) {
      return {
        error: "Cet examen a deja un resultat en cours de traitement, il ne peut plus etre annule.",
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.examenMedical.update({ where: { id: examen.id }, data: { statut: "annule" } }),
      journaliser({
        utilisateurId: session.userId,
        action: "modification",
        donneeConcernee: `examen_medical:${examen.id}`,
        adresseTechnique,
        justification: `Demande d'examen annulee par le medecin demandeur. Motif : ${motif}`,
      }),
    ]);

    // F-LAB-06 : le patient et le laboratoire rattache sont notifies. Hors
    // transaction (une notification manquee ne doit pas defaire l'annulation).
    // Le message au patient ne nomme jamais l'examen ni le motif (un examen
    // sensible ne doit rien reveler avant annonce, RG-LAB-41) ; le laboratoire,
    // qui connait deja la demande, recoit le motif.
    await Promise.all([
      creerNotification(
        examen.patient.userId,
        "examen_annule",
        "Une demande d'examen vous concernant a ete annulee par votre medecin.",
        "/app/patient/examens",
        { codeCatalogue: "N-LAB-CANCELLED" }
      ),
      notifierPersonnelLaboratoire(
        examen.laboratoireId,
        "examen_annule",
        `Une demande d'examen a ete annulee par le medecin demandeur. Motif : ${motif}`,
        "/app/medecin/laboratoire",
        { codeCatalogue: "N-LAB-CANCELLED" }
      ),
    ]);

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'annulation de l'examen :", erreur);
    return {
      error: "Une erreur est survenue lors de l'annulation de l'examen. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Recupere les examens medicaux demandes par le professionnel connecte
 * (derive de getSession() -> ProfessionnelSante lie), du plus recent au plus
 * ancien.
 */
export async function getExamensDemandesParProfessionnel(): Promise<ExamenResume[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const examens = await prisma.examenMedical.findMany({
    where: { demandeurId: professionnel.id },
    include: { patient: { include: { user: true } }, laboratoire: true },
    orderBy: { date: "desc" },
  });

  return examens.map((examen) => {
    const resume = versExamenResume(examen, {
      patientNomComplet: nomComplet(examen.patient.user),
      patientIdentifiantSante: examen.patient.identifiantSante,
      demandeurNomComplet: null,
    });

    // RG-LAB-30 (F-LAB-04) : hors du laboratoire, un resultat n'est visible
    // qu'une fois valide par un second professionnel (statut "termine"). Tant
    // que l'examen est "resultat_saisi" ou "correction_demandee", le medecin
    // demandeur ne doit pas y avoir acces, meme si le laboratoire l'a deja
    // saisi en base.
    if (resume.statut !== "termine") {
      return { ...resume, resultat: null, dateResultat: null };
    }

    return resume;
  });
}

/**
 * Recupere tous les examens medicaux du patient connecte (derive de
 * getSession(), jamais d'id en parametre), du plus recent au plus ancien.
 * RG-LAB-02/RG-LAB-41 du pack : un examen sensible (ex. serologie VIH) garde
 * son resultat masque tant qu'un medecin ne l'a pas explicitement annonce
 * (annoncerResultatExamenAction), meme si le laboratoire l'a deja saisi.
 */
export async function getMesExamens(): Promise<ExamenResume[]> {
  const patient = await patientDeLaSessionCourante();

  if (!patient) {
    return [];
  }

  const examens = await prisma.examenMedical.findMany({
    where: { patientId: patient.id },
    include: { demandeur: { include: { user: true } }, laboratoire: true },
    orderBy: { date: "desc" },
  });

  return examens.map((examen) => {
    const resume = versExamenResume(examen, {
      patientNomComplet: null,
      patientIdentifiantSante: null,
      demandeurNomComplet: nomCompletProfessionnel(examen.demandeur.user),
    });

    // RG-LAB-30 (F-LAB-04, visible seulement une fois valide) et
    // RG-LAB-02/RG-LAB-41 (examen sensible masque tant que non annonce) :
    // deux motifs de masquage distincts, cumules dans la meme condition
    // plutot que dupliques dans deux blocs separes.
    if (resume.statut !== "termine" || (resume.sensible && !resume.resultatAnnonceAuPatient)) {
      return { ...resume, resultat: null, dateResultat: null };
    }

    return resume;
  });
}

/**
 * Recupere tous les examens medicaux (tous statuts confondus) assignes a
 * l'etablissement du professionnel connecte (derive de getSession() ->
 * ProfessionnelSante lie), tries pour presenter en premier ceux en attente de
 * traitement ("demande" ou "en_cours"), puis par date (du plus ancien au
 * plus recent au sein d'un meme groupe de priorite, comme une file de
 * traitement). Retourne un tableau vide si l'appelant n'a pas de profil
 * ProfessionnelSante ou n'est pas rattache a un etablissement de type
 * "laboratoire" (Zero Trust : jamais suppose depuis le role seul).
 */
export async function getExamensPourLaboratoire(): Promise<ExamenResume[]> {
  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return [];
  }

  const etablissement = await prisma.etablissementSanitaire.findUnique({
    where: { id: professionnel.etablissementId },
  });

  if (!etablissement || etablissement.type !== "laboratoire") {
    return [];
  }

  const examens = await prisma.examenMedical.findMany({
    where: { laboratoireId: etablissement.id },
    include: {
      patient: { include: { user: true } },
      demandeur: { include: { user: true } },
      laboratoire: true,
      saisiPar: { include: { user: true } },
      validePar: { include: { user: true } },
      versionsResultat: { orderBy: { numero: "asc" } },
    },
    orderBy: { date: "asc" },
  });

  const prioriteStatut = (statut: string): number =>
    (STATUTS_EN_ATTENTE_LABORATOIRE as readonly string[]).includes(statut) ? 0 : 1;

  const examensTries = [...examens].sort(
    (a, b) => prioriteStatut(a.statut) - prioriteStatut(b.statut)
  );
  const anterieursDe = construireAnterieurs(examens, NOMBRE_MAX_ANTERIEURS);

  // Lecture cote laboratoire (F-LAB-04) : contrairement aux lectures
  // medecin/patient ci-dessus, le resultat brut reste visible quel que soit
  // le statut ("resultat_saisi", "correction_demandee" compris), c'est
  // precisement l'ecran ou la validation a quatre yeux se joue.
  return examensTries.map((examen) =>
    versExamenResume(examen, {
      patientNomComplet: nomComplet(examen.patient.user),
      patientIdentifiantSante: examen.patient.identifiantSante,
      demandeurNomComplet: nomCompletProfessionnel(examen.demandeur.user),
      saisiParId: examen.saisiParId,
      saisiParNomComplet: examen.saisiPar ? nomComplet(examen.saisiPar.user) : null,
      valideParNomComplet: examen.validePar ? nomComplet(examen.validePar.user) : null,
      commentaireValidation: examen.commentaireValidation,
      versionsPrecedentes: examen.versionsResultat.map((version) => ({
        numero: version.numero,
        resultat: version.resultat,
        motifCorrection: version.motifCorrection,
        dateCorrection: version.dateCorrection.toISOString(),
      })),
      anterieurs: anterieursDe(examen.id),
    })
  );
}

const TYPES_ECHANTILLON = ["sang_veineux", "sang_capillaire", "urine", "selles", "autre"] as const;
const MOTIFS_REJET_ECHANTILLON = [
  "hemolyse",
  "quantite_insuffisante",
  "mauvais_tube",
  "delai_depasse",
  "etiquetage_incorrect",
] as const;

const schemaPrelevement = z.object({
  examenId: z.string().trim().min(1, "L'examen est obligatoire."),
  typeEchantillon: z.enum(TYPES_ECHANTILLON, { message: "Type d'echantillon invalide." }),
  identifiantEchantillon: z.string().trim().min(1, "L'identifiant de l'echantillon est obligatoire."),
  identiteVerifiee: z.coerce.boolean().refine((valeur) => valeur, {
    message: "L'identite du patient doit etre verifiee avant d'enregistrer le prelevement.",
  }),
});

/**
 * Enregistre le prelevement d'un examen (F-LAB-02 du pack) : le technicien a
 * verifie l'identite du patient (nom, date de naissance, case a cocher
 * obligatoire) et note le type d'echantillon, son identifiant et l'heure du
 * prelevement. Fait passer le statut de "demande" a "en_cours" (deja prevu
 * par le champ ExamenMedical.statut, jamais ecrit avant ce chantier).
 * Meme verification de rattachement que saisirResultatExamenAction : un
 * examen ne peut etre pris en charge que par le laboratoire auquel il est
 * assigne (RG-LAB-10 : jamais un autre laboratoire).
 */
export async function enregistrerPrelevementAction(
  prevState: LaboratoireActionState,
  formData: FormData
): Promise<LaboratoireActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "examen_medical"))) {
    return { error: "Action reservee au role laboratoire.", success: false };
  }

  const moduleInactif = await refuserSiModuleLaboratoireInactif();
  if (moduleInactif) return moduleInactif;

  const validation = schemaPrelevement.safeParse({
    examenId: texte(formData, "examenId"),
    typeEchantillon: texte(formData, "typeEchantillon"),
    identifiantEchantillon: texte(formData, "identifiantEchantillon"),
    identiteVerifiee: formData.get("identiteVerifiee"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de prelevement invalides."),
      success: false,
    };
  }

  const { examenId, typeEchantillon, identifiantEchantillon } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const examen = await prisma.examenMedical.findUnique({ where: { id: examenId } });

    if (!examen || examen.laboratoireId !== professionnel.etablissementId) {
      return { error: "Cet examen est introuvable.", success: false };
    }

    if (examen.statut !== "demande") {
      return {
        error: "Le prelevement ne peut etre enregistre que pour une demande en attente.",
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const datePrelevement = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.examenMedical.update({
        where: { id: examenId },
        data: {
          statut: "en_cours",
          identiteVerifiee: true,
          datePrelevement,
          typeEchantillon,
          identifiantEchantillon,
          preleveurId: professionnel.id,
          motifRejetEchantillon: null,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "prelevement_examen",
          donneeConcernee: `examen_medical:${examenId}`,
          adresseTechnique,
          justification: `Prelevement enregistre (${typeEchantillon}, echantillon ${identifiantEchantillon}), identite verifiee.`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'enregistrement du prelevement :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaRejetEchantillon = z.object({
  examenId: z.string().trim().min(1, "L'examen est obligatoire."),
  motifRejetEchantillon: z.enum(MOTIFS_REJET_ECHANTILLON, { message: "Motif de rejet invalide." }),
});

/**
 * Rejette l'echantillon d'un examen deja preleve (F-LAB-02 du pack) : remet
 * le statut a "demande" pour qu'un nouveau prelevement soit fait, notifie le
 * prescripteur et le patient qu'un nouveau prelevement est necessaire.
 * Jamais possible sur un examen dont le resultat a deja ete saisi (le rejet
 * concerne l'echantillon, pas un resultat deja produit).
 */
export async function rejeterEchantillonAction(
  prevState: LaboratoireActionState,
  formData: FormData
): Promise<LaboratoireActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "examen_medical"))) {
    return { error: "Action reservee au role laboratoire.", success: false };
  }

  const moduleInactif = await refuserSiModuleLaboratoireInactif();
  if (moduleInactif) return moduleInactif;

  const validation = schemaRejetEchantillon.safeParse({
    examenId: texte(formData, "examenId"),
    motifRejetEchantillon: texte(formData, "motifRejetEchantillon"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de rejet invalides."),
      success: false,
    };
  }

  const { examenId, motifRejetEchantillon } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const examen = await prisma.examenMedical.findUnique({
      where: { id: examenId },
      include: { patient: { select: { userId: true } }, demandeur: { select: { userId: true } } },
    });

    if (!examen || examen.laboratoireId !== professionnel.etablissementId) {
      return { error: "Cet examen est introuvable.", success: false };
    }

    if (examen.statut !== "en_cours") {
      return {
        error: "Seul un echantillon deja preleve peut etre rejete.",
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.examenMedical.update({
        where: { id: examenId },
        data: {
          statut: "demande",
          motifRejetEchantillon,
          identiteVerifiee: false,
          datePrelevement: null,
          typeEchantillon: null,
          identifiantEchantillon: null,
          preleveurId: null,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "rejet_echantillon_examen",
          donneeConcernee: `examen_medical:${examenId}`,
          adresseTechnique,
          justification: `Echantillon rejete (motif : ${motifRejetEchantillon}), nouveau prelevement necessaire.`,
        },
        tx
      );
    });

    // creerNotification n'est pas transactionnelle (voir le meme choix dans
    // src/modules/administration/etablissements.ts) : envoyee seulement
    // apres le commit reel de la transaction ci-dessus.
    //
    // RG-LAB-42 du pack : "Aucune notification (SMS ou application) NE DOIT
    // contenir le nom de l'examen ni la valeur." Corrige ici : les deux
    // messages ci-dessous incluaient auparavant typeExamen en clair (ex.
    // "Serologie VIH"), exactement le risque de fuite deja corrige pour les
    // notifications de resultat (voir docs/audit-cote-laboratoire.md) mais
    // pas encore applique a ce chemin de rejet d'echantillon.
    await Promise.all([
      creerNotification(
        examen.demandeur.userId,
        "echantillon_rejete",
        "L'echantillon d'un examen que vous avez demande a ete rejete. Un nouveau prelevement est necessaire.",
        "/app/medecin/examens"
      ),
      creerNotification(
        examen.patient.userId,
        "echantillon_rejete",
        "Un nouveau prelevement est necessaire pour un examen demande par votre medecin.",
        "/app/patient/examens",
        { codeCatalogue: "N-LAB-SAMPLE-REJECTED" }
      ),
    ]);

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du rejet de l'echantillon :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

/**
 * Saisit le resultat d'un examen medical par le professionnel connecte, cote
 * laboratoire (premiere paire d'yeux du principe des quatre yeux, F-LAB-04).
 * Verifie que l'examen identifie par examenId est bien assigne a
 * l'etablissement auquel le professionnel connecte est rattache (Zero Trust :
 * jamais confiance en l'id transmis par le client sans verification de
 * propriete/rattachement, meme principe que la verification de consultation
 * dans creerPrescriptionAction). Passe le statut a "resultat_saisi" (jamais
 * "termine" directement, voir validerResultatExamenAction ci-dessous) et
 * enregistre l'auteur de la saisie. Gere aussi la resaisie apres un renvoi
 * pour correction (RG-ROL-31) : l'ancienne valeur et le motif du renvoi sont
 * conserves dans le JournalAudit plutot qu'ecrases silencieusement.
 */
export async function saisirResultatExamenAction(
  prevState: LaboratoireActionState,
  formData: FormData
): Promise<LaboratoireActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  // RBAC (voir src/security/permissions.ts) : saisir un resultat d'examen
  // est reserve au role laboratoire. Le rattachement a l'etablissement
  // (verifie plus bas) ne suffit pas a lui seul : un medecin ou un
  // administrateur rattaches au meme etablissement ne doivent pas pouvoir
  // saisir de resultat.
  if (!session.roles.some((role) => can(role, "update", "examen_medical"))) {
    return { error: "Action reservee au role laboratoire.", success: false };
  }

  const moduleInactif = await refuserSiModuleLaboratoireInactif();
  if (moduleInactif) return moduleInactif;

  const validation = schemaSaisieResultat.safeParse({
    examenId: texte(formData, "examenId"),
    resultat: texte(formData, "resultat"),
    parametresJson: texte(formData, "parametresJson"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de resultat invalides."),
      success: false,
    };
  }

  const { examenId, resultat, parametresJson } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const examen = await prisma.examenMedical.findUnique({
      where: { id: examenId },
      include: { patient: true },
    });

    if (!examen || examen.laboratoireId !== professionnel.etablissementId) {
      return { error: "Cet examen est introuvable.", success: false };
    }

    if (!(STATUTS_SAISIE_AUTORISEE as readonly string[]).includes(examen.statut)) {
      return {
        error: "Le resultat de cet examen ne peut pas etre saisi dans son etat actuel.",
        success: false,
      };
    }

    // F-LAB-03 : pour le perimetre reduit d'examens quantitatifs couvert par
    // referentiel-parametres-examens.ts, la saisie est structuree par
    // parametre (valeur numerique, indicateur calcule) plutot qu'en texte
    // libre. Les examens hors de ce perimetre gardent le texte libre,
    // comportement inchange.
    const refParametres = parametresPourExamen(examen.typeExamen);
    // Age du patient a la date de la saisie (plage pediatrique de l'hemoglobine,
    // marque "reference adulte" sinon) ; inconnu = plage adulte sans marque.
    const ageMoisPatient = examen.patient.dateNaissance
      ? ageEnMois(new Date(examen.patient.dateNaissance), new Date())
      : null;
    let resultatTexte: string;
    let resultatsParametresSnapshot: ResultatParametre[] | null = null;

    if (refParametres) {
      let valeursSoumises: unknown;
      try {
        valeursSoumises = JSON.parse(parametresJson);
      } catch {
        return { error: "Format des valeurs saisies invalide.", success: false };
      }

      if (!Array.isArray(valeursSoumises)) {
        return { error: "Format des valeurs saisies invalide.", success: false };
      }

      const parValeurs = new Map(
        valeursSoumises
          .filter(
            (v): v is { code: string; valeur: string } =>
              typeof v === "object" && v !== null && typeof v.code === "string" && typeof v.valeur === "string"
          )
          .map((v) => [v.code, v.valeur])
      );

      const snapshot: ResultatParametre[] = [];
      for (const parametre of refParametres) {
        const valeurBrute = parValeurs.get(parametre.code);
        if (!valeurBrute || valeurBrute.trim() === "") {
          return { error: `La valeur de "${parametre.libelle}" est obligatoire.`, success: false };
        }

        const valeurNumerique = Number(valeurBrute.trim().replace(",", "."));
        if (Number.isNaN(valeurNumerique)) {
          return { error: `La valeur de "${parametre.libelle}" doit etre un nombre.`, success: false };
        }

        // RG-LAB-20 : une valeur hors des limites physiologiquement
        // possibles est refusee, jamais enregistree avec un indicateur.
        if (!valeurPhysiologiquementPossible(parametre.code, valeurNumerique)) {
          return {
            error: `La valeur de "${parametre.libelle}" (${valeurNumerique} ${parametre.unite}) est hors des limites physiologiquement possibles.`,
            success: false,
          };
        }

        const evaluation = evaluerParametre(
          parametre.code,
          valeurNumerique,
          examen.patient.sexe as Sexe,
          ageMoisPatient
        );
        if (!evaluation) {
          return { error: `La valeur de "${parametre.libelle}" est invalide.`, success: false };
        }

        snapshot.push({
          code: parametre.code,
          libelle: parametre.libelle,
          unite: parametre.unite,
          valeur: valeurNumerique,
          indicateur: evaluation.indicateur,
          ...(evaluation.referenceAdulteParDefaut ? { referenceAdulteParDefaut: true } : {}),
        });
      }

      resultatsParametresSnapshot = snapshot;
      resultatTexte = snapshot
        .map(
          (p) =>
            `${p.libelle} : ${p.valeur} ${p.unite} (${p.indicateur}${p.referenceAdulteParDefaut ? ", reference adulte" : ""})`
        )
        .join(" ; ");
    } else {
      if (resultat.trim().length === 0) {
        return { error: "Le resultat est obligatoire.", success: false };
      }
      resultatTexte = resultat.trim();
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const etaitEnCorrection = examen.statut === "correction_demandee";

    await prisma.$transaction(async (tx) => {
      await tx.examenMedical.update({
        where: { id: examenId },
        data: {
          statut: "resultat_saisi",
          resultat: resultatTexte,
          resultatsParametres: resultatsParametresSnapshot
            ? (resultatsParametresSnapshot as unknown as Prisma.InputJsonValue)
            : undefined,
          dateResultat: new Date(),
          saisiParId: professionnel.id,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "saisie_resultat_examen",
          donneeConcernee: `examen_medical:${examenId}`,
          adresseTechnique,
          justification: etaitEnCorrection
            ? `Resultat resaisi apres correction demandee. Ancienne valeur : ${examen.resultat ?? "aucune"}. Motif du renvoi : ${examen.commentaireValidation ?? "non precise"}.`
            : `Resultat saisi pour l'examen medical ${examenId}, en attente de validation par un autre professionnel du laboratoire (principe des quatre yeux, F-LAB-04).`,
        },
        tx
      );
    });

    // Contrairement a l'ancien flux (saisie = disponible immediatement),
    // aucune notification n'est declenchee ici : tant que le resultat n'est
    // pas valide par un second professionnel, il n'est pas cense exister pour
    // le patient ni le medecin demandeur (RG-LAB-30). Les notifications
    // F-LAB-05 existantes sont deplacees dans validerResultatExamenAction,
    // seul moment ou le resultat devient reellement disponible.

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la saisie du resultat d'examen medical :", erreur);
    return {
      error: "Une erreur est survenue lors de la saisie du resultat. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Valide le resultat d'un examen medical (F-LAB-04 du pack, principe des
 * quatre yeux, RG-ROL-30) : deuxieme paire d'yeux, distincte de celle ayant
 * saisi le resultat. Exige la re-saisie du mot de passe du compte a chaque
 * validation (adaptation actee de la re-authentification "moins de 5 minutes"
 * du pack, ce depot ne tracant pas d'horodatage de derniere authentification
 * au niveau de la session), meme pattern que retirerConsultationAction dans
 * src/modules/clinical/actions.ts. CA-1 : un professionnel ne peut pas valider
 * un resultat qu'il a lui-meme saisi, la tentative est refusee et tracee dans
 * JournalAudit. Toute la verification puis l'ecriture se fait dans une seule
 * transaction, y compris le refus trace (la transaction n'echoue pas pour
 * autant : seule l'ecriture de l'examen est conditionnee au succes).
 */
export async function validerResultatExamenAction(
  prevState: LaboratoireActionState,
  formData: FormData
): Promise<LaboratoireActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "validation_examen"))) {
    return { error: "Action reservee au role laboratoire.", success: false };
  }

  const moduleInactif = await refuserSiModuleLaboratoireInactif();
  if (moduleInactif) return moduleInactif;

  const validation = schemaValidationResultat.safeParse({
    examenId: texte(formData, "examenId"),
    motDePasse: texte(formData, "motDePasse"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de validation invalides."),
      success: false,
    };
  }

  const { examenId, motDePasse } = validation.data;

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

    const adresseTechnique = await adresseTechniqueCourante();

    const resultatTransaction = await prisma.$transaction(async (tx) => {
      const examen = await tx.examenMedical.findUnique({
        where: { id: examenId },
        include: { patient: true, demandeur: true },
      });

      if (!examen || examen.laboratoireId !== professionnel.etablissementId) {
        return { error: "Cet examen est introuvable.", examen: null };
      }

      if (examen.statut !== "resultat_saisi") {
        return { error: "Ce resultat n'est pas en attente de validation.", examen: null };
      }

      // CA-1 / RG-ROL-30 : la personne qui valide doit etre differente de
      // celle qui a saisi le resultat. Ce depot n'a pas de role
      // LAB_SUPERVISOR distinct : la validation est ouverte a tout
      // professionnel du role laboratoire de ce laboratoire, autre que celui
      // ayant saisi le resultat (quatre yeux entre pairs).
      if (examen.saisiParId === professionnel.id) {
        await journaliser(
          {
            utilisateurId: session.userId,
            action: "tentative_autovalidation_refusee",
            donneeConcernee: `examen_medical:${examenId}`,
            adresseTechnique,
            justification:
              "Tentative de validation d'un resultat par le professionnel l'ayant lui-meme saisi, refusee (principe des quatre yeux, F-LAB-04).",
          },
          tx
        );

        return {
          error:
            "Vous ne pouvez pas valider un resultat que vous avez vous-meme saisi. Un autre professionnel du laboratoire doit le valider.",
          examen: null,
        };
      }

      const empreinteResultat = calculerEmpreinteResultat({
        examenId: examen.id,
        resultat: examen.resultat ?? "",
        resultatsParametres: (examen.resultatsParametres as ResultatParametre[] | null) ?? null,
        saisiParId: examen.saisiParId ?? "",
      });

      await tx.examenMedical.update({
        where: { id: examenId },
        data: {
          statut: "termine",
          valideParId: professionnel.id,
          dateValidation: new Date(),
          empreinteResultat,
          commentaireValidation: null,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "validation_resultat_examen",
          donneeConcernee: `examen_medical:${examenId}`,
          adresseTechnique,
          justification: `Resultat de l'examen medical ${examenId} valide (principe des quatre yeux, saisi par le professionnel ${examen.saisiParId ?? "inconnu"}).`,
        },
        tx
      );

      return { error: null, examen };
    });

    if (resultatTransaction.error || !resultatTransaction.examen) {
      return { error: resultatTransaction.error ?? "Validation impossible.", success: false };
    }

    // Notification interne (Phase 10, F-LAB-05 deja implemente ailleurs, non
    // modifie ici) : deplacee depuis saisirResultatExamenAction puisque
    // c'est desormais la validation, et non la saisie, qui rend le resultat
    // disponible (RG-LAB-30). Hors transaction : une notification manquee ne
    // doit jamais faire echouer la validation elle-meme (deja actee en base).
    const examenValide = resultatTransaction.examen;
    const { creerNotification } = await import("@/modules/notification/creer");
    // RG-LAB-41 / RG-CIT-20 : le patient n'est PAS prevenu a la validation
    // d'un examen sensible ; il ne l'est qu'a l'annonce explicite par le
    // medecin (annoncerResultatExamenAction), sinon la notification revelerait
    // qu'un resultat sensible existe avant que le medecin ne l'ait annonce.
    await Promise.all([
      examenValide.sensible
        ? Promise.resolve()
        : creerNotification(
            examenValide.patient.userId,
            "resultat_examen_disponible",
            "Un resultat d'analyse est disponible dans votre dossier.",
            "/app/patient/examens",
            { codeCatalogue: "N-LAB-RESULT-PATIENT" }
          ),
      creerNotification(
        examenValide.demandeur.userId,
        "resultat_examen_disponible",
        examenValide.versionResultat > 1
          ? `La version corrigee (version ${examenValide.versionResultat}) du resultat d'un examen que vous avez demande est disponible.`
          : "Le resultat d'un examen que vous avez demande est disponible.",
        "/app/medecin/examens",
        { codeCatalogue: "N-LAB-RESULT-PRO" }
      ),
    ]);

    // RG-LAB-21 du pack : une valeur critique (LL/HH) declenche, a la
    // validation, une notification prioritaire au prescripteur. Si elle reste
    // non lue plus de 2 h, la tache planifiee relances.ts l'escalade aux
    // responsables d'etablissement du prescripteur (N-LAB-CRITICAL-ESCALATION).
    const parametresCritiques = ((examenValide.resultatsParametres as ResultatParametre[] | null) ?? []).filter(
      (p) => p.indicateur === "LL" || p.indicateur === "HH"
    );
    if (parametresCritiques.length > 0) {
      const listeParametres = parametresCritiques.map((p) => `${p.libelle} : ${p.valeur} ${p.unite} (${p.indicateur})`).join(", ");
      await creerNotification(
        examenValide.demandeur.userId,
        "resultat_examen_critique",
        `URGENT : valeur critique dans un resultat d'examen (${listeParametres}).`,
        "/app/medecin/examens"
      );
    }

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la validation du resultat d'examen medical :", erreur);
    return {
      error: "Une erreur est survenue lors de la validation du resultat. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Renvoie pour correction le resultat d'un examen medical (F-LAB-04 du pack) :
 * meme garde-fou de symetrie avec CA-1 que validerResultatExamenAction, le
 * professionnel qui renvoie pour correction doit lui aussi etre different de
 * celui ayant saisi le resultat. Le commentaire (motif) est obligatoire et
 * conserve en base jusqu'a la resaisie ou la validation suivante. Ne demande
 * pas de mot de passe : contrairement a la validation, cette action ne
 * verrouille rien de facon definitive.
 */
export async function renvoyerPourCorrectionAction(
  prevState: LaboratoireActionState,
  formData: FormData
): Promise<LaboratoireActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "validation_examen"))) {
    return { error: "Action reservee au role laboratoire.", success: false };
  }

  const moduleInactif = await refuserSiModuleLaboratoireInactif();
  if (moduleInactif) return moduleInactif;

  const validation = schemaCorrectionResultat.safeParse({
    examenId: texte(formData, "examenId"),
    commentaire: texte(formData, "commentaire"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de renvoi invalides."),
      success: false,
    };
  }

  const { examenId, commentaire } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    const resultatTransaction = await prisma.$transaction(async (tx) => {
      const examen = await tx.examenMedical.findUnique({ where: { id: examenId } });

      if (!examen || examen.laboratoireId !== professionnel.etablissementId) {
        return { error: "Cet examen est introuvable." };
      }

      if (examen.statut !== "resultat_saisi") {
        return { error: "Ce resultat n'est pas en attente de validation." };
      }

      if (examen.saisiParId === professionnel.id) {
        await journaliser(
          {
            utilisateurId: session.userId,
            action: "tentative_autovalidation_refusee",
            donneeConcernee: `examen_medical:${examenId}`,
            adresseTechnique,
            justification:
              "Tentative de renvoi pour correction d'un resultat par le professionnel l'ayant lui-meme saisi, refusee (principe des quatre yeux, F-LAB-04).",
          },
          tx
        );

        return {
          error:
            "Vous ne pouvez pas renvoyer pour correction un resultat que vous avez vous-meme saisi. Un autre professionnel du laboratoire doit le faire.",
        };
      }

      await tx.examenMedical.update({
        where: { id: examenId },
        data: { statut: "correction_demandee", commentaireValidation: commentaire },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "renvoi_correction_examen",
          donneeConcernee: `examen_medical:${examenId}`,
          adresseTechnique,
          justification: `Resultat de l'examen medical ${examenId} renvoye pour correction. Motif : ${commentaire}`,
        },
        tx
      );

      return { error: null };
    });

    if (resultatTransaction.error) {
      return { error: resultatTransaction.error, success: false };
    }

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du renvoi pour correction de l'examen medical :", erreur);
    return {
      error: "Une erreur est survenue lors du renvoi pour correction. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Corrige un resultat DEJA VALIDE (F-LAB-04, RG-ROL-31 du pack) : un resultat
 * valide n'est jamais modifie sur place. La version validee est archivee,
 * figee, dans VersionResultatExamen (valeurs, empreinte, validateur, motif de
 * la correction, auteur), puis l'examen repasse a "correction_demandee" avec le
 * numero de version incremente : le flux habituel de resaisie puis de
 * validation par un AUTRE professionnel (quatre yeux) produit la nouvelle
 * version. Pendant la correction le resultat n'est plus visible hors du
 * laboratoire (RG-LAB-30) ; le prescripteur en est averti tout de suite pour
 * ne plus s'y fier, et une deuxieme fois quand la version corrigee est
 * validee. Un examen sensible perd son statut "annonce" : le medecin doit
 * annoncer de nouveau la version corrigee. Mot de passe exige, comme pour la
 * validation.
 */
export async function corrigerResultatValideAction(
  prevState: LaboratoireActionState,
  formData: FormData
): Promise<LaboratoireActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "validation_examen"))) {
    return { error: "Action reservee au role laboratoire.", success: false };
  }

  const moduleInactif = await refuserSiModuleLaboratoireInactif();
  if (moduleInactif) return moduleInactif;

  const validation = schemaCorrectionResultatValide.safeParse({
    examenId: texte(formData, "examenId"),
    motif: texte(formData, "motif"),
    motDePasse: texte(formData, "motDePasse"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de correction invalides."),
      success: false,
    };
  }

  const { examenId, motif, motDePasse } = validation.data;

  try {
    const utilisateur = await prisma.user.findUnique({ where: { id: session.userId } });

    if (!utilisateur) {
      return { error: "Compte introuvable.", success: false };
    }

    if (!(await bcrypt.compare(motDePasse, utilisateur.motDePasseHash))) {
      return { error: "Mot de passe incorrect.", success: false };
    }

    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    const resultatTransaction = await prisma.$transaction(async (tx) => {
      const examen = await tx.examenMedical.findUnique({
        where: { id: examenId },
        include: { demandeur: true },
      });

      if (!examen || examen.laboratoireId !== professionnel.etablissementId) {
        return { error: "Cet examen est introuvable.", examen: null };
      }

      if (examen.statut !== "termine") {
        return { error: "Seul un resultat deja valide peut etre corrige de cette facon.", examen: null };
      }

      await tx.versionResultatExamen.create({
        data: {
          examenId: examen.id,
          numero: examen.versionResultat,
          resultat: examen.resultat,
          resultatsParametres: (examen.resultatsParametres as unknown as Prisma.InputJsonValue | null) ?? undefined,
          empreinteResultat: examen.empreinteResultat,
          saisiParId: examen.saisiParId,
          valideParId: examen.valideParId,
          dateValidation: examen.dateValidation,
          motifCorrection: motif,
          corrigeParId: professionnel.id,
        },
      });

      await tx.examenMedical.update({
        where: { id: examen.id },
        data: {
          statut: "correction_demandee",
          versionResultat: examen.versionResultat + 1,
          valideParId: null,
          dateValidation: null,
          empreinteResultat: null,
          commentaireValidation: `Correction d'un resultat valide : ${motif}`,
          // Un examen sensible doit etre annonce de nouveau, et son rappel des 30 jours repart de zero.
          ...(examen.sensible ? { resultatAnnonceAuPatient: false, relanceAnnonceLe: null } : {}),
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "correction_resultat_valide",
          donneeConcernee: `examen_medical:${examen.id}`,
          adresseTechnique,
          justification: `Resultat valide (version ${examen.versionResultat}) archive pour correction. Motif : ${motif}`,
        },
        tx
      );

      return { error: null, examen };
    });

    if (resultatTransaction.error || !resultatTransaction.examen) {
      return { error: resultatTransaction.error ?? "Correction impossible.", success: false };
    }

    // Hors transaction : une notification manquee ne defait pas la correction.
    // Le message ne nomme jamais l'examen ni sa valeur (un examen sensible ne
    // doit rien reveler dans une notification).
    await creerNotification(
      resultatTransaction.examen.demandeur.userId,
      "resultat_examen_corrige",
      `Un resultat d'examen que vous aviez recu est en cours de correction, ne vous y fiez plus. Motif : ${motif}`,
      "/app/medecin/examens"
    );

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la correction du resultat valide :", erreur);
    return {
      error: "Une erreur est survenue lors de la correction. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Annonce au patient le resultat d'un examen sensible (F-LAB-05 / RG-LAB-41
 * du pack) : reserve au medecin demandeur de cet examen precis (Zero Trust,
 * meme principe que creerPrescriptionAction verifiant la consultation).
 * N'a d'effet que sur un examen "sensible", termine, pas deja annonce ; sans
 * cela, retourne une erreur explicite plutot que d'ecrire silencieusement.
 * Une fois annonce, getMesExamens() cesse de masquer le resultat au patient.
 */
export async function annoncerResultatExamenAction(
  prevState: LaboratoireActionState,
  formData: FormData
): Promise<LaboratoireActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "examen_medical"))) {
    return { error: "Action reservee aux medecins.", success: false };
  }

  const validation = schemaAnnonceResultat.safeParse({
    examenId: texte(formData, "examenId"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees invalides."),
      success: false,
    };
  }

  const { examenId } = validation.data;

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const examen = await prisma.examenMedical.findUnique({
      where: { id: examenId },
      include: { patient: true },
    });

    if (!examen || examen.demandeurId !== professionnel.id) {
      return { error: "Cet examen est introuvable.", success: false };
    }

    if (!examen.sensible || examen.statut !== "termine") {
      return {
        error: "Cet examen ne necessite pas d'annonce, ou son resultat n'est pas encore disponible.",
        success: false,
      };
    }

    if (examen.resultatAnnonceAuPatient) {
      return { error: "Ce resultat a deja ete annonce au patient.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.examenMedical.update({
        where: { id: examenId },
        data: { resultatAnnonceAuPatient: true },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "annonce_resultat_examen",
          donneeConcernee: `examen_medical:${examenId}`,
          adresseTechnique,
          justification: `Resultat d'examen sensible annonce au patient ${examen.patientId}`,
        },
        tx
      );
    });

    const { creerNotification } = await import("@/modules/notification/creer");
    await creerNotification(
      examen.patient.userId,
      "resultat_examen_disponible",
      "Un resultat d'analyse est desormais disponible dans votre dossier.",
      "/app/patient/examens",
      { codeCatalogue: "N-LAB-RESULT-PATIENT" }
    );

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'annonce du resultat d'examen medical :", erreur);
    return {
      error: "Une erreur est survenue lors de l'annonce du resultat. Veuillez reessayer.",
      success: false,
    };
  }
}
