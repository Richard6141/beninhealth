/**
 * Constantes pures pour le formulaire du referentiel medicaments (F-ADM-04).
 * Fichier separe de referentiel-medicaments.ts ("use server") : un module
 * "use server" ne peut exporter que des fonctions async, pattern deja
 * rencontre ce soir (parametres.ts -> fonctionnalites-catalogue.ts,
 * posologie.ts, referentiel-allergies.ts).
 */

/** Options courtes pour la forme galenique (voir docs/pack claude, section 18.4). */
export const FORMES_CONNUES = [
  "comprime",
  "gelule",
  "sirop",
  "suspension",
  "injectable",
  "pommade",
  "suppositoire",
  "autre",
] as const;
