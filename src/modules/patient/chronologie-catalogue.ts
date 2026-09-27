/**
 * Constantes pures de la chronologie du dossier citoyen (F-CIT-03). Fichier
 * separe de chronologie.ts ("use server") : un module "use server" ne peut
 * exporter que des fonctions async, meme pattern deja rencontre ce soir
 * (referentiel-medicaments-catalogue.ts, referentiels-simples-catalogue.ts).
 */

export const TYPES_CHRONOLOGIE = ["consultation", "ordonnance", "resultat", "vaccination", "document"] as const;
export type TypeElementChronologie = (typeof TYPES_CHRONOLOGIE)[number];

export const NOMBRE_ELEMENTS_PAR_PAGE = 20;

export const LIBELLES_TYPE_CHRONOLOGIE: Record<TypeElementChronologie, string> = {
  consultation: "Consultation",
  ordonnance: "Ordonnance",
  resultat: "Resultat d'examen",
  vaccination: "Vaccination",
  document: "Document",
};

export const OPTIONS_TYPE_CHRONOLOGIE = TYPES_CHRONOLOGIE.map((type) => ({
  value: type,
  label: LIBELLES_TYPE_CHRONOLOGIE[type],
}));
