/**
 * Point d'entrée unique des types de domaine.
 *
 * Réexporte l'ensemble des types définis dans ce dossier, organisés par
 * domaine métier isolé (identity, patient, clinical, facility, audit),
 * pour un import simple : `import type { User, Patient } from '@/types'`.
 */

export * from './domain-identity';
export * from './domain-patient';
export * from './domain-clinical';
export * from './domain-facility';
export * from './domain-audit';
export * from './domain-communautaire';
