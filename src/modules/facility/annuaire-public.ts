"use server";

/**
 * Annuaire public des etablissements (F-ETA-01/02 du pack, "Rechercher un
 * etablissement" / "Fiche publique d'un etablissement") : seules fonctions
 * de ce depot appelables SANS session (Rôles: Tous, y compris visiteur non
 * connecte). Distinct de listEtablissements() dans facility/actions.ts, qui
 * sert le selecteur de prise de rendez-vous DEJA authentifie et ne filtre
 * pas sur le statut : ici, uniquement les etablissements "actif" sont
 * exposes (jamais un brouillon, jamais un etablissement ferme ou suspendu),
 * et uniquement des champs deja publics par nature (jamais de personnel
 * nominatif, RG-ETA-10 : aucun profil professionnel n'a de parametre
 * "afficher publiquement" dans ce depot, donc la liste du personnel n'est
 * jamais affichee ici, plutot que d'inventer un opt-in qui n'existe pas).
 *
 * Perimetre reduit et honnete : pas d'horaires par jour (aucun modele
 * "Horaires" dans ce depot), pas d'equipements notables (P1 du pack), pas de
 * carte de localisation interactive (latitude/longitude affiches en texte,
 * lien "Itineraire" vers une recherche de carte externe generique).
 */

import { prisma } from "@/lib/prisma";

export interface EtablissementAnnuaireResume {
  id: string;
  identifiant: string;
  nom: string;
  sigle: string | null;
  type: string;
  communeNom: string | null;
  departementNom: string | null;
  localisation: string;
}

export interface EtablissementAnnuaireDetail extends EtablissementAnnuaireResume {
  adresse: string | null;
  telephone: string | null;
  latitude: number;
  longitude: number;
  servicesDisponibles: string[];
  niveauPyramide: string | null;
  secteur: string | null;
}

const SELECTION_RESUME = {
  id: true,
  identifiant: true,
  nom: true,
  sigle: true,
  type: true,
  localisation: true,
  commune: { select: { nom: true, departement: { select: { nom: true } } } },
} as const;

function versResume(etablissement: {
  id: string;
  identifiant: string;
  nom: string;
  sigle: string | null;
  type: string;
  localisation: string;
  commune: { nom: string; departement: { nom: string } } | null;
}): EtablissementAnnuaireResume {
  return {
    id: etablissement.id,
    identifiant: etablissement.identifiant,
    nom: etablissement.nom,
    sigle: etablissement.sigle,
    type: etablissement.type,
    communeNom: etablissement.commune?.nom ?? null,
    departementNom: etablissement.commune?.departement.nom ?? null,
    localisation: etablissement.localisation,
  };
}

/**
 * Annuaire public, filtre sur un terme de recherche facultatif (nom ou
 * localisation, insensible a la casse). Toujours limite aux etablissements
 * "actif" : jamais de donnee sur un brouillon, un etablissement suspendu ou
 * ferme (RG-ADM-01, ce dernier reste operationnel administrativement mais
 * ne doit plus apparaitre comme un lieu ou se rendre).
 */
export async function getAnnuairePublicEtablissements(
  recherche?: string
): Promise<EtablissementAnnuaireResume[]> {
  const termeNettoye = recherche?.trim() ?? "";

  const etablissements = await prisma.etablissementSanitaire.findMany({
    where: {
      statut: "actif",
      ...(termeNettoye.length > 0
        ? {
            OR: [
              { nom: { contains: termeNettoye, mode: "insensitive" } },
              { localisation: { contains: termeNettoye, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: SELECTION_RESUME,
    orderBy: { nom: "asc" },
  });

  return etablissements.map(versResume);
}

/** Fiche publique detaillee d'un etablissement, ou null si introuvable/pas actif (jamais d'exception). */
export async function getEtablissementPublicParId(
  id: string
): Promise<EtablissementAnnuaireDetail | null> {
  const identifiantNettoye = id.trim();

  if (identifiantNettoye.length === 0) {
    return null;
  }

  const etablissement = await prisma.etablissementSanitaire.findUnique({
    where: { id: identifiantNettoye },
    select: {
      ...SELECTION_RESUME,
      adresse: true,
      telephoneEtablissement: true,
      latitude: true,
      longitude: true,
      servicesDisponibles: true,
      niveauPyramide: true,
      secteur: true,
      statut: true,
    },
  });

  if (!etablissement || etablissement.statut !== "actif") {
    return null;
  }

  let servicesDisponibles: string[] = [];
  try {
    const parse: unknown = JSON.parse(etablissement.servicesDisponibles);
    servicesDisponibles = Array.isArray(parse) ? parse.filter((s): s is string => typeof s === "string") : [];
  } catch {
    servicesDisponibles = [];
  }

  return {
    ...versResume(etablissement),
    adresse: etablissement.adresse,
    telephone: etablissement.telephoneEtablissement,
    latitude: etablissement.latitude,
    longitude: etablissement.longitude,
    servicesDisponibles,
    niveauPyramide: etablissement.niveauPyramide,
    secteur: etablissement.secteur,
  };
}
