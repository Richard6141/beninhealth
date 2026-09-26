"use server";

/**
 * Personnes a charge (F-CIT-07/08 du pack, perimetre reduit) : un citoyen
 * peut ajouter un enfant mineur a son propre compte et gerer son dossier de
 * base en son nom (rendez-vous), sans que l'enfant ait son propre compte de
 * connexion.
 *
 * Perimetre volontairement reduit par rapport au pack (limites assumees,
 * a documenter dans docs/audit-cote-patient.md) :
 * - Seul le cas "enfant mineur cree par son tuteur" est construit ici.
 *   L'etape "personne majeure qui doit accepter depuis son propre compte"
 *   et le rattachement a un dossier existant (recherche de doublon avant
 *   creation) ne sont pas construits : chaque personne a charge est
 *   toujours un nouveau dossier "sans compte".
 * - Pas de distinction DECLARED/VERIFIE (RG-CIT-60) : aucun accueil
 *   d'etablissement ne peut "verifier" une tutelle dans ce depot, donc
 *   l'acces complet (equivalent "dossier_complet") est accorde des la
 *   creation plutot qu'un acces partiel en attendant une verification qui
 *   n'existe pas.
 * - F-CIT-09 (fin de tutelle a 18 ans) : hors perimetre, P2 dans le pack
 *   lui-meme, aucune tache planifiee dans ce depot.
 * - Pas de bandeau "Vous agissez pour" ni de bascule globale de tout
 *   l'espace citoyen (F-CIT-08 complet) : un ecran dedie
 *   (/app/patient/proches/[id]) montre le dossier de base et permet de
 *   prendre rendez-vous, plutot que de faire basculer chaque page
 *   existante du citoyen.
 *
 * Reutilise deux mecanismes deja existants dans ce depot plutot que d'en
 * inventer de nouveaux (aucune migration de schema necessaire, schema.prisma
 * etant deja fortement modifie par ailleurs ce soir) :
 * - Le patient "sans compte" (meme motif que
 *   creerPatientParProfessionnelAction, src/modules/identity/actions.ts) :
 *   un User placeholder (statut "sans_compte", email genere, mot de passe
 *   aleatoire jamais communique) porte le nouveau Patient.
 * - Consentement (typeAcces "dossier_complet") : accorde ici automatiquement
 *   au tuteur createur plutot que par le patient lui-meme (impossible pour
 *   un compte sans connexion). Comme il n'existe pas de marqueur dedie
 *   "ceci est une tutelle", une personne a charge est identifiee par la
 *   combinaison (Consentement.acteurAutoriseId = tuteur, Patient.user.statut
 *   = "sans_compte") : simplification assumee, documentee ici plutot que
 *   d'ajouter un champ de schema pour ce seul besoin.
 */

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { CODES_IDENTIFIANT_PAR_ROLE, prefixeIdentifiant, prochainIdentifiant } from "@/modules/identity/identifiants";

const ROUNDS_BCRYPT = 12;
/** RG-CIT-61 (perimetre reduit : pas de notion de tuteurs multiples verifies). */
const MAX_PERSONNES_A_CHARGE = 10;
const AGE_MAJORITE_ANNEES = 18;

const LIENS_CONNUS = ["mere", "pere", "tuteur_legal", "autre"] as const;

export interface ProcheActionState {
  error: string | null;
  success: boolean;
}

export interface ProcheResume {
  id: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  sexe: string;
}

export interface RendezVousProcheResume {
  id: string;
  date: string;
  motif: string;
  statut: string;
  etablissementNom: string;
  professionnelNomComplet: string | null;
}

const schemaCreationProche = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire.").max(100, "100 caracteres maximum."),
  prenom: z.string().trim().min(1, "Le prenom est obligatoire.").max(100, "100 caracteres maximum."),
  sexe: z.enum(["M", "F"], { message: "Sexe invalide (M ou F attendu)." }),
  dateNaissance: z.string().trim().min(1, "La date de naissance est obligatoire."),
  lien: z.enum(LIENS_CONNUS, { message: "Le lien est invalide." }),
});

