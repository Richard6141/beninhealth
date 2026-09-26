# Audit du rôle pharmacien face au pack Claude Code

Même méthode que les audits précédents. Périmètre : `src/modules/prescription/actions.ts`
(section délivrance, Phase 9), `src/app/app/medecin/pharmacie/**`, comparés à
`docs/pack claude/specs/11-fiches-prescription-pharmacie.md` (F-PHA-01 à F-PHA-05).

## Ce qui existe déjà et fonctionne correctement

- Recherche des prescriptions en attente (statut `validee` ou
  `delivree_partiellement`), tous patients confondus, avec filtre nom/identifiant.
- Délivrance totale ou partielle, avec commentaire, tracée dans
  `EvenementPrescription` et `JournalAudit`.
- **Vérifié aujourd'hui, pas de fuite constatée** : `PrescriptionResume` porte
  un champ `consultationMotif` (partagé avec les écrans médecin/patient), mais
  l'écran pharmacien (`CartePrescriptionADelivrer.tsx`) ne l'affiche jamais.
  RG-PHA-02 ("le pharmacien ne voit jamais le diagnostic") est donc respecté
  en pratique, bien que le type de données reste plus large que nécessaire
  (même remarque structurelle que `ConsultationResume.observations`, corrigée
  aujourd'hui côté médecin, voir `docs/audit-cote-medecin.md`).

## Écarts constatés

| Fiche | Statut | Commentaire |
|---|---|---|
| F-PHA-01 Tableau de bord pharmacie | Partiel | La liste "à délivrer" existe ; pas de bouton "Scanner une ordonnance", pas de vue séparée des délivrances du jour. |
| F-PHA-02 Retrouver une ordonnance présentée | **Fait** (périmètre réduit) | Recherche par numéro d'ordonnance (`Prescription.numero`) + année de naissance du patient (RG-PHA-01), `RechercheOrdonnance.tsx` + `rechercherOrdonnancePresenteeAction`. Throttling 5 essais/heure par comptage des échecs récents dans `JournalAudit` (fenêtre glissante, pas de nouvelle table, résiste à un redémarrage). Message générique "Ordonnance introuvable" que le numéro soit inexistant ou l'année de naissance fausse (CA-1). Non fait, documenté : parcours QR/jeton séparé du pack (RG-PRE-40 à 42) et assignation persistante pharmacie↔ordonnance sur 30 jours (nécessiterait un nouveau modèle). |
| F-PHA-03 Enregistrer une délivrance | **Fait** | Nouveaux modèles `Delivrance`/`LigneDelivrance` : suivi réel par ligne (quantité cumulée recalculée à chaque tentative, dans la même transaction que l'écriture). RG-PHA-11 (jamais dépasser la quantité prescrite, même en cas de tentative concurrente) testé pour de vrai avec deux délivrances totales lancées simultanément : une seule aboutit. RG-PHA-12 (ligne non substituable) et substitution par générique (même DCI/dosage/forme) implémentées. RG-PHA-13 (annulation motivée sous 24h, quantités restituées) implémentée et testée, y compris le refus après 24h. CA-2 (le patient voit "Délivrée en partie" avec la ligne manquante) vérifié à l'écran. Limite à reverifier : ce comportement a été testé sous SQLite (sérialisation naturelle des écritures) ; le dépôt a migré vers PostgreSQL depuis, pas revérifié que la garantie tient toujours sous charge concurrente réelle sans `SELECT ... FOR UPDATE` ni colonne de version optimiste. |
| F-PHA-04 Historique des délivrances | Partiel | L'historique existe (nouveau `HistoriqueDelivrances.tsx`, par prescription), mais pas de vue transversale filtrée par période/médicament à l'échelle de la pharmacie. |
| F-PHA-05 Suivi des stocks | Non fait | Marqué P2 dans le pack, hors MVP, cohérent avec l'absence de développement ici. |

## Recommandation

Le risque d'intégrité le plus concret (une prescription délivrée deux fois en
entier) est désormais fermé et vérifié par un vrai test de concurrence, pas
seulement un raisonnement théorique (à revérifier depuis la migration
PostgreSQL, voir F-PHA-03 ci-dessus). F-PHA-02 (numéro d'ordonnance + année de
naissance) est maintenant fait, en périmètre réduit. F-PHA-04 (vue
transversale de l'historique) est un confort, pas un trou de sécurité.
