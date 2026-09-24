/**
 * Domaine Audit : traçabilité des accès aux données.
 *
 * Phase 1 : structure de données uniquement (types), aucune logique métier.
 * La traçabilité obligatoire de tout accès à une donnée médicale s'appuie sur
 * ce type ; l'écriture effective du journal sera branchée module par module au
 * fur et à mesure de leur implémentation (Phase 2 et suivantes).
 */

/** Action tracée dans le journal d'audit. */
export type ActionAudit =
  | 'connexion'
  | 'deconnexion'
  | 'lecture'
  | 'creation'
  | 'modification'
  | 'suppression_logique'
  | 'export'
  | 'consentement_accorde'
  | 'consentement_retire';

/**
 * Entrée du journal d'audit : trace immuable d'un accès ou d'une action sur une
 * donnée sensible. Ne remplace jamais une suppression physique : voir le
 * principe d'historisation documenté dans src/database/schema-notes.md.
 */
export interface JournalAudit {
  id: string;
  utilisateurId: string;
  action: ActionAudit;
  /** Référence de la donnée concernée (type de ressource et identifiant). */
  donneeConcernee: string;
  date: string;
  /** Adresse technique d'origine de l'action (ex : adresse IP). */
  adresseTechnique: string;
  /** Justification de l'accès, notamment pour les accès dérogatoires (ex : urgence). */
  justification: string;
}
