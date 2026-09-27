/**
 * Pipeline du resume de dossier (F-IA-01), module pur : assemble la requete
 * minimisee, appelle le fournisseur INJECTE, valide la reponse. Aucun acces
 * base, aucune session : l'appelant a deja verifie fonctionnalite, acces et
 * limite d'usage et a lu les donnees.
 *
 * RG-IA-01 : la sortie n'est jamais enregistree dans le dossier ni envoyee au
 * patient ; RG-IA-04 : garde-fou de fuite AVANT tout appel du fournisseur.
 */

import type { FournisseurIa } from "./provider";
import { ErreurIaIndisponible } from "./provider";
import { detecterFuites, type IdentitePatient } from "./minimisation";
import { CONSIGNE_SYSTEME_RESUME, NOMBRE_MAX_PUCES, type ElementSource, LIBELLES_TYPE_ELEMENT, type PuceValidee } from "./regles";
import { construireElements, type DonneesDossierIa } from "./sources";
import { validerReponse } from "./validation";

export interface ResultatPipeline {
  /** ok : resume affichable ; indisponible : moins de 2 puces conformes ou fournisseur inactif ; bloque : fuite detectee, rien n'a ete envoye. */
  statut: "ok" | "indisponible" | "bloque";
  puces: PuceValidee[];
  /** Elements cites par au moins une puce (pour les liens vers la chronologie). */
  sourcesCitees: ElementSource[];
  nombreSources: number;
  pucesLues: number;
  pucesSupprimees: number;
  exclusSensibles: number;
  modele: string;
  dureeMs: number;
  /** Le texte exact propose au modele : sert aux tests et au controle CA-2, JAMAIS a la persistance. */
  entreeEnvoyee: string;
}

function decrireContexte(donnees: DonneesDossierIa): string {
  const sexe = donnees.sexe === "F" ? "une femme" : donnees.sexe === "M" ? "un homme" : "une personne";
  return `Le patient est ${sexe} de ${donnees.age} ans.`;
}

export function construireEntree(donnees: DonneesDossierIa, elements: readonly ElementSource[]): string {
  const lignes = elements.map((element) => `[${element.etiquette}] ${LIBELLES_TYPE_ELEMENT[element.type]} : ${element.texte}`);
  return [decrireContexte(donnees), "Éléments :", ...lignes].join("\n");
}

export async function produireResume(
  donnees: DonneesDossierIa,
  identite: IdentitePatient,
  fournisseur: FournisseurIa,
  maintenant: () => number = Date.now
): Promise<ResultatPipeline> {
  const debut = maintenant();
  const { elements, exclusSensibles } = construireElements(donnees, identite);
  const entree = construireEntree(donnees, elements);

  const base = {
    puces: [],
    sourcesCitees: [],
    nombreSources: elements.length,
    pucesLues: 0,
    pucesSupprimees: 0,
    exclusSensibles,
    modele: fournisseur.nom,
    entreeEnvoyee: entree,
  };

  // Garde-fou independant de l'assainissement (CA-2) : au moindre doute, rien ne part.
  if (detecterFuites(entree, identite).length > 0) {
    return { ...base, statut: "bloque", dureeMs: maintenant() - debut };
  }

  let reponse;
  try {
    reponse = await fournisseur.generate({ system: CONSIGNE_SYSTEME_RESUME, input: entree, maxTokens: 600 });
  } catch (erreur) {
    if (erreur instanceof ErreurIaIndisponible) {
      return { ...base, statut: "indisponible", dureeMs: maintenant() - debut };
    }
    throw erreur;
  }

  const validation = validerReponse(reponse.texte, elements);
  const etiquettesCitees = new Set(validation.puces.flatMap((puce) => puce.sources));

  return {
    ...base,
    statut: validation.disponible ? "ok" : "indisponible",
    puces: validation.disponible ? validation.puces.slice(0, NOMBRE_MAX_PUCES) : [],
    sourcesCitees: validation.disponible ? elements.filter((element) => etiquettesCitees.has(element.etiquette)) : [],
    pucesLues: validation.pucesLues,
    pucesSupprimees: validation.pucesSupprimees,
    modele: reponse.modele,
    dureeMs: maintenant() - debut,
  };
}
