"use server";

/**
 * Acces au dossier d'un patient sans relation prealable, par NPI ou par
 * telephone + date de naissance, confirme par un code envoye au patient
 * (conception et menaces : docs/conception-transfert-dossier.md).
 *
 * Parcours : le professionnel saisit un critere, le patient recoit un code
 * sur son telephone (WhatsApp, sinon SMS) et le lui dicte, le professionnel
 * le saisit et obtient un Consentement "consultations" borne dans le temps,
 * exactement de la meme nature que celui de F-CIT-11 : aucun mecanisme
 * d'acces parallele, getResumePatient et les autres lectures s'appliquent
 * telles quelles.
 *
 * Deux proprietes tiennent le reste :
 * - RG-CLI-10 : la reponse a la demande est strictement la meme que le
 *   patient existe ou non (meme message, meme forme, envoi differe par
 *   after()), sinon la saisie d'un NPI deviendrait un moyen de savoir qui est
 *   patient de la plateforme.
 * - Le code n'est jamais visible du professionnel : ni a l'ecran, ni dans une
 *   reponse, ni dans le journal. Seule son empreinte bcrypt est stockee.
 */

import { headers } from "next/headers";
import { after } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { memeTelephoneBenin, normaliserTelephoneBenin } from "@/lib/telephone";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/actions";
import { can } from "@/security/permissions";
import {
  CODES_MAX_PAR_PATIENT_PAR_24H,
  DEMANDES_MAX_PAR_COUPLE_PAR_24H,
  DEMANDES_MAX_PAR_PROFESSIONNEL_PAR_HEURE,
  DUREE_VALIDITE_CODE_MINUTES,
  ECHECS_MAX_PAR_PROFESSIONNEL_PAR_HEURE,
  LONGUEUR_CODE,
  LONGUEUR_NPI,
  MODES_RECHERCHE,
  RENVOIS_MAX_PAR_DEMANDE,
  SANS_CORRESPONDANCE_MAX_PAR_PROFESSIONNEL_PAR_HEURE,
  TENTATIVES_MAX_PAR_CODE,
  codeSaisiAuBonFormat,
  dureeAccordee,
  empreinteCritere,
  estDureeAcces,
  estMotifAcces,
  genererCodeNumerique,
  libelleDuree,
  normaliserCodeSaisi,
  normaliserNpi,
  type ModeRecherche,
} from "./code-acces";
import { envoyerCodeDemande } from "./envoi-code";
import { aSignalDePresence } from "./presence";
import { accorderAcces } from "./octroi";

const ROUNDS_BCRYPT = 10;
const UNE_HEURE_MS = 60 * 60 * 1000;
const VINGT_QUATRE_HEURES_MS = 24 * UNE_HEURE_MS;
const STATUTS_PATIENT_JOIGNABLES = ["actif", "sans_compte"];

export interface DemandeAccesState {
  error: string | null;
  success: boolean;
  demandeId?: string;
  expireLe?: string; // ISO
}

export interface ConfirmationAccesState {
  error: string | null;
  success: boolean;
  patientId?: string;
}

function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

async function professionnelValide(userId: string) {
  const professionnel = await prisma.professionnelSante.findUnique({ where: { userId } });
  return professionnel && professionnel.statutValidation === "valide" ? professionnel : null;
}

const schemaDemande = z.object({
  mode: z.enum(MODES_RECHERCHE, "Choisissez NPI ou téléphone."),
  npi: z.string().trim(),
  telephone: z.string().trim(),
  dateNaissance: z.string().trim(),
  presence: z.literal("on", "Confirmez que le patient est présent devant vous."),
  motif: z.string().refine(estMotifAcces, "Motif de l'accès invalide."),
  dureeHeures: z.coerce.number().refine(estDureeAcces, "Durée d'accès invalide."),
});

