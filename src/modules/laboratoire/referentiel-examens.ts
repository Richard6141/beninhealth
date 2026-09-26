/**
 * Referentiel structure des examens medicaux (F-LAB-01 du pack). Remplace le
 * texte libre historique de typeExamen par un choix dans une liste par
 * famille : voir docs/audit-cote-laboratoire.md, "F-LAB-01 Demander un
 * examen" ("typeExamen n'est pas choisi dans un referentiel par famille").
 *
 * Module pur (pas de "use server", pas d'acces base), meme approche que
 * src/modules/prescription/referentiel-allergies.ts et
 * src/modules/laboratoire/referentiel-examens-sensibles.ts. Le champ
 * ExamenMedical.typeExamen reste un simple texte en base (aucun changement
 * de schema) : ce referentiel ne fait que structurer la SAISIE, il stocke
 * toujours le libelle choisi (ou la precision saisie pour "Autre").
 *
 * estExamenSensible() (referentiel-examens-sensibles.ts) continue de
 * fonctionner tel quel sur le libelle stocke : les libelles de ce
 * referentiel qui contiennent "VIH" sont deja detectes par ses mots-cles.
 */

export interface ExamenReferentiel {
  code: string;
  libelle: string;
  famille: string;
}

/** Ordre d'affichage fixe des familles. */
export const FAMILLES_EXAMENS = [
  "Hématologie",
  "Biochimie",
  "Sérologie",
  "Microbiologie",
  "Parasitologie",
  "Imagerie",
] as const;

/**
 * Catalogue de depart : les examens les plus courants dans un contexte de
 * soins primaires au Benin, pas une nomenclature exhaustive. "Autre" n'est
 * volontairement pas dans cette liste : c'est une option a part geree par
 * l'appelant (voir FormulaireDemandeExamen), avec une precision en texte
 * libre, pour ne jamais bloquer une demande dont le type n'est pas encore
 * dans ce catalogue.
 */
export const REFERENTIEL_EXAMENS: ExamenReferentiel[] = [
  { code: "NFS", libelle: "Numération formule sanguine (NFS)", famille: "Hématologie" },
  { code: "GROUPE_RH", libelle: "Groupage sanguin ABO / Rhésus", famille: "Hématologie" },
  { code: "TAUX_HEMOGLOBINE", libelle: "Taux d'hémoglobine", famille: "Hématologie" },
  { code: "VITESSE_SEDIMENTATION", libelle: "Vitesse de sédimentation (VS)", famille: "Hématologie" },

  { code: "GLYCEMIE", libelle: "Glycémie à jeun", famille: "Biochimie" },
  { code: "CREATININE", libelle: "Créatinine sanguine", famille: "Biochimie" },
  { code: "TRANSAMINASES", libelle: "Transaminases (ASAT / ALAT)", famille: "Biochimie" },
  { code: "BILAN_LIPIDIQUE", libelle: "Bilan lipidique (cholestérol, triglycérides)", famille: "Biochimie" },
  { code: "IONOGRAMME", libelle: "Ionogramme sanguin", famille: "Biochimie" },

  { code: "VIH", libelle: "Sérologie VIH", famille: "Sérologie" },
  { code: "HEPATITE_B", libelle: "Sérologie hépatite B (AgHBs)", famille: "Sérologie" },
  { code: "HEPATITE_C", libelle: "Sérologie hépatite C", famille: "Sérologie" },
  { code: "SYPHILIS", libelle: "Sérologie syphilis (TPHA / VDRL)", famille: "Sérologie" },
  { code: "TYPHOIDE", libelle: "Sérologie fièvre typhoïde (Widal)", famille: "Sérologie" },

  { code: "ECBU", libelle: "Examen cytobactériologique des urines (ECBU)", famille: "Microbiologie" },
  { code: "COPROCULTURE", libelle: "Coproculture", famille: "Microbiologie" },
  { code: "HEMOCULTURE", libelle: "Hémoculture", famille: "Microbiologie" },

  { code: "PALUDISME_GE", libelle: "Goutte épaisse (paludisme)", famille: "Parasitologie" },
  { code: "PALUDISME_TDR", libelle: "Test de diagnostic rapide du paludisme (TDR)", famille: "Parasitologie" },
  { code: "SELLES_PARASITO", libelle: "Examen parasitologique des selles", famille: "Parasitologie" },

  { code: "RADIO_THORAX", libelle: "Radiographie thoracique", famille: "Imagerie" },
  { code: "ECHOGRAPHIE_ABDO", libelle: "Échographie abdominale", famille: "Imagerie" },
  { code: "ECHOGRAPHIE_OBSTETRICALE", libelle: "Échographie obstétricale", famille: "Imagerie" },
];

/** Le référentiel, regroupé par famille dans l'ordre de FAMILLES_EXAMENS, prêt pour un <select> à groupes. */
export function referentielParFamille(): { famille: string; examens: ExamenReferentiel[] }[] {
  return FAMILLES_EXAMENS.map((famille) => ({
    famille,
    examens: REFERENTIEL_EXAMENS.filter((examen) => examen.famille === famille),
  }));
}
