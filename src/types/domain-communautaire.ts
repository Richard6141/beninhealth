/**
 * Domaine Communautaire : visites de terrain menées par un agent
 * communautaire (role `agent_communautaire`), hors dossier clinique complet.
 *
 * Le bénéficiaire d'une visite n'a pas toujours de dossier `Patient`
 * enregistré sur la plateforme (population non encore couverte) : `patientId`
 * reste alors nul et `beneficiaireNom` porte l'identité déclarée sur le
 * terrain.
 */

/**
 * Nature d'une visite de suivi communautaire. Les 5 premiers reprennent
 * exactement le pack (F-COM-03) ; vaccination/depistage/autre restent des
 * ajouts assumes anterieurs, conserves pour ne jamais casser les visites deja
 * enregistrees avec ces valeurs (voir communautaire-catalogue.ts, source de
 * verite partagee avec actions.ts).
 */
export type TypeVisiteCommunautaire =
  | 'suivi_general'
  | 'enfant_moins_5_ans'
  | 'femme_enceinte'
  | 'suivi_apres_sortie'
  | 'sensibilisation'
  | 'vaccination'
  | 'depistage'
  | 'autre'
  // Ancienne valeur (avant ce chantier), conservee pour les visites deja
  // enregistrees : jamais proposee dans un nouveau formulaire, mais toujours
  // lisible (voir LIBELLES_TYPE_VISITE, communautaire-catalogue.ts).
  | 'suivi_grossesse';

/** Visite de terrain menée par un agent communautaire. */
export interface SuiviCommunautaire {
  id: string;
  agentId: string;
  etablissementId: string;
  patientId: string | null;
  beneficiaireNom: string;
  typeVisite: TypeVisiteCommunautaire;
  dateVisite: string;
  localisation: string;
  notes: string;
}