async function trouverPatient(
  mode: ModeRecherche,
  critere: { npi: string; telephone: string; dateNaissance: Date }
) {
  if (mode === "npi") {
    const patient = await prisma.patient.findUnique({
      where: { referenceIdentiteNationale: critere.npi },
      include: { user: true },
    });
    return patient && STATUTS_PATIENT_JOIGNABLES.includes(patient.user.statut) ? patient : null;
  }

  // Un telephone peut etre partage (parent et enfant, jumeaux) : la date de
  // naissance departage, et une ambiguite residuelle vaut "pas de resultat"
  // plutot qu'un choix arbitraire entre deux dossiers.
  const candidats = await prisma.patient.findMany({
    where: { dateNaissance: critere.dateNaissance },
    include: { user: true },
  });
  const correspondants = candidats.filter(
    (candidat) =>
      STATUTS_PATIENT_JOIGNABLES.includes(candidat.user.statut) &&
      memeTelephoneBenin(candidat.user.telephone, critere.telephone)
  );
  return correspondants.length === 1 ? correspondants[0] : null;
}

/**
 * Etape 1 : le professionnel designe le patient. La reponse ne depend jamais
 * de l'existence du patient (RG-CLI-10).
 */
export async function demanderAccesDossierAction(
  _prevState: DemandeAccesState,
  formData: FormData
): Promise<DemandeAccesState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expirée. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "demande_acces_dossier"))) {
    return { error: "Action réservée aux médecins et infirmiers.", success: false };
  }

  const validation = schemaDemande.safeParse({
    mode: texte(formData, "mode"),
    npi: texte(formData, "npi"),
    telephone: texte(formData, "telephone"),
    dateNaissance: texte(formData, "dateNaissance"),
    presence: texte(formData, "presence"),
    motif: texte(formData, "motif"),
    dureeHeures: texte(formData, "dureeHeures"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Demande invalide.", success: false };
  }

  const { mode, motif, dureeHeures } = validation.data;
  let npi = "";
  let telephone = "";
  let dateNaissance = new Date(0);
  let valeurCritere: string;

  if (mode === "npi") {
    if (!(await estFonctionnaliteActive("access.by_npi"))) {
      return { error: "L'accès par NPI n'est pas activé sur cette plateforme.", success: false };
    }

    const npiNormalise = normaliserNpi(validation.data.npi);

    if (!npiNormalise) {
      return { error: `Le NPI comporte ${LONGUEUR_NPI} chiffres.`, success: false };
    }

    npi = npiNormalise;
    valeurCritere = npi;
  } else {
    const telephoneNormalise = normaliserTelephoneBenin(validation.data.telephone);

    if (!telephoneNormalise) {
      return { error: "Numéro de téléphone béninois invalide.", success: false };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(validation.data.dateNaissance)) {
      return { error: "Date de naissance invalide (AAAA-MM-JJ).", success: false };
    }

    dateNaissance = new Date(validation.data.dateNaissance);

    if (Number.isNaN(dateNaissance.getTime()) || dateNaissance > new Date()) {
      return { error: "Date de naissance invalide.", success: false };
    }

    telephone = telephoneNormalise;
    valeurCritere = `${telephone}|${validation.data.dateNaissance}`;
  }

  const professionnel = await professionnelValide(session.userId);

  if (!professionnel) {
    return { error: "Profil professionnel non valide pour cette action.", success: false };
  }

  const adresseTechnique = await adresseTechniqueCourante();
  const maintenant = Date.now();
  const empreinte = empreinteCritere(mode, valeurCritere, getEnv().NEXTAUTH_SECRET);

  try {
    const uneHeureAvant = new Date(maintenant - UNE_HEURE_MS);
    const [demandesRecentes, sansCorrespondanceRecentes] = await Promise.all([
      prisma.demandeAccesDossier.count({
        where: { demandeurId: session.userId, dateCreation: { gte: uneHeureAvant } },
      }),
      prisma.demandeAccesDossier.count({
        where: { demandeurId: session.userId, patientId: null, dateCreation: { gte: uneHeureAvant } },
      }),
    ]);

    if (
      demandesRecentes >= DEMANDES_MAX_PAR_PROFESSIONNEL_PAR_HEURE ||
      sansCorrespondanceRecentes >= SANS_CORRESPONDANCE_MAX_PAR_PROFESSIONNEL_PAR_HEURE
    ) {
      await journaliser({
        utilisateurId: session.userId,
        action: "acces_dossier_demande_limite",
        donneeConcernee: `critere:${empreinte.slice(0, 16)}`,
        adresseTechnique,
        justification: "Trop de demandes d'acces par code en une heure (protection contre le balayage).",
      });
      return { error: "Trop de demandes en peu de temps. Réessayez plus tard.", success: false };
    }

    let patient = await trouverPatient(mode, { npi, telephone, dateNaissance });

    if (patient && patient.userId === session.userId) {
      patient = null;
    }

    // Limites de protection du patient : au-dela, la demande se comporte
    // comme "aucun patient" (rien n'est envoye), sans rien signaler au
    // professionnel, et n'entre pas dans le compteur du patient (sinon un
    // seul demandeur pourrait epuiser la limite et lui fermer l'acces des autres).
    let limitationPatient = false;

    if (patient) {
      const [codesDuPatient, codesDuCouple] = await Promise.all([
        prisma.demandeAccesDossier.count({
          where: { patientId: patient.id, dateCreation: { gte: new Date(maintenant - VINGT_QUATRE_HEURES_MS) } },
        }),
        prisma.demandeAccesDossier.count({
          where: {
            patientId: patient.id,
            demandeurId: session.userId,
            dateCreation: { gte: new Date(maintenant - VINGT_QUATRE_HEURES_MS) },
          },
        }),
      ]);

      limitationPatient =
        codesDuPatient >= CODES_MAX_PAR_PATIENT_PAR_24H || codesDuCouple >= DEMANDES_MAX_PAR_COUPLE_PAR_24H;
    }

    const cible = patient && !limitationPatient ? patient : null;
    const signalDePresence = cible ? await aSignalDePresence(cible.id, professionnel.etablissementId) : false;
    const dureeEffective = dureeAccordee(dureeHeures, signalDePresence);
    const code = genererCodeNumerique();
    const codeHash = await bcrypt.hash(code, ROUNDS_BCRYPT);
    const expireLe = new Date(maintenant + DUREE_VALIDITE_CODE_MINUTES * 60_000);

    const demande = await prisma.$transaction(async (tx) => {
      if (cible) {
        await tx.demandeAccesDossier.updateMany({
          where: { demandeurId: session.userId, patientId: cible.id, statut: "en_attente" },
          data: { statut: "expire" },
        });
      }

      return tx.demandeAccesDossier.create({
        data: {
          demandeurId: session.userId,
          etablissementId: professionnel.etablissementId,
          patientId: cible?.id ?? null,
          modeRecherche: mode,
          empreinteCritere: empreinte,
          motif,
          dureeAccesHeures: dureeEffective,
          codeHash,
          expireLe,
        },
      });
    });

    await journaliser({
      utilisateurId: session.userId,
      action: limitationPatient ? "acces_dossier_demande_limitee" : "acces_dossier_demande",
      donneeConcernee: `demande_acces:${demande.id}`,
      adresseTechnique,
      justification: `Mode ${mode}, motif ${motif}, ${libelleDuree(dureeHeures)} demandees, presence attestee${cible ? `, signal de presence ${signalDePresence ? "oui" : "non"}, ${libelleDuree(dureeEffective)} accordees` : ""}, critere ${empreinte.slice(0, 16)}.`,
    });

    if (cible) {
      after(() => envoyerCodeDemande({ demandeId: demande.id, code, numeroEnvoi: 0 }));
    }

    return { error: null, success: true, demandeId: demande.id, expireLe: expireLe.toISOString() };
  } catch (erreur) {
    console.error("Erreur lors de la demande d'accès par code :", erreur instanceof Error ? erreur.name : "erreur");
    return { error: "Une erreur est survenue. Veuillez réessayer.", success: false };
  }
}

export interface StatutDemandeAcces {
  statut: "en_attente" | "accordee" | "refusee" | "expiree";
  patientId?: string;
}

/**
 * Etat d'une demande du professionnel connecte, sonde par l'ecran pendant
 * l'attente. Une demande sans patient reste "en_attente" puis devient
 * "expiree", exactement comme une demande dont le patient ne repond pas : rien
 * ne distingue les deux avant qu'un patient reel ait decide.
 */
export async function statutDemandeAccesAction(demandeId: string): Promise<StatutDemandeAcces | null> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "demande_acces_dossier"))) {
    return null;
  }

  const identifiant = demandeId.trim();

  if (identifiant.length === 0) {
    return null;
  }

  const demande = await prisma.demandeAccesDossier.findFirst({
    where: { id: identifiant, demandeurId: session.userId },
  });

  if (!demande) {
    return null;
  }

  if (demande.statut === "valide" && demande.patientId) {
    return { statut: "accordee", patientId: demande.patientId };
  }

  if (demande.statut === "refusee") {
    return { statut: "refusee" };
  }

  if (demande.statut !== "en_attente" || demande.expireLe <= new Date()) {
    return { statut: "expiree" };
  }

  return { statut: "en_attente" };
}

