# Notes de schéma PostgreSQL

Phase 1 : documentation uniquement, aucune migration réelle ni connexion à une
base de données. La connexion PostgreSQL effective et les premières migrations
seront mises en place en Phase 2, avec le module `identity` (voir
src/modules/identity). Ce document sert de référence pour cette mise en place.

## Une table par entité

Une table est prévue pour chacune des entités du modèle de données, en
correspondance directe avec les types de src/types :

- `users`, `roles`, `user_roles` (table de liaison, un utilisateur pouvant
  cumuler plusieurs rôles) : domaine identity.
- `professionnels_sante` : domaine identity, lié à `users` et à
  `etablissements_sanitaires`.
- `patients` : domaine patient.
- `consentements` : domaine patient, lié à `patients` et à l'acteur autorisé
  (référence polymorphe vers un utilisateur ou un établissement).
- `consultations` : domaine clinical, liée à `patients`, `professionnels_sante`
  et `etablissements_sanitaires`.
- `prescriptions`, `lignes_prescription`, `historique_prescriptions` : domaine
  prescription, liées à `consultations` et à `medicaments`.
- `medicaments` : catalogue, domaine prescription.
- `examens_medicaux` : domaine clinical, liée à `professionnels_sante` (demandeur)
  et à `etablissements_sanitaires` (laboratoire).
- `documents_medicaux` : domaine clinical, liée au propriétaire du document.
- `etablissements_sanitaires` : domaine facility.
- `rendez_vous` : domaine facility, liée à `patients`, `professionnels_sante` et
  `etablissements_sanitaires`.
- `journal_audit` : domaine audit, liée à `users`, en lecture seule pour tous
  les modules applicatifs (écriture uniquement).

## Relations principales

- `users` 1..N `professionnels_sante` (un utilisateur peut porter une identité
  professionnelle en plus de son compte de base).
- `patients` 1..N `consentements`, `consultations`, `rendez_vous`.
- `consultations` 1..N `prescriptions`, `examens_medicaux`, `documents_medicaux`.
- `prescriptions` 1..N `lignes_prescription` (chaque ligne référence un
  `medicament`) et 1..N `historique_prescriptions`.
- `etablissements_sanitaires` 1..N `professionnels_sante`, `rendez_vous`,
  `examens_medicaux` (en tant que laboratoire).

## Extension PostGIS

L'extension PostGIS est prévue sur la table `etablissements_sanitaires`, pour
stocker `coordonnees_gps` en type géométrique natif (`geography(Point, 4326)`)
plutôt qu'en simples nombres flottants, et permettre les requêtes de proximité
nécessaires à la cartographie sanitaire (établissement le plus proche, zone de
couverture, etc.).

## Historisation obligatoire

Aucune donnée médicale n'est supprimée physiquement de la base. Toute
suppression fonctionnelle passe soit par un champ de statut sur la ligne
concernée (ex : `statut = 'annulee'` sur `prescriptions`), soit par une table
d'historique dédiée qui conserve l'état précédent (ex :
`historique_prescriptions`). Ce principe s'applique en particulier à
`consultations`, `prescriptions`, `examens_medicaux`, `documents_medicaux` et
`consentements`, pour permettre l'auditabilité complète exigée par
`journal_audit` et respecter la traçabilité obligatoire documentée dans
src/security/README.md.

## Mise en place réelle

La connexion PostgreSQL réelle, l'outil de migration et le premier jeu de
migrations seront ajoutés en Phase 2 avec le module `identity`. `src/lib/env.ts`
prépare dès la Phase 1 la validation de la variable `DATABASE_URL` qui sera
utilisée à ce moment-là.
