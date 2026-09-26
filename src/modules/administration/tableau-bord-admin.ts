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
 * - "Professionnels a valider" : sans objet, ce depot n'a pas de flux de
 *   validation centrale (F-ADM-03 explicitement non construite, hierarchie
 *   de provisionnement Phase 6 retenue a la place).
 * - "Reinitialisations 2FA demandees" : sans objet, aucun flux de demande de
 *   reinitialisation MFA cote administrateur n'existe dans ce depot
 *   (src/modules/identity/mfa.ts ne gere que l'auto-desactivation par
 *   l'utilisateur lui-meme).
 * - "Taille de la file SMS" : sans objet, aucun fournisseur SMS reel
 *   (feature flag sms.real_provider jamais active, voir
 *   fonctionnalites-catalogue.ts).
 * - "Erreurs des dernieres 24h" : sans objet, aucune table de journalisation
 *   d'erreurs applicatives dans ce depot (uniquement console.error, jamais
 *   persiste).
 * Les 4 compteurs ci-dessus restent donc absents de ce tableau de bord,
 * plutot que fabriques a partir de rien : seuls les 3 compteurs et l'etat
 * technique ci-dessous ont une vraie source de donnees dans ce depot.
 */

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { detecterDoublonsPatients } from "@/modules/patient/fusion-doublons";
import { getEtablissementsAdmin } from "./etablissements";
import { getDemandesPersonnes } from "@/modules/audit/demandes";

export interface FilesAttenteAdmin {
  acces: boolean;
  doublonsPatientsEnAttente: number;
  etablissementsEnBrouillon: number;
  demandesPersonnesEnAttente: number;
  /** ISO, ou null si aucune tache planifiee n'a encore ete executee. */
  derniereExecutionPlanificateur: string | null;
  tachesPilotageEnAttente: number;
}

const ACCES_REFUSE: FilesAttenteAdmin = {
  acces: false,
  doublonsPatientsEnAttente: 0,
  etablissementsEnBrouillon: 0,
  demandesPersonnesEnAttente: 0,
  derniereExecutionPlanificateur: null,
  tachesPilotageEnAttente: 0,
};

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

  const [doublons, etablissements, demandes, derniereTacheTraitee, tachesEnAttente] = await Promise.all([
    detecterDoublonsPatients(),
    getEtablissementsAdmin(),
    getDemandesPersonnes(),
    prisma.tachePilotage.findFirst({
      where: { traitee: true },
      orderBy: { dateTraitement: "desc" },
      select: { dateTraitement: true },
    }),
    prisma.tachePilotage.count({ where: { traitee: false } }),
  ]);

  return {
    acces: true,
    doublonsPatientsEnAttente: doublons.length,
    etablissementsEnBrouillon: etablissements.filter((e) => e.statut === "brouillon").length,
    demandesPersonnesEnAttente: (demandes ?? []).filter((d) => !d.traite).length,
    derniereExecutionPlanificateur: derniereTacheTraitee?.dateTraitement?.toISOString() ?? null,
    tachesPilotageEnAttente: tachesEnAttente,
  };
}
