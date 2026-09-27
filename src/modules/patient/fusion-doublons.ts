"use server";

/**
 * Fusion de dossiers patient en doublon (F-ADM-06 du pack). Reserve a
 * admin_national : un doublon peut avoir ete cree dans deux etablissements
 * differents (creerPatientParProfessionnelAction ne detecte que les doublons
 * DANS le meme etablissement au moment de la creation, voir
 * src/modules/identity/actions.ts), donc la resolution a posteriori doit
 * rester une vue plateforme, jamais visible d'un seul admin_etablissement
 * (RG-CLI-3b : jamais le dossier complet d'un patient hors de son propre
 * perimetre pour un role qui n'y a pas normalement acces).
 *
 * Principe non negociable : une fusion ne supprime JAMAIS de donnee. Toutes
 * les ressources rattachees au dossier doublon (consultations, prescriptions,
 * examens, rendez-vous, vaccinations, documents, prises en charge
 * infirmieres, references, codes de partage et de reclamation, demandes
 * d'acces, jetons de carte sante, consentements) sont reassignees au dossier
 * conserve, dans une seule transaction. Le compte User du doublon passe au
 * statut "fusionne" (jamais supprime, meme principe que "sans_compte" et
 * "ferme" ailleurs dans ce depot) : plus jamais utilisable pour se connecter,
 * mais entierement tracable.
 *
 * RG-ADM-40 (reversibilite 30 jours) : chaque ligne effectivement deplacee est
 * enregistree dans FusionDossier.deplacements (table de correspondance), pour
 * que defusionnerAction() puisse tout ramener sans rien inventer. Un
 * consentement du dossier doublon vers un acteur qui a deja un consentement du
 * dossier principal violerait la contrainte d'unicite (patientId,
 * acteurAutoriseId) : il est alors laisse sur le doublon et trace dans
 * nonDeplaces, jamais force.
 *
 * RG-ADM-41 (seconde approbation) : une fusion entre deux dossiers de sexe ou
 * de date de naissance differents ne deplace rien tout de suite ; elle est
 * enregistree "en_attente" et n'execute le deplacement qu'apres l'approbation
 * d'un AUTRE administrateur (quatre yeux, meme principe que RG-ADM-30).
 */

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import {
  ecartsIdentite,
  exigeSecondeApprobation,
  JOURS_FENETRE_DEFUSION,
  LONGUEUR_MIN_JUSTIFICATION_FUSION,
  LONGUEUR_MIN_MOTIF_DEFUSION,
  LONGUEUR_MIN_MOTIF_IGNORE,
  paireCanonique,
  verifierApprobationFusion,
  verifierDefusion,
  verifierDemandeFusion,
  type EcartIdentite,
} from "./fusion-doublons-regles";

const ROUNDS_BCRYPT = 12;

/** Erreur metier attendue (ex. reclamation perdue), distincte d'une panne technique : message affichable sans detail. */
class ErreurMetier extends Error {}

/** Identite minimale d'un cote d'un candidat doublon, jamais le dossier complet (RG-ACC-44). */
export interface CoteDoublon {
  patientId: string;
  nomComplet: string;
  identifiantSante: string;
  dateNaissance: string; // ISO
  sexe: string;
  dateCreationCompte: string; // ISO
  nombreConsultations: number;
  nombrePrescriptions: number;
  nombreRendezVous: number;
}

/** Paire de dossiers patient candidate a une fusion (memes nom/prenom/date de naissance normalises). */
export interface CandidatDoublon {
  a: CoteDoublon;
  b: CoteDoublon;
}

