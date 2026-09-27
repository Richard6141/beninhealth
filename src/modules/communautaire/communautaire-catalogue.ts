/**
 * Constantes pures du module communautaire (F-COM-02/03 du pack). Fichier
 * separe de actions.ts ("use server") : un module "use server" ne peut
 * exporter que des fonctions async, meme pattern deja rencontre ce soir
 * (informations-declarees-catalogue.ts, referentiels-simples-catalogue.ts).
 */

/**
 * Types de visite communautaire (F-COM-03). Les 5 premiers reprennent
 * exactement le pack ; vaccination/depistage/autre restent des ajouts
 * assumes anterieurs a ce chantier (vaccination reste cable a
 * FormulaireVaccinationCommunautaire.tsx, F-COM-04 ; conserves pour ne
 * jamais casser les visites deja enregistrees avec ces valeurs).
 */
export const TYPES_VISITE_COMMUNAUTAIRE = [
  "suivi_general",
  "enfant_moins_5_ans",
  "femme_enceinte",
  "suivi_apres_sortie",
  "sensibilisation",
  "vaccination",
  "depistage",
  "autre",
] as const;
export type TypeVisiteCommunautaireCatalogue = (typeof TYPES_VISITE_COMMUNAUTAIRE)[number];

/** Ancienne valeur, jamais proposee dans le formulaire mais toujours affichable pour une visite deja enregistree (voir LIBELLES_TYPE_VISITE). */
const TYPE_VISITE_HERITE = "suivi_grossesse" as const;

export const LIBELLES_TYPE_VISITE: Record<TypeVisiteCommunautaireCatalogue | typeof TYPE_VISITE_HERITE, string> = {
  suivi_general: "Suivi général",
  enfant_moins_5_ans: "Enfant de moins de 5 ans",
  femme_enceinte: "Femme enceinte",
  suivi_apres_sortie: "Suivi après sortie",
  sensibilisation: "Sensibilisation",
  vaccination: "Vaccination",
  depistage: "Dépistage",
  autre: "Autre",
  [TYPE_VISITE_HERITE]: "Suivi de grossesse",
};

/**
 * Depart assume des signes de danger (RG-COM-10), semes une seule fois si la
 * table SigneDangerCommunautaire est vide (voir semerSignesDangerSiNecessaire
 * dans actions.ts) : repris tels quels des exemples cites explicitement par
 * le pack (section 13.3), qui precise lui-meme "contenu clinique exact a
 * valider par le programme national de sante communautaire". Liste de
 * depart, pas une liste definitive : modifiable ensuite via un ecran
 * d'administration comme les autres referentiels de ce depot (a construire,
 * non fait ce soir, voir la limite assumee documentee dans reste-a-faire.md).
 */
export const SIGNES_DANGER_DEPART: { typeVisite: TypeVisiteCommunautaireCatalogue; libelle: string; ordre: number }[] = [
  { typeVisite: "enfant_moins_5_ans", libelle: "Incapable de boire ou de téter", ordre: 1 },
  { typeVisite: "enfant_moins_5_ans", libelle: "Vomit tout ce qu'il consomme", ordre: 2 },
  { typeVisite: "enfant_moins_5_ans", libelle: "Convulsions", ordre: 3 },
  { typeVisite: "enfant_moins_5_ans", libelle: "Léthargie ou inconscience", ordre: 4 },
  { typeVisite: "femme_enceinte", libelle: "Saignement", ordre: 1 },
  { typeVisite: "femme_enceinte", libelle: "Maux de tête sévères avec vision trouble", ordre: 2 },
  { typeVisite: "femme_enceinte", libelle: "Convulsions", ordre: 3 },
  { typeVisite: "femme_enceinte", libelle: "Fièvre élevée", ordre: 4 },
];
