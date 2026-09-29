/**
 * Instantané de l'aire d'un agent communautaire (F-COM-01, RG-COM-01) et
 * changements incrémentaux (F-COM-08, GET /sync/changes).
 *
 * Simplification assumée (à documenter dans docs/reste-a-faire.md, cohérente
 * avec la décision déjà prise ailleurs dans ce dépôt pour villageQuartier,
 * voir communautaire/actions.ts) : ce dépôt n'a aucun référentiel
 * géographique en dessous du département/commune (F-ADM-04). L'"aire
 * affectée" d'un agent communautaire (RG-ROL-20, RG-COM-01) est donc prise
 * comme l'établissement auquel il est rattaché (etablissementId) : c'est
 * déjà le périmètre réel de tout ce que l'agent peut voir en ligne
 * (getPersonnesEnregistrees, getMesSuivisCommunautaires). Un vrai découpage
 * en villages/quartiers affectés nommément à un agent reste à construire
 * (décision de modélisation, Agent Architecture).
 */

import { prisma } from "@/lib/prisma";
import { SIGNES_DANGER_DEPART, TYPES_VISITE_COMMUNAUTAIRE } from "@/modules/communautaire/communautaire-catalogue";

/** RG-COM-01 : l'instantané ne dépasse jamais 5000 personnes. */
export const LIMITE_PERSONNES_INSTANTANE = 5000;

export interface PersonneInstantane {
  id: string;
  nom: string;
  prenom: string;
  dateNaissance: string; // ISO
  dateNaissanceApproximative: boolean;
  sexe: string;
  villageQuartier: string;
  chefMenage: string | null;
  dateCreation: string; // ISO
}

export interface InstantaneAire {
  dateInstantane: string; // ISO, date de génération de cet instantané
  etablissementId: string;
  personnes: PersonneInstantane[];
  referentiels: {
    typesVisite: readonly string[];
    signesDanger: { typeVisite: string; libelle: string; ordre: number }[];
  };
}

/** Construit l'instantané téléchargeable de l'aire d'un agent (F-COM-01, étape 4). */
export async function obtenirInstantaneAire(etablissementId: string): Promise<InstantaneAire> {
  const personnes = await prisma.personneCommunautaire.findMany({
    where: { etablissementId },
    orderBy: { dateCreation: "desc" },
    take: LIMITE_PERSONNES_INSTANTANE,
  });

  return {
    dateInstantane: new Date().toISOString(),
    etablissementId,
    personnes: personnes.map((personne) => ({
      id: personne.id,
      nom: personne.nom,
      prenom: personne.prenom,
      dateNaissance: personne.dateNaissance.toISOString(),
      dateNaissanceApproximative: personne.dateNaissanceApproximative,
      sexe: personne.sexe,
      villageQuartier: personne.villageQuartier,
      chefMenage: personne.chefMenage,
      dateCreation: personne.dateCreation.toISOString(),
    })),
    referentiels: {
      typesVisite: TYPES_VISITE_COMMUNAUTAIRE,
      signesDanger: SIGNES_DANGER_DEPART,
    },
  };
}

export interface ChangementsAire {
  curseur: string; // ISO, a reutiliser comme "since" au prochain appel
  personnes: PersonneInstantane[];
}

/** Changements de l'aire depuis un curseur donné (F-COM-08, GET /sync/changes). */
export async function obtenirChangementsAire(etablissementId: string, depuis: Date): Promise<ChangementsAire> {
  const maintenant = new Date();
  const personnes = await prisma.personneCommunautaire.findMany({
    where: { etablissementId, dateCreation: { gt: depuis } },
    orderBy: { dateCreation: "asc" },
    take: LIMITE_PERSONNES_INSTANTANE,
  });

  return {
    curseur: maintenant.toISOString(),
    personnes: personnes.map((personne) => ({
      id: personne.id,
      nom: personne.nom,
      prenom: personne.prenom,
      dateNaissance: personne.dateNaissance.toISOString(),
      dateNaissanceApproximative: personne.dateNaissanceApproximative,
      sexe: personne.sexe,
      villageQuartier: personne.villageQuartier,
      chefMenage: personne.chefMenage,
      dateCreation: personne.dateCreation.toISOString(),
    })),
  };
}