function normaliserPourComparaison(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function nomComplet(utilisateur: { nom: string; prenom: string }): string {
  return `${utilisateur.prenom} ${utilisateur.nom}`;
}

async function getSessionAdminNationale(action: "read" | "update"): Promise<{ userId: string } | null> {
  const session = await getSession();
  if (!session || !session.roles.some((role) => can(role, action, "doublon_patient"))) {
    return null;
  }
  return session;
}

/**
 * Detecte les paires de dossiers patient dont nom, prenom et date de
 * naissance normalises correspondent exactement (meme regle que le doublon
 * detecte a la creation, voir normaliserPourComparaison dans
 * src/modules/identity/actions.ts), en excluant tout dossier deja fusionne,
 * toute paire deja marquee "ce ne sont pas les memes personnes" et toute
 * paire deja engagee dans une fusion active ou en attente. Cout en O(n) sur
 * le nombre de patients : suffisant pour le volume de ce MVP, a revisiter
 * avec un index dedie si le nombre de patients grandit beaucoup (meme choix
 * assume que calculerRepartitionParEtablissement, src/modules/analytics/actions.ts).
 */
export async function detecterDoublonsPatients(): Promise<CandidatDoublon[]> {
  if (!(await getSessionAdminNationale("read"))) {
    return [];
  }

  const [patients, ignorees, engagees] = await Promise.all([
    prisma.patient.findMany({
      where: { user: { statut: { not: "fusionne" } } },
      include: { user: true, _count: { select: { consultations: true, prescriptions: true, rendezVous: true } } },
      orderBy: { user: { dateCreation: "asc" } },
    }),
    prisma.paireDoublonIgnoree.findMany({ select: { patientAId: true, patientBId: true } }),
    prisma.fusionDossier.findMany({ where: { statut: { in: ["active", "en_attente"] } }, select: { patientSecondaireId: true } }),
  ]);

  const pairesIgnorees = new Set(ignorees.map((ligne) => `${ligne.patientAId}|${ligne.patientBId}`));
  const secondairesEngages = new Set(engagees.map((ligne) => ligne.patientSecondaireId));

  const groupes = new Map<string, typeof patients>();

  for (const patient of patients) {
    if (secondairesEngages.has(patient.id)) continue;
    const cle = [
      normaliserPourComparaison(patient.user.nom),
      normaliserPourComparaison(patient.user.prenom),
      patient.dateNaissance.toISOString().slice(0, 10),
    ].join("|");

    const groupe = groupes.get(cle) ?? [];
    groupe.push(patient);
    groupes.set(cle, groupe);
  }

  const candidats: CandidatDoublon[] = [];

  for (const groupe of groupes.values()) {
    if (groupe.length < 2) continue;

    // Plus de deux dossiers identiques : signale chaque paire successive
    // (0-1, 1-2, ...) plutot que toutes les combinaisons, pour ne pas noyer
    // l'ecran d'un cas rare avec un nombre de paires qui explose.
    for (let i = 0; i < groupe.length - 1; i += 1) {
      const a = groupe[i];
      const b = groupe[i + 1];
      if (pairesIgnorees.has(paireCanonique(a.id, b.id).join("|"))) continue;

      candidats.push({
        a: {
          patientId: a.id,
          nomComplet: nomComplet(a.user),
          identifiantSante: a.identifiantSante,
          dateNaissance: a.dateNaissance.toISOString(),
          sexe: a.sexe,
          dateCreationCompte: a.user.dateCreation.toISOString(),
          nombreConsultations: a._count.consultations,
          nombrePrescriptions: a._count.prescriptions,
          nombreRendezVous: a._count.rendezVous,
        },
        b: {
          patientId: b.id,
          nomComplet: nomComplet(b.user),
          identifiantSante: b.identifiantSante,
          dateNaissance: b.dateNaissance.toISOString(),
          sexe: b.sexe,
          dateCreationCompte: b.user.dateCreation.toISOString(),
          nombreConsultations: b._count.consultations,
          nombrePrescriptions: b._count.prescriptions,
          nombreRendezVous: b._count.rendezVous,
        },
      });
    }
  }

  return candidats;
}

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    const adresse = listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? null;
    return adresse ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/** Etat renvoye par fusionnerPatientsAction, consomme via useActionState. */
export interface FusionActionState {
  error: string | null;
  success: boolean;
  /** Vrai quand la fusion n'est pas executee mais enregistree, en attente d'un second administrateur (RG-ADM-41). */
  enAttente?: boolean;
}

const schemaFusion = z.object({
  patientConserveId: z.string().trim().min(1, "Le dossier a conserver est obligatoire."),
  patientDoublonId: z.string().trim().min(1, "Le dossier doublon est obligatoire."),
  justification: z
    .string()
    .trim()
    .min(LONGUEUR_MIN_JUSTIFICATION_FUSION, `La justification doit comporter au moins ${LONGUEUR_MIN_JUSTIFICATION_FUSION} caracteres.`),
});

// Tables deplacees en bloc (aucune contrainte d'unicite sur patientId) : chaque cle est le nom
// enregistre dans FusionDossier.deplacements, chaque valeur le delegate Prisma correspondant.
/** Vue minimale d'un delegate Prisma suffisante pour deplacer des lignes par patientId. */
interface ModeleDeplacable {
  findMany(args: { where: { patientId: string }; select: { id: true } }): Promise<{ id: string }[]>;
  updateMany(args: { where: { id: { in: string[] } }; data: { patientId: string } }): Promise<unknown>;
}

function tablesDeplacables(tx: Prisma.TransactionClient): { cle: string; modele: ModeleDeplacable }[] {
  return [
    { cle: "rendezVous", modele: tx.rendezVous },
    { cle: "consultations", modele: tx.consultation },
    { cle: "prescriptions", modele: tx.prescription },
    { cle: "examensMedicaux", modele: tx.examenMedical },
    { cle: "suivisCommunautaires", modele: tx.suiviCommunautaire },
    { cle: "vaccinations", modele: tx.vaccination },
    { cle: "documentsMedicaux", modele: tx.documentMedical },
    { cle: "prisesEnChargeInfirmieres", modele: tx.priseEnChargeInfirmiere },
    { cle: "references", modele: tx.referencePatient },
    { cle: "codesPartage", modele: tx.codePartageDossier },
    { cle: "codesReclamation", modele: tx.codeReclamationDossier },
    { cle: "demandesAccesDossier", modele: tx.demandeAccesDossier },
    { cle: "jetonsCarteSante", modele: tx.jetonCarteSante },
  ] as unknown as { cle: string; modele: ModeleDeplacable }[];
}

export interface ResultatDeplacement {
  deplacements: Record<string, string[]>;
  nonDeplaces: Record<string, string[]>;
}

/**
 * Deplace effectivement les ressources du dossier secondaire vers le
 * principal, dans la transaction de l'appelant. RG-ADM-40 : chaque id deplace
 * est enregistre, pour que defusionnerAction() puisse tout ramener sans
 * jamais avoir a deviner ce qui a bouge.
 */
async function deplacerRessourcesPatient(
  tx: Prisma.TransactionClient,
  principalId: string,
  secondaireId: string
): Promise<ResultatDeplacement> {
  const deplacements: Record<string, string[]> = {};
  const nonDeplaces: Record<string, string[]> = {};

  for (const { cle, modele } of tablesDeplacables(tx)) {
    const lignes = await modele.findMany({ where: { patientId: secondaireId }, select: { id: true } });
    if (lignes.length === 0) continue;
    const ids = lignes.map((ligne) => ligne.id);
    await modele.updateMany({ where: { id: { in: ids } }, data: { patientId: principalId } });
    deplacements[cle] = ids;
  }

  // Consentement : contrainte d'unicite (patientId, acteurAutoriseId) - un conflit reste sur le secondaire plutot que d'etre force.
  const consentements = await tx.consentement.findMany({ where: { patientId: secondaireId } });
  const consentementsDeplaces: string[] = [];
  const consentementsNonDeplaces: string[] = [];
  for (const consentement of consentements) {
    const conflit = await tx.consentement.findUnique({
      where: { patientId_acteurAutoriseId: { patientId: principalId, acteurAutoriseId: consentement.acteurAutoriseId } },
    });
    if (conflit) {
      consentementsNonDeplaces.push(consentement.id);
      continue;
    }
    await tx.consentement.update({ where: { id: consentement.id }, data: { patientId: principalId } });
    consentementsDeplaces.push(consentement.id);
  }
  if (consentementsDeplaces.length > 0) deplacements.consentements = consentementsDeplaces;
  if (consentementsNonDeplaces.length > 0) nonDeplaces.consentements = consentementsNonDeplaces;

  return { deplacements, nonDeplaces };
}

/** Ramene dans la transaction de l'appelant chaque id deplace vers le dossier secondaire (RG-ADM-40). */
async function ramenerRessourcesPatient(tx: Prisma.TransactionClient, secondaireId: string, deplacements: Record<string, string[]>): Promise<void> {
  const modeles = new Map<string, ModeleDeplacable>(tablesDeplacables(tx).map((table) => [table.cle, table.modele]));
  modeles.set("consentements", tx.consentement as unknown as ModeleDeplacable);

  for (const [cle, ids] of Object.entries(deplacements)) {
    const modele = modeles.get(cle);
    if (!modele || ids.length === 0) continue;
    await modele.updateMany({ where: { id: { in: ids } }, data: { patientId: secondaireId } });
  }
}

function compteurs(deplacements: Record<string, string[]>): Record<string, number> {
  return Object.fromEntries(Object.entries(deplacements).map(([cle, ids]) => [cle, ids.length]));
}

/**
 * Demande une fusion de deux dossiers patient. Sans ecart d'identite, la
 * fusion s'execute immediatement. Avec un ecart de sexe ou de date de
 * naissance (RG-ADM-41), rien n'est deplace : la demande attend un AUTRE
 * administrateur (approuverFusionAction).
 */
export async function fusionnerPatientsAction(prevState: FusionActionState, formData: FormData): Promise<FusionActionState> {
  const session = await getSessionAdminNationale("update");
  if (!session) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaFusion.safeParse({
    patientConserveId: formData.get("patientConserveId"),
    patientDoublonId: formData.get("patientDoublonId"),
    justification: formData.get("justification"),
  });
  if (!validation.success) {
    return { error: premierMessageErreur(validation.error, "Donnees de fusion invalides."), success: false };
  }
  const { patientConserveId, patientDoublonId, justification } = validation.data;

  try {
    const [patientConserve, patientDoublon, doublonEngageAilleurs] = await Promise.all([
      prisma.patient.findUnique({ where: { id: patientConserveId }, include: { user: true } }),
      prisma.patient.findUnique({ where: { id: patientDoublonId }, include: { user: true } }),
      prisma.fusionDossier.findFirst({ where: { patientSecondaireId: patientDoublonId, statut: { in: ["active", "en_attente"] } } }),
    ]);

    if (!patientConserve || !patientDoublon) {
      return { error: "Un des deux dossiers est introuvable.", success: false };
    }

    const erreurGarde = verifierDemandeFusion({
      patientConserveId,
      patientDoublonId,
      statutCompteDoublon: patientDoublon.user.statut,
      doublonEstDejaSecondaireActif: doublonEngageAilleurs !== null,
    });
    if (erreurGarde) {
      return { error: erreurGarde, success: false };
    }

    const ecarts = ecartsIdentite(patientConserve, patientDoublon);
    const adresseTechnique = await adresseTechniqueCourante();

    if (exigeSecondeApprobation(ecarts)) {
      await prisma.fusionDossier.create({
        data: {
          patientPrincipalId: patientConserveId,
          patientSecondaireId: patientDoublonId,
          userSecondaireId: patientDoublon.userId,
          statutCompteAvant: patientDoublon.user.statut,
          fusionneParId: session.userId,
          ecartsIdentite: ecarts.join(","),
          justification,
          statut: "en_attente",
        },
      });
      await journaliser({
        utilisateurId: session.userId,
        action: "demande_fusion_dossiers_patient",
        donneeConcernee: `patient:${patientConserveId}<-patient:${patientDoublonId}`,
        adresseTechnique,
        justification: `Fusion demandee (${ecarts.join(", ")} different(s)), en attente d'un second administrateur. ${justification}`,
      });
      return { error: null, success: true, enAttente: true };
    }

    await executerFusion({ patientConserve, patientDoublon, fusionneParId: session.userId, justification, ecarts, adresseTechnique });
    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la fusion de dossiers patient :", erreur);
    return { error: "Une erreur est survenue lors de la fusion. Veuillez reessayer.", success: false };
  }
}

interface PatientAvecUser {
  id: string;
  userId: string;
  identifiantSante: string;
  user: { id: string; statut: string };
}

/**
 * Execute reellement le deplacement (immediat, ou a l'approbation) dans une
 * seule transaction. Avec `fusionExistanteId` (cas de l'approbation), la
 * ligne "en_attente" est d'abord reclamee par une mise a jour conditionnelle
 * puis completee sur PLACE : jamais de suppression puis recreation, pour
 * qu'un crash entre les deux n'aboutisse jamais a une ligne "active" sans ses
 * deplacements.
 */
async function executerFusion(params: {
  patientConserve: PatientAvecUser;
  patientDoublon: PatientAvecUser;
  fusionneParId: string;
  approuveParId?: string;
  justification: string;
  ecarts: EcartIdentite[];
  adresseTechnique: string;
  fusionExistanteId?: string;
}): Promise<void> {
  const { patientConserve, patientDoublon, fusionneParId, approuveParId, justification, ecarts, adresseTechnique, fusionExistanteId } = params;
  const motDePasseHash = await bcrypt.hash(randomUUID() + randomUUID(), ROUNDS_BCRYPT);
  const maintenant = new Date();
  const defusionLimiteLe = new Date(maintenant.getTime() + JOURS_FENETRE_DEFUSION * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    if (fusionExistanteId) {
      const reclamation = await tx.fusionDossier.updateMany({ where: { id: fusionExistanteId, statut: "en_attente" }, data: { statut: "active" } });
      if (reclamation.count !== 1) throw new ErreurMetier("Cette demande a déjà été traitée.");
    }

    const resultat = await deplacerRessourcesPatient(tx, patientConserve.id, patientDoublon.id);

    await tx.user.update({ where: { id: patientDoublon.userId }, data: { statut: "fusionne", motDePasseHash } });

    const donneesFusion = {
      approuveParId,
      dateExecution: maintenant,
      defusionLimiteLe,
      deplacements: resultat.deplacements,
      nonDeplaces: Object.keys(resultat.nonDeplaces).length > 0 ? resultat.nonDeplaces : undefined,
    };

    if (fusionExistanteId) {
      await tx.fusionDossier.update({ where: { id: fusionExistanteId }, data: donneesFusion });
    } else {
      await tx.fusionDossier.create({
        data: {
          patientPrincipalId: patientConserve.id,
          patientSecondaireId: patientDoublon.id,
          userSecondaireId: patientDoublon.userId,
          statutCompteAvant: patientDoublon.user.statut,
          fusionneParId,
          ecartsIdentite: ecarts.join(","),
          justification,
          statut: "active",
          ...donneesFusion,
        },
      });
    }

    await journaliser(
      {
        utilisateurId: approuveParId ?? fusionneParId,
        action: "fusion_dossiers_patient",
        donneeConcernee: `patient:${patientConserve.id}<-patient:${patientDoublon.id}`,
        adresseTechnique,
        justification: `Fusion vers ${patientConserve.identifiantSante} depuis ${patientDoublon.identifiantSante} : ${justification}. Deplace : ${JSON.stringify(compteurs(resultat.deplacements))}.${
          Object.keys(resultat.nonDeplaces).length > 0 ? ` Non deplace (conflit) : ${JSON.stringify(compteurs(resultat.nonDeplaces))}.` : ""
        }`,
      },
      tx
    );
  });

  // F-ADM-06 : les deux patients sont notifies (apres commit, RG-NOT-03).
  await Promise.all([
    creerNotification(patientConserve.user.id, "fusion_dossier", "Votre dossier a absorbé un dossier en doublon. Le contenu des deux dossiers est conservé.", undefined, { codeCatalogue: "N-MERGE" }),
    creerNotification(patientDoublon.user.id, "fusion_dossier", "Votre dossier a été fusionné avec un autre dossier. Vos données sont conservées et rattachées au dossier principal.", undefined, { codeCatalogue: "N-MERGE" }),
  ]);
}

