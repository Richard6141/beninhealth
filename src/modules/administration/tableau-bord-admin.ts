"use server";

/**
 * Files d'attente et etat technique du tableau de bord administrateur
 * (F-ADM-01 du pack, "Gerer la plateforme"), role PLATFORM_ADMIN absent de
 * ce depot, route vers admin_national (meme adaptation que le reste du
 * module administration).
 *
 * Composition du pack : files a traiter (professionnels a valider, doublons
 * a revoir, etablissements en brouillon, reinitialisations 2FA demandees),
 * etat technique (derniere execution des taches planifiees, taille de la
 * file SMS, erreurs 24h), volumetrie (comptes par role, etablissements par
 * statut).
 *
 * Perimetre reduit et honnete, coherent avec les decisions produit deja
 * prises ce soir (voir docs/audit-cote-administration.md, point 4) :
 * - "Professionnels a valider" : compte les professionnels cliniques jamais
 *   verifies aupres de l'Ordre ou a revalider (F-ADM-03, decision produit du
 *   soir du 2026-09-26 : le validateur du ministere, voir
 *   validation-professionnels.ts). Les comptes crees par un etablissement
 *   restent actifs des leur creation, la file ne bloque personne.
 * - "Reinitialisations 2FA en attente" : demandes de reinitialisation du
 *   second facteur d'un compte administrateur qui attendent la confirmation
 *   d'un second administrateur (F-ADM-05, RG-ADM-30, voir
 *   gestion-comptes-nationale.ts), plus le total des demandes en attente.
 * - "File SMS" : SMS differes en attente de remise et SMS deposes dans la
 *   boite d'envoi simulee sur 24 h (aucun fournisseur reel, F-NOT-02).
 * - "Erreurs des dernieres 24h" et "derniere execution" des taches
 *   planifiees en process : lues dans ExecutionTache (executions-taches.ts),
 *   qui ne trace QUE ces taches, pas les erreurs des requetes des utilisateurs
 *   (uniquement console.error, jamais persistees).
 * - "Comptes par role" : comptes actifs par role.
 */

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { detecterDoublonsPatients } from "@/modules/patient/fusion-doublons";
import { getEtablissementsAdmin } from "./etablissements";
import { getDemandesPersonnes } from "@/modules/audit/demandes";
import { PROFESSIONS_CLINIQUES } from "@/modules/identity/identite-professionnelle";
import { attendUneAction, etatVerification } from "./validation-professionnels-regles";
import { LIBELLES_TACHES } from "./executions-taches";

async function compterProfessionnelsAVerifier(): Promise<number> {
  const professionnels = await prisma.professionnelSante.findMany({
    where: { user: { roles: { some: { nom: { in: [...PROFESSIONS_CLINIQUES] } } } } },
    select: { statutValidation: true, validationDecision: true, ordreVerifieLe: true },
  });
  const maintenant = new Date();
  return professionnels.filter((professionnel) => attendUneAction(etatVerification(professionnel, maintenant))).length;
}

export interface ExecutionTacheResume {
  tache: string;
  libelle: string;
  /** ISO, ou null si la tache n'a encore jamais ete executee. */
  derniereExecution: string | null;
  dernierStatut: "ok" | "erreur" | null;
  nombreTraite: number | null;
  /** Message technique de la derniere erreur (tronque), sinon null. */
  dernierMessage: string | null;
}

export interface CompteParRole {
  role: string;
  nombre: number;
}

export interface FilesAttenteAdmin {
  acces: boolean;
  doublonsPatientsEnAttente: number;
  etablissementsEnBrouillon: number;
  demandesPersonnesEnAttente: number;
  /** F-ADM-03 : professionnels cliniques jamais verifies aupres de l'Ordre ou a revalider. */
  professionnelsAVerifier: number;
  /** ISO, ou null si aucune tache planifiee n'a encore ete executee. */
  derniereExecutionPlanificateur: string | null;
  tachesPilotageEnAttente: number;
  /** F-ADM-05 : demandes en attente de confirmation par un second administrateur (quatre yeux). */
  demandesComptesEnAttente: number;
  /** Dont reinitialisations du second facteur. */
  reinitialisations2faEnAttente: number;
  /** F-NOT-02 : SMS differes (RG-NOT-04) pas encore remis. */
  smsDifferesEnAttente: number;
  /** SMS deposes dans la boite d'envoi simulee sur les dernieres 24 h. */
  smsDeposes24h: number;
  /** Executions de taches planifiees en erreur sur les dernieres 24 h. */
  erreursTaches24h: number;
  executionsTaches: ExecutionTacheResume[];
  comptesParRole: CompteParRole[];
}