/**
 * Renvoie un nouveau code pour une demande en cours (l'ancien devient
 * invalide). Meme reponse que la demande, patient trouve ou non.
 */
export async function renvoyerCodeAccesAction(
  _prevState: DemandeAccesState,
  formData: FormData
): Promise<DemandeAccesState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expirée. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "demande_acces_dossier"))) {
    return { error: "Action réservée aux médecins et infirmiers.", success: false };
  }

  const demandeId = texte(formData, "demandeId").trim();
  const echec: DemandeAccesState = {
    error: "Cette demande n'est plus valable. Recommencez la recherche.",
    success: false,
  };

  if (demandeId.length === 0) {
    return echec;
  }

  try {
    const code = genererCodeNumerique();
    const codeHash = await bcrypt.hash(code, ROUNDS_BCRYPT);
    const expireLe = new Date(Date.now() + DUREE_VALIDITE_CODE_MINUTES * 60_000);

    const mise = await prisma.demandeAccesDossier.updateMany({
      where: {
        id: demandeId,
        demandeurId: session.userId,
        statut: "en_attente",
        expireLe: { gt: new Date() },
        renvois: { lt: RENVOIS_MAX_PAR_DEMANDE },
      },
      data: { codeHash, tentatives: 0, renvois: { increment: 1 }, expireLe },
    });

    if (mise.count === 0) {
      return echec;
    }

    const demande = await prisma.demandeAccesDossier.findUnique({ where: { id: demandeId } });

    if (demande?.patientId) {
      after(() => envoyerCodeDemande({ demandeId, code, numeroEnvoi: demande.renvois }));
    }

    return { error: null, success: true, demandeId, expireLe: expireLe.toISOString() };
  } catch (erreur) {
    console.error("Erreur lors du renvoi du code d'accès :", erreur instanceof Error ? erreur.name : "erreur");
    return { error: "Une erreur est survenue. Veuillez réessayer.", success: false };
  }
}