export interface FusionEnAttenteResume {
  id: string;
  principal: CoteDoublon;
  secondaire: CoteDoublon;
  ecarts: string[];
  justification: string;
  demandePar: string;
  dateDemande: string;
  estDemandeParMoi: boolean;
}

async function chargerCoteDoublon(patientId: string): Promise<CoteDoublon | null> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { user: true, _count: { select: { consultations: true, prescriptions: true, rendezVous: true } } },
  });
  if (!patient) return null;
  return {
    patientId: patient.id,
    nomComplet: nomComplet(patient.user),
    identifiantSante: patient.identifiantSante,
    dateNaissance: patient.dateNaissance.toISOString(),
    sexe: patient.sexe,
    dateCreationCompte: patient.user.dateCreation.toISOString(),
    nombreConsultations: patient._count.consultations,
    nombrePrescriptions: patient._count.prescriptions,
    nombreRendezVous: patient._count.rendezVous,
  };
}

/** Fusions en attente d'une seconde approbation (RG-ADM-41), la plus ancienne d'abord. */
export async function getFusionsEnAttente(): Promise<FusionEnAttenteResume[] | null> {
  const session = await getSessionAdminNationale("read");
  if (!session) return null;

  const demandes = await prisma.fusionDossier.findMany({ where: { statut: "en_attente" }, orderBy: { dateDemande: "asc" } });
  if (demandes.length === 0) return [];

  const idsDemandeurs = [...new Set(demandes.map((demande) => demande.fusionneParId))];
  const demandeurs = await prisma.user.findMany({ where: { id: { in: idsDemandeurs } }, select: { id: true, nom: true, prenom: true } });
  const nomDemandeur = new Map(demandeurs.map((demandeur) => [demandeur.id, nomComplet(demandeur)]));

  const resultats: FusionEnAttenteResume[] = [];
  for (const demande of demandes) {
    const [principal, secondaire] = await Promise.all([chargerCoteDoublon(demande.patientPrincipalId), chargerCoteDoublon(demande.patientSecondaireId)]);
    if (!principal || !secondaire) continue;
    resultats.push({
      id: demande.id,
      principal,
      secondaire,
      ecarts: demande.ecartsIdentite.split(",").filter((ecart) => ecart.length > 0),
      justification: demande.justification,
      demandePar: nomDemandeur.get(demande.fusionneParId) ?? "Administrateur",
      dateDemande: demande.dateDemande.toISOString(),
      estDemandeParMoi: demande.fusionneParId === session.userId,
    });
  }
  return resultats;
}