const schemaRendezVousProche = z.object({
  procheId: z.string().trim().min(1, "La personne a charge est obligatoire."),
  etablissementId: z.string().trim().min(1, "L'etablissement est obligatoire."),
  professionnelId: z.string().trim().optional().default(""),
  date: z.string().trim().min(1, "La date est obligatoire."),
  motif: z.string().trim().min(1, "Le motif est obligatoire.").max(300, "300 caracteres maximum."),
});

function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

function estMineur(dateNaissance: Date): boolean {
  const limite = new Date();
  limite.setFullYear(limite.getFullYear() - AGE_MAJORITE_ANNEES);
  return dateNaissance > limite;
}

/**
 * Verifie que le citoyen connecte gere bien cette personne a charge (Zero
 * Trust : Consentement actif ou` acteurAutoriseId = session.userId, jamais
 * suppose depuis un id transmis par le client). Retourne le Patient si oui,
 * null sinon (jamais de detail sur pourquoi, meme principe que les autres
 * modules de ce depot).
 */
async function procheAutorise(procheId: string, userId: string) {
  const consentement = await prisma.consentement.findUnique({
    where: { patientId_acteurAutoriseId: { patientId: procheId, acteurAutoriseId: userId } },
  });

  const consentementValide =
    consentement !== null &&
    consentement.statut === "actif" &&
    (consentement.dateFin === null || consentement.dateFin > new Date());

  if (!consentementValide) {
    return null;
  }

  const proche = await prisma.patient.findUnique({
    where: { id: procheId },
    include: { user: true },
  });

  if (!proche || proche.user.statut !== "sans_compte") {
    return null;
  }

  return proche;
}

/**
 * Cree une personne a charge (F-CIT-07 du pack, perimetre enfant mineur
 * uniquement, voir limites assumees en tete de fichier) : un User
 * placeholder "sans_compte" + son Patient, puis un Consentement
 * "dossier_complet" accorde immediatement au tuteur createur
 * (session.userId), sans date de fin (tant que non retire, voir
 * retirerProcheAction).
 */