const ACCES_REFUSE: FilesAttenteAdmin = {
  acces: false,
  doublonsPatientsEnAttente: 0,
  etablissementsEnBrouillon: 0,
  demandesPersonnesEnAttente: 0,
  professionnelsAVerifier: 0,
  derniereExecutionPlanificateur: null,
  tachesPilotageEnAttente: 0,
  demandesComptesEnAttente: 0,
  reinitialisations2faEnAttente: 0,
  smsDifferesEnAttente: 0,
  smsDeposes24h: 0,
  erreursTaches24h: 0,
  executionsTaches: [],
  comptesParRole: [],
};

async function lireExecutionsTaches(): Promise<ExecutionTacheResume[]> {
  return Promise.all(
    Object.entries(LIBELLES_TACHES).map(async ([tache, libelle]) => {
      const derniere = await prisma.executionTache.findFirst({
        where: { tache },
        orderBy: { date: "desc" },
        select: { date: true, statut: true, nombreTraite: true, message: true },
      });
      return {
        tache,
        libelle,
        derniereExecution: derniere?.date.toISOString() ?? null,
        dernierStatut: derniere ? (derniere.statut === "erreur" ? ("erreur" as const) : ("ok" as const)) : null,
        nombreTraite: derniere?.nombreTraite ?? null,
        dernierMessage: derniere?.statut === "erreur" ? derniere.message : null,
      };
    })
  );
}

async function lireComptesParRole(): Promise<CompteParRole[]> {
  const groupes = await prisma.userRole.groupBy({
    by: ["nom"],
    where: { user: { statut: "actif" } },
    _count: { _all: true },
  });
  return groupes.map((groupe) => ({ role: groupe.nom, nombre: groupe._count._all })).sort((a, b) => b.nombre - a.nombre);
}

/**
 * Vue d'ensemble F-ADM-01, reservee a admin_national. Structure a acces=false
 * plutot qu'un tableau/null unique (Zero Trust, meme principe que
 * getStatistiquesNationales dans src/modules/analytics/actions.ts) si
 * l'appelant n'a pas le role requis.
 *
 * Reutilise les fonctions de lecture deja existantes et deja verifiees
 * (detecterDoublonsPatients, getEtablissementsAdmin, getDemandesPersonnes)
 * plutot que de dupliquer leurs propres verifications RBAC : si l'une
 * d'elles renvoie un tableau vide faute de role, ce tableau de bord
 * l'interprete comme "acces refuse" et court-circuite le reste.
 */
export async function getFilesAttenteAdmin(): Promise<FilesAttenteAdmin> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "doublon_patient"))) {
    return ACCES_REFUSE;
  }

  const il24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    doublons,
    etablissements,
    demandes,
    derniereTacheTraitee,
    tachesEnAttente,
    professionnelsAVerifier,
    demandesComptesEnAttente,
    reinitialisations2faEnAttente,
    smsDifferesEnAttente,
    smsDeposes24h,
    erreursTaches24h,
    executionsTaches,
    comptesParRole,
  ] = await Promise.all([
    detecterDoublonsPatients(),
    getEtablissementsAdmin(),
    getDemandesPersonnes(),
    prisma.tachePilotage.findFirst({
      where: { traitee: true },
      orderBy: { dateTraitement: "desc" },
      select: { dateTraitement: true },
    }),
    prisma.tachePilotage.count({ where: { traitee: false } }),
    compterProfessionnelsAVerifier(),
    prisma.actionAdministrateurEnAttente.count({ where: { statut: "en_attente", expireLe: { gt: new Date() } } }),
    prisma.actionAdministrateurEnAttente.count({ where: { statut: "en_attente", type: "reinitialisation_2fa", expireLe: { gt: new Date() } } }),
    prisma.envoiSms.count({ where: { statut: "differe" } }),
    prisma.envoiSms.count({ where: { statut: "simule", dateEnvoi: { gte: il24h } } }),
    prisma.executionTache.count({ where: { statut: "erreur", date: { gte: il24h } } }),
    lireExecutionsTaches(),
    lireComptesParRole(),
  ]);

  return {
    acces: true,
    doublonsPatientsEnAttente: doublons.length,
    etablissementsEnBrouillon: etablissements.filter((e) => e.statut === "brouillon").length,
    demandesPersonnesEnAttente: (demandes ?? []).filter((d) => !d.traite).length,
    professionnelsAVerifier,
    derniereExecutionPlanificateur: derniereTacheTraitee?.dateTraitement?.toISOString() ?? null,
    tachesPilotageEnAttente: tachesEnAttente,
    demandesComptesEnAttente,
    reinitialisations2faEnAttente,
    smsDifferesEnAttente,
    smsDeposes24h,
    erreursTaches24h,
    executionsTaches,
    comptesParRole,
  };
}