export interface DecisionFusionActionState {
  error: string | null;
  success: boolean;
}

const schemaDecisionFusion = z.object({ fusionId: z.string().trim().min(1, "La demande est obligatoire.") });

/** Approuve une fusion en attente (RG-ADM-41) : execute reellement le deplacement, par un AUTRE administrateur que le demandeur. */
export async function approuverFusionAction(prevState: DecisionFusionActionState, formData: FormData): Promise<DecisionFusionActionState> {
  const session = await getSessionAdminNationale("update");
  if (!session) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaDecisionFusion.safeParse({ fusionId: formData.get("fusionId") });
  if (!validation.success) {
    return { error: premierMessageErreur(validation.error, "Demande invalide."), success: false };
  }

  try {
    const demande = await prisma.fusionDossier.findUnique({ where: { id: validation.data.fusionId } });
    if (!demande) return { error: "Demande de fusion introuvable.", success: false };

    const erreurGarde = verifierApprobationFusion({ statut: demande.statut, demandeParId: demande.fusionneParId, approbateurId: session.userId });
    if (erreurGarde) return { error: erreurGarde, success: false };

    const [patientConserve, patientDoublon] = await Promise.all([
      prisma.patient.findUnique({ where: { id: demande.patientPrincipalId }, include: { user: true } }),
      prisma.patient.findUnique({ where: { id: demande.patientSecondaireId }, include: { user: true } }),
    ]);
    if (!patientConserve || !patientDoublon) return { error: "Un des deux dossiers n'existe plus.", success: false };
    if (patientDoublon.user.statut === "fusionne") return { error: "Ce dossier a déjà été fusionné ailleurs.", success: false };

    await executerFusion({
      patientConserve,
      patientDoublon,
      fusionneParId: demande.fusionneParId,
      approuveParId: session.userId,
      justification: demande.justification,
      ecarts: demande.ecartsIdentite.split(",").filter((ecart): ecart is EcartIdentite => ecart.length > 0),
      adresseTechnique: await adresseTechniqueCourante(),
      fusionExistanteId: demande.id,
    });

    return { error: null, success: true };
  } catch (erreur) {
    if (erreur instanceof ErreurMetier) return { error: erreur.message, success: false };
    console.error("Erreur lors de l'approbation d'une fusion :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaRefus = z.object({
  fusionId: z.string().trim().min(1, "La demande est obligatoire."),
  motif: z.string().trim().min(5, "Le motif du refus doit comporter au moins 5 caractères."),
});

/** Refuse une fusion en attente : rien n'a jamais ete deplace, la paire redevient proposable. */
export async function refuserFusionAction(prevState: DecisionFusionActionState, formData: FormData): Promise<DecisionFusionActionState> {
  const session = await getSessionAdminNationale("update");
  if (!session) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaRefus.safeParse({ fusionId: formData.get("fusionId"), motif: formData.get("motif") });
  if (!validation.success) {
    return { error: premierMessageErreur(validation.error, "Donnees invalides."), success: false };
  }

  try {
    const demande = await prisma.fusionDossier.findUnique({ where: { id: validation.data.fusionId } });
    if (!demande) return { error: "Demande de fusion introuvable.", success: false };

    const erreurGarde = verifierApprobationFusion({ statut: demande.statut, demandeParId: demande.fusionneParId, approbateurId: session.userId });
    if (erreurGarde) return { error: erreurGarde, success: false };

    const adresseTechnique = await adresseTechniqueCourante();
    await prisma.$transaction(async (tx) => {
      const reclamation = await tx.fusionDossier.updateMany({
        where: { id: demande.id, statut: "en_attente" },
        data: { statut: "refusee", refuseParId: session.userId, motifRefus: validation.data.motif },
      });
      if (reclamation.count !== 1) throw new ErreurMetier("Cette demande a déjà été traitée.");

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "refus_fusion_dossiers_patient",
          donneeConcernee: `patient:${demande.patientPrincipalId}<-patient:${demande.patientSecondaireId}`,
          adresseTechnique,
          justification: `Fusion refusee : ${validation.data.motif}`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    if (erreur instanceof ErreurMetier) return { error: erreur.message, success: false };
    console.error("Erreur lors du refus d'une fusion :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaIgnorer = z.object({
  patientAId: z.string().trim().min(1),
  patientBId: z.string().trim().min(1),
  motif: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default("")
    .refine((valeur) => valeur.length === 0 || valeur.length >= LONGUEUR_MIN_MOTIF_IGNORE, {
      message: `Le motif, s'il est renseigné, doit comporter au moins ${LONGUEUR_MIN_MOTIF_IGNORE} caractères.`,
    }),
});

/** "Ce ne sont pas les memes personnes" (F-ADM-06) : la paire n'est plus jamais proposee. */
export async function ignorerDoublonAction(prevState: FusionActionState, formData: FormData): Promise<FusionActionState> {
  const session = await getSessionAdminNationale("update");
  if (!session) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaIgnorer.safeParse({
    patientAId: formData.get("patientAId"),
    patientBId: formData.get("patientBId"),
    motif: formData.get("motif") ?? undefined,
  });
  if (!validation.success) {
    return { error: premierMessageErreur(validation.error, "Donnees invalides."), success: false };
  }
  if (validation.data.patientAId === validation.data.patientBId) {
    return { error: "Les deux dossiers doivent être différents.", success: false };
  }

  const [patientAId, patientBId] = paireCanonique(validation.data.patientAId, validation.data.patientBId);

  try {
    await prisma.paireDoublonIgnoree.upsert({
      where: { patientAId_patientBId: { patientAId, patientBId } },
      update: {},
      create: { patientAId, patientBId, ignoreParId: session.userId, motif: validation.data.motif || null },
    });
    await journaliser({
      utilisateurId: session.userId,
      action: "doublon_ignore",
      donneeConcernee: `patient:${patientAId}~patient:${patientBId}`,
      adresseTechnique: await adresseTechniqueCourante(),
      justification: `Marque "pas les memes personnes"${validation.data.motif ? ` : ${validation.data.motif}` : "."}`,
    });
    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du marquage d'une paire comme non-doublon :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

export interface FusionActiveResume {
  id: string;
  principal: CoteDoublon;
  secondaire: CoteDoublon;
  dateExecution: string;
  defusionLimiteLe: string;
  justification: string;
}

/** Fusions actives encore dans la fenetre de defusion (RG-ADM-40), les plus recentes d'abord. */
export async function getFusionsActives(): Promise<FusionActiveResume[] | null> {
  if (!(await getSessionAdminNationale("read"))) return null;

  const fusions = await prisma.fusionDossier.findMany({
    where: { statut: "active", defusionLimiteLe: { gt: new Date() } },
    orderBy: { dateExecution: "desc" },
  });

  const resultats: FusionActiveResume[] = [];
  for (const fusion of fusions) {
    const [principal, secondaire] = await Promise.all([chargerCoteDoublon(fusion.patientPrincipalId), chargerCoteDoublon(fusion.patientSecondaireId)]);
    if (!principal || !secondaire || !fusion.dateExecution || !fusion.defusionLimiteLe) continue;
    resultats.push({
      id: fusion.id,
      principal,
      secondaire,
      dateExecution: fusion.dateExecution.toISOString(),
      defusionLimiteLe: fusion.defusionLimiteLe.toISOString(),
      justification: fusion.justification,
    });
  }
  return resultats;
}

const schemaDefusion = z.object({
  fusionId: z.string().trim().min(1, "La fusion est obligatoire."),
  motif: z.string().trim().min(LONGUEUR_MIN_MOTIF_DEFUSION, `Le motif doit comporter au moins ${LONGUEUR_MIN_MOTIF_DEFUSION} caracteres.`),
});

/**
 * Defusionne (RG-ADM-40) : ramene chaque element deplace vers le dossier
 * secondaire et restaure le statut de son compte. Le mot de passe du compte
 * secondaire, remplace par une valeur aleatoire au moment de la fusion,
 * n'est jamais retrouvable : son titulaire devra passer par "mot de passe
 * oublie" pour se reconnecter.
 */
export async function defusionnerAction(prevState: FusionActionState, formData: FormData): Promise<FusionActionState> {
  const session = await getSessionAdminNationale("update");
  if (!session) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaDefusion.safeParse({ fusionId: formData.get("fusionId"), motif: formData.get("motif") });
  if (!validation.success) {
    return { error: premierMessageErreur(validation.error, "Donnees invalides."), success: false };
  }

  try {
    const fusion = await prisma.fusionDossier.findUnique({ where: { id: validation.data.fusionId } });
    if (!fusion) return { error: "Fusion introuvable.", success: false };

    const erreurGarde = verifierDefusion({ statut: fusion.statut, defusionLimiteLe: fusion.defusionLimiteLe ?? new Date(0), maintenant: new Date() });
    if (erreurGarde) return { error: erreurGarde, success: false };

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      const reclamation = await tx.fusionDossier.updateMany({
        where: { id: fusion.id, statut: "active" },
        data: { statut: "annulee", dateDefusion: new Date(), defusionneParId: session.userId, motifDefusion: validation.data.motif },
      });
      if (reclamation.count !== 1) throw new ErreurMetier("Cette fusion a déjà été défusionnée.");

      await ramenerRessourcesPatient(tx, fusion.patientSecondaireId, (fusion.deplacements as Record<string, string[]>) ?? {});
      await tx.user.update({ where: { id: fusion.userSecondaireId }, data: { statut: fusion.statutCompteAvant } });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "defusion_dossiers_patient",
          donneeConcernee: `patient:${fusion.patientPrincipalId}<-patient:${fusion.patientSecondaireId}`,
          adresseTechnique,
          justification: `Fusion annulee : ${validation.data.motif}. Deplace de retour : ${JSON.stringify(compteurs((fusion.deplacements as Record<string, string[]>) ?? {}))}.`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    if (erreur instanceof ErreurMetier) return { error: erreur.message, success: false };
    console.error("Erreur lors de la defusion :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
