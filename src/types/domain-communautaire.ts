/**
 * Domaine Communautaire : visites de terrain menées par un agent
 * communautaire (role `agent_communautaire`), hors dossier clinique complet.
 *
 * Le bénéficiaire d'une visite n'a pas toujours de dossier `Patient`
 * enregistré sur la plateforme (population non encore couverte) : `patientId`
 * reste alors nul et `beneficiaireNom` porte l'identité déclarée sur le
 * terrain.
 */

/** Nature d'une visite de suivi communautaire. */
export type TypeVisiteCommunautaire =
  | 'vaccination'
  | 'depistage'
  | 'suivi_grossesse'
  | 'sensibilisation'
  | 'autre';

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
