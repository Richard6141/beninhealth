/**
 * Domaine Identity : utilisateurs, rôles et professionnels de santé.
 *
 * Phase 1 : structure de données uniquement (types), aucune logique métier.
 * Implémentation réelle (authentification, gestion des rôles) prévue en Phase 2
 * avec le module `identity` (voir src/modules/identity).
 *
 * Convention : toutes les dates sont représentées en chaîne ISO 8601 (ex :
 * "2026-09-24T10:00:00.000Z"), pour rester sérialisables telles quelles en JSON.
 */

/** Rôles applicatifs. Un utilisateur peut cumuler plusieurs rôles. */
export type NomRole =
  | 'patient'
  | 'medecin'
  | 'infirmier'
  | 'agent_communautaire'
  | 'pharmacien'
  | 'laboratoire'
  | 'admin_etablissement'
  | 'admin_national';

/** Statut du compte utilisateur. */
export type StatutUtilisateur =
  | 'actif'
  | 'inactif'
  | 'suspendu'
  | 'en_attente_validation';

/**
 * Rôle attribué à un utilisateur, avec les permissions associées.
 * La liste de permissions est volontairement typée en chaînes libres ici ;
 * le système de permissions structuré (Role, Permission, Action) vit dans
 * src/security/permissions.ts et sera relié à ce type en Phase 2.
 */
export interface Role {
  nom: NomRole;
  permissions: string[];
}

/** Compte utilisateur de la plateforme, tous rôles confondus. */
export interface User {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  /** Hash du mot de passe uniquement. Jamais de mot de passe en clair dans ce type. */
  motDePasseHash: string;
  statut: StatutUtilisateur;
  dateCreation: string;
  derniereConnexion: string | null;
  roles: Role[];
}

/** Statut de validation administrative d'un professionnel de santé. */
export type StatutValidationProfessionnel =
  | 'en_attente'
  | 'valide'
  | 'rejete'
  | 'suspendu';

/**
 * Professionnel de santé : extension métier d'un User porteur d'un rôle
 * professionnel (medecin, infirmier, agent_communautaire, pharmacien,
 * laboratoire, admin_etablissement). Sépare volontairement l'identité
 * administrative (User) des données médicales (voir modules patient/clinical),
 * conformément au principe de séparation identité/données médicales.
 */
export interface ProfessionnelSante {
  id: string;
  identite: User;
  specialite: string;
  numeroProfessionnel: string;
  /** Référence vers EtablissementSanitaire (src/types/domain-facility.ts) par id uniquement. */
  etablissementId: string;
  statutValidation: StatutValidationProfessionnel;
}
