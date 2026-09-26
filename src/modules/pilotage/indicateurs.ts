/**
 * Catalogue des indicateurs de pilotage (section 14.2 du pack). RG-PIL-10 :
 * chaque indicateur DOIT avoir sa definition affichee dans l'interface
 * (icone "i") et documentee dans le code, identique au tableau du pack.
 * Cette constante est la source unique utilisee a la fois par le moteur de
 * calcul (src/modules/pilotage/agregation.ts) et par l'interface (icone
 * d'aide sur chaque carte d'indicateur) : ne jamais dupliquer ce texte
 * ailleurs, importer CATALOGUE_INDICATEURS.
 */

export type PrioriteIndicateur = "P0" | "P1";

export interface DefinitionIndicateur {
  code: string;
  libelle: string;
  /** Definition exacte, reprise mot pour mot de la colonne "Definition exacte" du pack. */
  definition: string;
  dimensions: string;
  priorite: PrioriteIndicateur;
  // RG-PIL-05 : une donnee SENSITIVE n'est comptee qu'au niveau departement/national.
  sensible: boolean;
}

export const CATALOGUE_INDICATEURS: DefinitionIndicateur[] = [
  {
    code: "IND-01",
    libelle: "Consultations",
    definition:
      "Nombre de consultations VALIDATED (hors « saisies par erreur ») par date de demarrage.",
    dimensions: "Territoire, etablissement, type d'etablissement, sexe, tranche d'age, jour/semaine/mois",
    priorite: "P0",
    sensible: false,
  },
  {
    code: "IND-02",
    libelle: "Patients vus",
    definition: "Nombre de patients distincts ayant au moins une consultation validee sur la periode.",
    dimensions: "Territoire, etablissement, type d'etablissement, sexe, tranche d'age, jour/semaine/mois",
    priorite: "P0",
    sensible: false,
  },
  {
    code: "IND-03",
    libelle: "Top des diagnostics",
    definition: "Consultations par groupe de maladies (section 18.6) du diagnostic principal.",
    dimensions: "Territoire, sexe, tranche d'age, periode",
    priorite: "P0",
    sensible: false,
  },
  {
    code: "IND-04",
    libelle: "Cas de paludisme",
    definition:
      "Consultations avec diagnostic principal B50-B54 ; dont confirmes par test (goutte epaisse ou TDR positif lie).",
    dimensions: "Territoire, tranche d'age (< 5 ans / >= 5 ans), semaine",
    priorite: "P0",
    sensible: false,
  },
  {
    code: "IND-05",
    libelle: "Etablissements actifs",
    definition:
      "Etablissements avec au moins 1 consultation validee dans les 7 derniers jours / total des etablissements actifs dans le referentiel.",
    dimensions: "Territoire, type",
    priorite: "P0",
    sensible: false,
  },
  {
    code: "IND-06",
    libelle: "Professionnels actifs",
    definition: "Professionnels ayant valide au moins 1 acte dans les 30 derniers jours.",
    dimensions: "Territoire, profession",
    priorite: "P0",
    sensible: false,
  },
  {
    code: "IND-07",
    libelle: "Rendez-vous",
    definition:
      "Rendez-vous pris, honores, annules, absences ; taux d'absence = absences / (honores + absences).",
    dimensions: "Etablissement, service, periode",
    priorite: "P0",
    sensible: false,
  },
  {
    code: "IND-08",
    libelle: "Ordonnances",
    definition:
      "Ordonnances signees ; taux de delivrance = ordonnances delivrees totalement ou partiellement / ordonnances signees (delai 30 j).",
    dimensions: "Territoire, periode",
    priorite: "P1",
    sensible: false,
  },
  {
    code: "IND-09",
    libelle: "Ruptures declarees",
    definition: "Lignes non delivrees avec raison « rupture de stock », par medicament (DCI).",
    dimensions: "Territoire, medicament, semaine",
    priorite: "P1",
    sensible: false,
  },
  {
    code: "IND-10",
    libelle: "Vaccinations",
    definition: "Doses administrees par vaccin et numero de dose.",
    dimensions: "Territoire, tranche d'age, lieu (etablissement / terrain), mois",
    priorite: "P1",
    sensible: false,
  },
  {
    code: "IND-11",
    libelle: "Delai d'attente",
    definition: "Mediane (arrivee -> demarrage de consultation), en minutes.",
    dimensions: "Etablissement, service",
    priorite: "P1",
    sensible: false,
  },
  {
    code: "IND-12",
    libelle: "Qualite de saisie",
    definition:
      "Part des consultations validees tardivement (> 48 h) ; part des arrivees verifiees « sur piece ».",
    dimensions: "Etablissement",
    priorite: "P1",
    sensible: false,
  },
  {
    code: "IND-13",
    libelle: "Adoption",
    definition: "Comptes citoyens crees, comptes actifs sur 30 jours.",
    dimensions: "Territoire (commune de residence declaree)",
    priorite: "P0",
    sensible: false,
  },
];

export function trouverDefinitionIndicateur(code: string): DefinitionIndicateur | undefined {
  return CATALOGUE_INDICATEURS.find((indicateur) => indicateur.code === code);
}
