/**
 * Empreinte d'integrite d'une ordonnance (F-PRE-04 du pack, CA-2).
 *
 * Module SANS "use server" : fonctions pures, jamais atteignables comme
 * point d'entree HTTP.
 *
 * Contenu canonique (JSON aux cles triees, recursivement) : patient,
 * prescripteur, etablissement de l'acte, date, instructions et lignes. Les
 * lignes sont triees par leur propre serialisation : l'ordre renvoye par la
 * base ne change donc jamais l'empreinte.
 *
 * L'ancienne empreinte etait calculee avec JSON.stringify(champs,
 * Object.keys(champs).sort()) : ce tableau sert aussi de liste blanche pour
 * les objets imbriques, si bien que "lignes" devenait [{}] et que patient,
 * prescripteur, etablissement et date n'y figuraient pas. Elle ne protegeait
 * que les instructions. Les ordonnances deja creees gardent cette valeur
 * (64 caracteres hexadecimaux sans prefixe) et sont reconnues comme "ancien
 * format", non verifiables ; seules les nouvelles portent le prefixe
 * PREFIXE_EMPREINTE.
 */

import { createHash } from "node:crypto";

export const PREFIXE_EMPREINTE = "v2:";

export interface LigneContenuOrdonnance {
  medicamentId: string;
  posologie: string;
  quantite: number;
  dureeTraitementJours: number;
  nonSubstituable: boolean;
}

export interface ContenuOrdonnance {
  patientId: string;
  prescripteurId: string;
  etablissementId: string;
  date: Date;
  instructions: string;
  lignes: LigneContenuOrdonnance[];
}

export type ResultatIntegrite = "conforme" | "alteree" | "ancien_format";

/** JSON deterministe : cles triees a tous les niveaux, aucune valeur indefinie. */
export function serialiserCanonique(valeur: unknown): string {
  if (valeur === undefined) {
    throw new Error("Valeur indefinie dans un contenu a empreindre.");
  }

  if (valeur === null || typeof valeur !== "object") {
    return JSON.stringify(valeur);
  }

  if (valeur instanceof Date) {
    return JSON.stringify(valeur.toISOString());
  }

  if (Array.isArray(valeur)) {
    return `[${valeur.map(serialiserCanonique).join(",")}]`;
  }

  const objet = valeur as Record<string, unknown>;
  const membres = Object.keys(objet)
    .sort()
    .map((cle) => `${JSON.stringify(cle)}:${serialiserCanonique(objet[cle])}`);

  return `{${membres.join(",")}}`;
}

export function contenuCanoniqueOrdonnance(contenu: ContenuOrdonnance): string {
  const lignes = contenu.lignes
    .map((ligne) => ({
      medicamentId: ligne.medicamentId,
      posologie: ligne.posologie,
      quantite: ligne.quantite,
      dureeTraitementJours: ligne.dureeTraitementJours,
      nonSubstituable: ligne.nonSubstituable,
    }))
    .sort((a, b) => {
      const sa = serialiserCanonique(a);
      const sb = serialiserCanonique(b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });

  return serialiserCanonique({
    patientId: contenu.patientId,
    prescripteurId: contenu.prescripteurId,
    etablissementId: contenu.etablissementId,
    date: contenu.date,
    instructions: contenu.instructions,
    lignes,
  });
}

export function calculerEmpreinteOrdonnance(contenu: ContenuOrdonnance): string {
  const hex = createHash("sha256").update(contenuCanoniqueOrdonnance(contenu)).digest("hex");
  return `${PREFIXE_EMPREINTE}${hex}`;
}

/** 8 premiers caracteres hexadecimaux, pour l'impression sur l'ordonnance (spec F-PRE-04). */
export function empreinteCourte(empreinte: string): string {
  const hex = empreinte.startsWith(PREFIXE_EMPREINTE) ? empreinte.slice(PREFIXE_EMPREINTE.length) : empreinte;
  return hex.slice(0, 8);
}

/** CA-2 : recalcule l'empreinte sur le contenu lu en base et la compare a celle enregistree. */
export function verifierIntegriteOrdonnance(
  empreinteEnregistree: string,
  contenu: ContenuOrdonnance
): ResultatIntegrite {
  if (!empreinteEnregistree.startsWith(PREFIXE_EMPREINTE)) {
    return "ancien_format";
  }

  return calculerEmpreinteOrdonnance(contenu) === empreinteEnregistree ? "conforme" : "alteree";
}

/** Forme d'une ordonnance lue en base (Prescription + lignes + consultation) utile a l'empreinte. */
export interface OrdonnanceEnBase {
  patientId: string;
  medecinPrescripteurId: string;
  date: Date;
  instructions: string;
  empreinteContenu: string;
  consultation: { etablissementId: string };
  lignes: LigneContenuOrdonnance[];
}

export function contenuDepuisOrdonnanceEnBase(ordonnance: OrdonnanceEnBase): ContenuOrdonnance {
  return {
    patientId: ordonnance.patientId,
    prescripteurId: ordonnance.medecinPrescripteurId,
    etablissementId: ordonnance.consultation.etablissementId,
    date: ordonnance.date,
    instructions: ordonnance.instructions,
    lignes: ordonnance.lignes,
  };
}
