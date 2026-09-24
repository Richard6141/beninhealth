# Sécurité : RBAC, Zero Trust, MFA, traçabilité, consentement

Ce dossier documente le modèle de sécurité que tous les modules futurs devront
respecter. Phase 1 : documentation et types uniquement, aucune logique de contrôle
d'accès réelle. L'implémentation du contrôle d'accès arrive avec le module
`identity` en Phase 2 (voir src/modules/identity).

## Modèle RBAC (rôle -> accès principal)

| Rôle | Accès principal (aperçu, sera affiné en Phase 2) |
|---|---|
| patient | Son propre dossier (Patient, Consultation, Prescription, ExamenMedical, DocumentMedical), gestion de ses propres Consentement, prise de RendezVous |
| medecin | Dossiers des patients qu'il suit (selon Consentement), création de Consultation et de Prescription, lecture des ExamenMedical rattachés |
| infirmier | Consultation en lecture/actes selon habilitation, participation aux soins, pas de droit de prescription |
| agent_communautaire | Données de suivi communautaire limitées, pas d'accès au dossier clinique complet |
| pharmacien | Lecture des Prescription à délivrer, mise à jour du statut de délivrance, catalogue Medicament |
| laboratoire | ExamenMedical qui lui sont adressés, saisie du resultat, pas d'accès au reste du dossier |
| admin_etablissement | Gestion de l'EtablissementSanitaire et des ProfessionnelSante qui y sont rattachés, pas d'accès au contenu clinique des patients |
| admin_national | Analytics Service (données agrégées uniquement), jamais de données nominatives |

Cette table est un aperçu fonctionnel issu du cahier des charges, pas la
matrice de permissions définitive : la matrice fine (Permission par
ressource et par action) sera implémentée dans src/modules/identity en
Phase 2 et s'appuiera sur les types de src/security/permissions.ts.

## Principes à respecter dans tous les modules futurs

- Zero Trust : aucune confiance implicite entre modules ou entre requêtes,
  chaque accès est vérifié systématiquement, même en interne à la plateforme.
- MFA obligatoire pour toute action sensible réalisée par un professionnel de
  santé (ex : création de prescription, accès à un dossier hors consentement
  explicite en contexte d'urgence).
- Traçabilité obligatoire : tout accès à une donnée médicale doit générer une
  entrée JournalAudit (voir src/types/domain-audit.ts), sans exception.
- Consentement contrôlable : un patient doit pouvoir autoriser puis retirer à
  tout moment l'accès d'un acteur à son dossier (voir Consentement dans
  src/types/domain-patient.ts).
- Séparation identité administrative / données médicales : l'identité (User,
  ProfessionnelSante) et les données médicales (Patient, Consultation,
  Prescription...) restent dans des domaines de types et des modules
  distincts, jamais fusionnés.
