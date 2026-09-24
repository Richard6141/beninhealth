# Module analytics

Responsabilité : statistiques agrégées à destination du ministère de la Santé (Analytics Service).

Périmètre : indicateurs de santé publique (volumes, tendances) calculés à
partir des données des autres modules, exclusivement sous forme agrégée.

Hors périmètre : accès à un dossier patient individuel, tout export nominatif
ou identifiant, toute logique clinique. Aucune donnée nominative ne doit
transiter par ce module, en toute circonstance.

Phase d'implémentation : phase ultérieure, après identity, patient, clinical
et prescription.

## Implémentation Phase 6

Implémenté dans `src/modules/analytics/actions.ts` (Server Actions), réexporté
par `src/modules/analytics/index.ts`.

Principe non négociable, rappelé ici explicitement (voir aussi
`src/security/README.md`, ligne admin_national : "Analytics Service (données
agrégées uniquement), jamais de données nominatives") : aucune fonction de ce
module ne renvoie de donnée nominative (aucun nom de patient, aucun
identifiant santé, aucun détail clinique individuel). Chaque fonction ne
renvoie que des comptages et des agrégations : totaux, répartitions par
statut, séries mensuelles. Le tableau de bord établissement peut afficher le
nom de SES PROPRES professionnels, mais ce mécanisme est déjà géré par le
module identity ; ce module-ci ne renvoie jamais de liste de patients ni de
détails de consultation individuels.

Fonctions exposées :

- `getStatistiquesEtablissement()` : statistiques agrégées de l'établissement
  de l'admin_etablissement connecté (établissement déduit de sa propre fiche
  ProfessionnelSante via `getSession()`, jamais d'id transmis par le client).
  Réservé au rôle admin_etablissement. Renvoie `null` si l'appelant n'a pas ce
  rôle ou pas de ProfessionnelSante associé, sans jamais lever d'exception.
- `getStatistiquesNationales()` : statistiques agrégées à l'échelle nationale,
  pour le tableau de bord ministère. Réservé au rôle admin_national. Si
  l'appelant n'a pas ce rôle, renvoie une structure à zéro (totaux à 0,
  tableaux vides) plutôt que de lever une exception : Zero Trust, jamais de
  donnée si le rôle ne correspond pas.
- `exporterRepartitionCSV()` : export CSV de la répartition par établissement
  (Etablissement, Localisation, Type, Consultations, RendezVous,
  Professionnels). Réservé au rôle admin_national, renvoie une chaîne vide
  sinon.

Les séries mensuelles (`consultationsParMois`) couvrent toujours les 6
derniers mois glissants, mois courant inclus, y compris les mois sans aucune
consultation (total à 0, jamais omis), au format "AAAA-MM". Les répartitions
par statut de rendez-vous couvrent toujours les 4 statuts possibles
("demande", "confirme", "termine", "annule"), y compris ceux à 0.

Aucune nouvelle dépendance npm, aucune migration Prisma : ce module lit
uniquement les modèles déjà en place (`EtablissementSanitaire`,
`ProfessionnelSante`, `Consultation`, `RendezVous`, `Prescription`,
`Patient`) via `src/lib/prisma.ts`, et dérive systématiquement l'identité de
l'appelant via `src/lib/session.ts` (`getSession()`).
