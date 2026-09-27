"use server";

/**
 * Lecture du referentiel geographie (F-ADM-04 du pack, partie 7) :
 * departements, communes, zones sanitaires (Departement/Commune/ZoneSanitaire,
 * deja seedes par src/modules/pilotage/referentiel-territoire.ts, utilises
 * par EtablissementSanitaire pour sa localisation). Reserve a admin_national.
 *
 * Perimetre reduit assume : lecture seule. A la difference des autres
 * referentiels administrables de ce depot (ReferentielSimple,
 * DiagnosticCim10...), ces trois tables n'ont aucun champ "actif" et aucune
 * action d'ecriture cote admin n'existe (seul le seed les alimente a la
 * demonstration) : ajouter RG-ADM-20 (desactivation, jamais suppression)
 * demanderait une migration sur des tables deja referencees activement par
 * EtablissementSanitaire, hors de portee de cette prise sans discussion
 * prealable avec l'Agent Architecture. RG-ADM-21 (versionnement) : sans
 * objet, meme limite deja assumee pour tous les referentiels de ce depot.
 * "Arrondissements" du pack : aucun modele Prisma correspondant dans ce
 * depot, limite assumee (deja documentee pour les zones sanitaires dans
 * referentiel-territoire.ts).
 *
 * Le nombre d'etablissements par commune/zone est affiche a titre
 * informatif seulement (pas un controle RG-ADM-20, puisqu'aucune
 * desactivation n'est possible ici).
 */

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";

export interface CommuneReferentiel {
  id: string;
  nom: string;
  nombreEtablissements: number;
}

export interface ZoneSanitaireReferentiel {
  id: string;
  code: string;
  nom: string;
  nombreEtablissements: number;
}

export interface DepartementReferentielGeographie {
  id: string;
  code: string;
  nom: string;
  communes: CommuneReferentiel[];
  zonesSanitaires: ZoneSanitaireReferentiel[];
}

/**
 * Les 12 departements du Benin avec leurs communes et zones sanitaires,
 * chacune avec le nombre d'etablissements qui lui sont rattaches. Reserve a
 * admin_national ; renvoie null si la session est absente ou sans le role
 * requis.
 */
export async function getReferentielGeographie(): Promise<DepartementReferentielGeographie[] | null> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "referentiel_geographie"))) {
    return null;
  }

  const departements = await prisma.departement.findMany({
    orderBy: { nom: "asc" },
    include: {
      communes: {
        orderBy: { nom: "asc" },
        include: { _count: { select: { etablissements: true } } },
      },
      zonesSanitaires: {
        orderBy: { nom: "asc" },
        include: { _count: { select: { etablissements: true } } },
      },
    },
  });

  return departements.map((departement) => ({
    id: departement.id,
    code: departement.code,
    nom: departement.nom,
    communes: departement.communes.map((commune) => ({
      id: commune.id,
      nom: commune.nom,
      nombreEtablissements: commune._count.etablissements,
    })),
    zonesSanitaires: departement.zonesSanitaires.map((zone) => ({
      id: zone.id,
      code: zone.code,
      nom: zone.nom,
      nombreEtablissements: zone._count.etablissements,
    })),
  }));
}