export async function creerPersonneAChargeAction(
  prevState: ProcheActionState,
  formData: FormData
): Promise<ProcheActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaCreationProche.safeParse({
    nom: texte(formData, "nom"),
    prenom: texte(formData, "prenom"),
    sexe: texte(formData, "sexe"),
    dateNaissance: texte(formData, "dateNaissance"),
    lien: texte(formData, "lien"),
  });

  if (!validation.success) {
    return { error: premierMessageErreur(validation.error, "Donnees invalides."), success: false };
  }

  const { nom, prenom, sexe, dateNaissance: dateNaissanceBrute, lien } = validation.data;
  const dateNaissance = new Date(dateNaissanceBrute);

  if (Number.isNaN(dateNaissance.getTime()) || dateNaissance > new Date()) {
    return { error: "Date de naissance invalide.", success: false };
  }

  if (!estMineur(dateNaissance)) {
    return {
      error:
        "Une personne majeure doit accepter elle-meme depuis son propre compte (fonctionnalite non construite dans ce MVP) : seuls les enfants mineurs peuvent etre ajoutes ici.",
      success: false,
    };
  }

  try {
    const patientTuteur = await prisma.patient.findUnique({ where: { userId: session.userId } });

    if (!patientTuteur) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const nombreExistant = await prisma.consentement.count({
      where: {
        acteurAutoriseId: session.userId,
        patient: { user: { statut: "sans_compte" } },
      },
    });

    if (nombreExistant >= MAX_PERSONNES_A_CHARGE) {
      return {
        error: `Vous avez deja atteint le maximum de ${MAX_PERSONNES_A_CHARGE} personnes a charge.`,
        success: false,
      };
    }

    const motDePasseAleatoire = randomUUID() + randomUUID();
    const motDePasseHash = await bcrypt.hash(motDePasseAleatoire, ROUNDS_BCRYPT);
    const emailPlaceholder = `sans-compte.${randomUUID()}@interne.benin-health.local`;
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      const nombreExistantIdentifiant = await tx.patient.count({
        where: { identifiantSante: { startsWith: prefixeIdentifiant(CODES_IDENTIFIANT_PAR_ROLE.patient) } },
      });
      const identifiantSante = prochainIdentifiant(CODES_IDENTIFIANT_PAR_ROLE.patient, nombreExistantIdentifiant);

      const utilisateur = await tx.user.create({
        data: {
          nom,
          prenom,
          email: emailPlaceholder,
          telephone: "inconnu",
          motDePasseHash,
          statut: "sans_compte",
          roles: { create: [{ nom: "patient" }] },
          patient: {
            create: {
              identifiantSante,
              dateNaissance,
              sexe,
              groupeSanguin: "inconnu",
            },
          },
        },
        include: { patient: true },
      });

      await tx.consentement.create({
        data: {
          patientId: utilisateur.patient!.id,
          acteurAutoriseId: session.userId,
          typeAcces: "dossier_complet",
          statut: "actif",
          dateFin: null,
        },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_personne_a_charge",
          donneeConcernee: `patient:${utilisateur.patient!.id}`,
          adresseTechnique,
          justification: `Personne a charge ajoutee (lien : ${lien})`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la creation de la personne a charge :", erreur);
    return {
      error: "Une erreur est survenue lors de la creation. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Liste les personnes a charge du citoyen connecte (Consentement ou`
 * acteurAutoriseId = session.userId, cote Patient "sans_compte", voir
 * limite assumee en tete de fichier), du plus recemment ajoute au plus
 * ancien.
 */
export async function getMesProches(): Promise<ProcheResume[]> {
  const session = await getSession();

  if (!session) {
    return [];
  }

  const consentements = await prisma.consentement.findMany({
    where: {
      acteurAutoriseId: session.userId,
      statut: "actif",
      patient: { user: { statut: "sans_compte" } },
    },
    include: { patient: { include: { user: true } } },
    orderBy: { dateDebut: "desc" },
  });

  return consentements.map((consentement) => ({
    id: consentement.patient.id,
    nom: consentement.patient.user.nom,
    prenom: consentement.patient.user.prenom,
    dateNaissance: consentement.patient.dateNaissance.toISOString(),
    sexe: consentement.patient.sexe,
  }));
}

/** Detail d'une personne a charge, apres reverification Zero Trust. */
export interface ProcheDetail extends ProcheResume {
  identifiantSante: string;
}

export async function getProcheParId(procheId: string): Promise<ProcheDetail | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const proche = await procheAutorise(procheId, session.userId);

  if (!proche) {
    return null;
  }

  return {
    id: proche.id,
    nom: proche.user.nom,
    prenom: proche.user.prenom,
    dateNaissance: proche.dateNaissance.toISOString(),
    sexe: proche.sexe,
    identifiantSante: proche.identifiantSante,
  };
}

/** Rendez-vous d'une personne a charge, apres reverification Zero Trust. */
export async function getRendezVousDuProche(procheId: string): Promise<RendezVousProcheResume[]> {
  const session = await getSession();

  if (!session) {
    return [];
  }

  const proche = await procheAutorise(procheId, session.userId);

  if (!proche) {
    return [];
  }

  const rendezVous = await prisma.rendezVous.findMany({
    where: { patientId: procheId },
    include: { etablissement: true, professionnel: { include: { user: true } } },
    orderBy: { date: "asc" },
  });

  return rendezVous.map((rdv) => ({
    id: rdv.id,
    date: rdv.date.toISOString(),
    motif: rdv.motif,
    statut: rdv.statut,
    etablissementNom: rdv.etablissement.nom,
    professionnelNomComplet: rdv.professionnel
      ? `Dr. ${rdv.professionnel.user.prenom} ${rdv.professionnel.user.nom}`
      : null,
  }));
}

/**
 * Cree une demande de rendez-vous au nom d'une personne a charge. Meme
 * verification Zero Trust (procheAutorise) qu'ailleurs dans ce module avant
 * toute ecriture ; ne reutilise pas creerRendezVousAction
 * (src/modules/facility/actions.ts, qui ne connait que le patient de la
 * session courante) pour ne pas modifier un fichier partage avec plusieurs
 * autres chantiers en cours ce soir.
 */
export async function creerRendezVousPourProcheAction(
  prevState: ProcheActionState,
  formData: FormData
): Promise<ProcheActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaRendezVousProche.safeParse({
    procheId: texte(formData, "procheId"),
    etablissementId: texte(formData, "etablissementId"),
    professionnelId: texte(formData, "professionnelId"),
    date: texte(formData, "date"),
    motif: texte(formData, "motif"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de rendez-vous invalides."),
      success: false,
    };
  }

  const { procheId, etablissementId, professionnelId, date, motif } = validation.data;

  try {
    const proche = await procheAutorise(procheId, session.userId);

    if (!proche) {
      return { error: "Cette personne a charge est introuvable.", success: false };
    }

    const etablissement = await prisma.etablissementSanitaire.findUnique({
      where: { id: etablissementId },
    });

    if (!etablissement) {
      return { error: "Cet etablissement est introuvable.", success: false };
    }

    if (professionnelId.length > 0) {
      const professionnel = await prisma.professionnelSante.findUnique({
        where: { id: professionnelId },
      });

      if (
        !professionnel ||
        professionnel.etablissementId !== etablissementId ||
        professionnel.statutValidation !== "valide"
      ) {
        return {
          error: "Ce professionnel de sante n'est pas disponible dans cet etablissement.",
          success: false,
        };
      }
    }

    const adresseTechnique = await adresseTechniqueCourante();

    const rendezVous = await prisma.rendezVous.create({
      data: {
        patientId: procheId,
        etablissementId,
        professionnelId: professionnelId.length > 0 ? professionnelId : null,
        date: new Date(date),
        motif,
        statut: "demande",
      },
    });

    await journaliser({
      utilisateurId: session.userId,
      action: "creation_rendez_vous_proche",
      donneeConcernee: `rendez_vous:${rendezVous.id}`,
      adresseTechnique,
      justification: `Demande de rendez-vous creee au nom de la personne a charge ${procheId}, aupres de l'etablissement ${etablissementId}`,
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la creation du rendez-vous pour une personne a charge :", erreur);
    return {
      error: "Une erreur est survenue lors de la creation du rendez-vous. Veuillez reessayer.",
      success: false,
    };
  }
}

const schemaRetraitProche = z.object({
  procheId: z.string().trim().min(1, "La personne a charge est obligatoire."),
});

/**
 * Met fin a la gestion d'une personne a charge par le citoyen connecte : le
 * Consentement passe a "retire" (jamais supprime, meme principe que le
 * reste de ce depot), le dossier Patient de la personne a charge reste
 * intact. Verifie que ce Consentement appartient bien au citoyen connecte
 * avant toute modification (Zero Trust).
 */
export async function retirerProcheAction(
  prevState: ProcheActionState,
  formData: FormData
): Promise<ProcheActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaRetraitProche.safeParse({ procheId: texte(formData, "procheId") });

  if (!validation.success) {
    return { error: premierMessageErreur(validation.error, "Donnees invalides."), success: false };
  }

  const { procheId } = validation.data;

  try {
    const consentement = await prisma.consentement.findUnique({
      where: { patientId_acteurAutoriseId: { patientId: procheId, acteurAutoriseId: session.userId } },
    });

    if (!consentement || consentement.statut !== "actif") {
      return { error: "Cette personne a charge est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.consentement.update({
        where: { id: consentement.id },
        data: { statut: "retire" },
      }),
      journaliser({
        utilisateurId: session.userId,
        action: "retrait_personne_a_charge",
        donneeConcernee: `patient:${procheId}`,
        adresseTechnique,
        justification: "Fin de la gestion de cette personne a charge par ce compte",
      }),
    ]);

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du retrait de la personne a charge :", erreur);
    return {
      error: "Une erreur est survenue lors du retrait. Veuillez reessayer.",
      success: false,
    };
  }
}
