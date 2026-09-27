/**
 * Catalogue des referentiels "listes simples" administrables (F-ADM-04 du
 * pack). Fichier SANS "use server" : les constantes doivent etre importables
 * par l'ecran d'administration et par les formulaires qui consomment ces
 * listes, ce qu'un fichier "use server" ne permet pas.
 *
 * Valeurs de depart : services de la section 18.4 du pack (15 services) ;
 * types d'etablissement limites aux quatre valeurs que ce depot sait
 * reellement traiter (EtablissementSanitaire.type, voir
 * src/app/app/ministere/lib.ts) ; specialites et motifs de rendez-vous
 * courants. Contenu de demonstration : a valider avant tout usage reel
 * (avertissement de la section 18.4 du pack).
 */

export const TYPES_REFERENTIEL_SIMPLE = ["service", "type_etablissement", "specialite", "motif_rendez_vous"] as const;
export type TypeReferentielSimple = (typeof TYPES_REFERENTIEL_SIMPLE)[number];

export interface EntreeParDefaut {
  code: string;
  libelle: string;
}

export interface DefinitionReferentielSimple {
  libelle: string;
  description: string;
  entreesParDefaut: EntreeParDefaut[];
}

export const REFERENTIELS_SIMPLES: Record<TypeReferentielSimple, DefinitionReferentielSimple> = {
  service: {
    libelle: "Services",
    description: "Services proposés par un établissement (fiche de l'établissement, annuaire public).",
    entreesParDefaut: [
      { code: "medecine_generale", libelle: "Médecine générale" },
      { code: "pediatrie", libelle: "Pédiatrie" },
      { code: "maternite", libelle: "Maternité" },
      { code: "consultation_prenatale", libelle: "Consultation prénatale" },
      { code: "vaccination", libelle: "Vaccination" },
      { code: "chirurgie", libelle: "Chirurgie" },
      { code: "urgences", libelle: "Urgences" },
      { code: "laboratoire", libelle: "Laboratoire" },
      { code: "pharmacie", libelle: "Pharmacie" },
      { code: "dentaire", libelle: "Dentaire" },
      { code: "ophtalmologie", libelle: "Ophtalmologie" },
      { code: "orl", libelle: "ORL" },
      { code: "cardiologie", libelle: "Cardiologie" },
      { code: "diabetologie", libelle: "Diabétologie" },
      { code: "sante_mentale", libelle: "Santé mentale" },
    ],
  },
  type_etablissement: {
    libelle: "Types d'établissement",
    description:
      "Types d'établissement proposés à la création. Les quatre types de départ sont les seuls que la plateforme traite aujourd'hui ; un type ajouté ici n'a pas de règle propre tant que le code ne le connaît pas.",
    entreesParDefaut: [
      { code: "centre_sante", libelle: "Centre de santé" },
      { code: "hopital", libelle: "Hôpital" },
      { code: "laboratoire", libelle: "Laboratoire" },
      { code: "pharmacie", libelle: "Pharmacie" },
    ],
  },
  specialite: {
    libelle: "Spécialités",
    description: "Spécialités des professionnels de santé (création de compte, annuaire).",
    entreesParDefaut: [
      { code: "medecine_generale", libelle: "Médecine générale" },
      { code: "pediatrie", libelle: "Pédiatrie" },
      { code: "gynecologie_obstetrique", libelle: "Gynécologie obstétrique" },
      { code: "chirurgie_generale", libelle: "Chirurgie générale" },
      { code: "cardiologie", libelle: "Cardiologie" },
      { code: "diabetologie", libelle: "Diabétologie" },
      { code: "ophtalmologie", libelle: "Ophtalmologie" },
      { code: "orl", libelle: "ORL" },
      { code: "psychiatrie", libelle: "Psychiatrie" },
      { code: "pharmacie_officine", libelle: "Pharmacie d'officine" },
      { code: "biologie_medicale", libelle: "Biologie médicale" },
      { code: "soins_infirmiers", libelle: "Soins infirmiers" },
    ],
  },
  motif_rendez_vous: {
    libelle: "Motifs de rendez-vous",
    description: "Motifs proposés à la prise de rendez-vous.",
    entreesParDefaut: [
      { code: "consultation", libelle: "Consultation" },
      { code: "suivi_maladie_chronique", libelle: "Suivi d'une maladie chronique" },
      { code: "consultation_prenatale", libelle: "Consultation prénatale" },
      { code: "vaccination", libelle: "Vaccination" },
      { code: "resultats_examens", libelle: "Résultats d'examens" },
      { code: "renouvellement_ordonnance", libelle: "Renouvellement d'ordonnance" },
      { code: "autre", libelle: "Autre motif" },
    ],
  },
};

export function estTypeReferentielSimple(valeur: unknown): valeur is TypeReferentielSimple {
  return typeof valeur === "string" && (TYPES_REFERENTIEL_SIMPLE as readonly string[]).includes(valeur);
}