/**
 * Etape 2 : le professionnel saisit le code que le patient lui a dicte.
 * Toute cause d'echec (demande inconnue, expiree, bloquee, code faux, aucun
 * patient) produit le meme message.
 */
export async function confirmerCodeAccesAction(
  _prevState: ConfirmationAccesState,
  formData: FormData
): Promise<ConfirmationAccesState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expirée. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "update", "demande_acces_dossier"))) {
    return { error: "Action réservée aux médecins et infirmiers.", success: false };
  }

  const demandeId = texte(formData, "demandeId").trim();
  const code = normaliserCodeSaisi(texte(formData, "code"));
  const codeRefuse: ConfirmationAccesState = { error: "Code invalide ou expiré.", success: false };

  if (demandeId.length === 0 || !codeSaisiAuBonFormat(code)) {
    return { error: `Le code comporte ${LONGUEUR_CODE} chiffres.`, success: false };
  }

  const professionnel = await professionnelValide(session.userId);

  if (!professionnel) {
    return { error: "Profil professionnel non valide pour cette action.", success: false };
  }

  const adresseTechnique = await adresseTechniqueCourante();

  try {
    const echecsRecents = await prisma.journalAudit.count({
      where: {
        utilisateurId: session.userId,
        action: "acces_dossier_code_echec",
        date: { gte: new Date(Date.now() - UNE_HEURE_MS) },
      },
    });

    if (echecsRecents >= ECHECS_MAX_PAR_PROFESSIONNEL_PAR_HEURE) {
      return { error: "Trop de tentatives infructueuses. Réessayez dans une heure.", success: false };
    }

    const echouer = async (raison: string): Promise<ConfirmationAccesState> => {
      await journaliser({
        utilisateurId: session.userId,
        action: "acces_dossier_code_echec",
        donneeConcernee: `demande_acces:${demandeId.slice(0, 40)}`,
        adresseTechnique,
        justification: raison,
      });
      return codeRefuse;
    };

    const demande = await prisma.demandeAccesDossier.findFirst({
      where: { id: demandeId, demandeurId: session.userId },
      include: { patient: { include: { user: true } }, etablissement: true },
    });

    if (!demande) {
      return echouer("Demande introuvable.");
    }

    // Reservation atomique de l'essai avant toute comparaison : deux
    // soumissions simultanees ne peuvent pas depasser TENTATIVES_MAX_PAR_CODE.
    const reservation = await prisma.demandeAccesDossier.updateMany({
      where: {
        id: demande.id,
        statut: "en_attente",
        expireLe: { gt: new Date() },
        tentatives: { lt: TENTATIVES_MAX_PAR_CODE },
      },
      data: { tentatives: { increment: 1 } },
    });

    if (reservation.count === 0) {
      return echouer("Demande expiree, deja utilisee ou bloquee.");
    }

    const codeCorrect = await bcrypt.compare(code, demande.codeHash);

    if (!codeCorrect || !demande.patient) {
      if (demande.tentatives + 1 >= TENTATIVES_MAX_PAR_CODE) {
        await prisma.demandeAccesDossier.updateMany({
          where: { id: demande.id, statut: "en_attente" },
          data: { statut: "bloque" },
        });
      }
      return echouer("Code incorrect.");
    }

    const patient = demande.patient;

    const accorde = await prisma.$transaction((tx) =>
      accorderAcces(tx, {
        demande: { ...demande, patientId: patient.id },
        professionnelUserId: session.userId,
        adresseTechnique,
        voie: "code",
      })
    );

    if (!accorde) {
      return echouer("Demande deja utilisee.");
    }

    try {
      const professionnelUser = await prisma.user.findUnique({ where: { id: session.userId } });
      const nom = professionnelUser ? `${professionnelUser.prenom} ${professionnelUser.nom}` : "Un professionnel";
      await creerNotification(
        patient.userId,
        "acces_dossier_code",
        `${nom} (${demande.etablissement.nom}) a obtenu l'accès à votre dossier (${libelleDuree(demande.dureeAccesHeures)}). Vous pouvez retirer cet accès à tout moment.`,
        "/app/patient/consentements"
      );
    } catch {
      // La notification est un confort : l'acces est deja accorde et journalise.
    }

    return { error: null, success: true, patientId: patient.id };
  } catch (erreur) {
    console.error("Erreur lors de la confirmation du code d'accès :", erreur instanceof Error ? erreur.name : "erreur");
    return { error: "Une erreur est survenue. Veuillez réessayer.", success: false };
  }
}
