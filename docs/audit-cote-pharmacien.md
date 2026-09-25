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
  aujourd'hui côté médecin — voir `docs/audit-cote-medecin.md`).

## Écarts constatés, aucune correction appliquée aujourd'hui

Contrairement aux audits précédents, aucun correctif n'a été apporté à ce rôle
aujourd'hui : les deux temps forts de la journée (allergie à la prescription,
confidentialité des résultats de laboratoire) ont pris la priorité, et les
écarts ci-dessous demandent une vraie fonctionnalité neuve plutôt qu'un
correctif ponctuel.

| Fiche | Statut | Commentaire |
|---|---|---|
| F-PHA-01 Tableau de bord pharmacie | Partiel | La liste "à délivrer" existe ; pas de bouton "Scanner une ordonnance", pas de vue séparée des délivrances du jour. |
| F-PHA-02 Retrouver une ordonnance présentée | Non fait | Le pharmacien recherche par nom/identifiant santé du patient, pas par numéro d'ordonnance + année de naissance (RG-PHA-01, avec throttling 5 essais/heure). Aucun numéro d'ordonnance dédié n'existe (voir aussi F-PRE-04 dans `docs/audit-cote-medecin.md`), donc cette fiche est bloquée par la même dépendance. |
| F-PHA-03 Enregistrer une délivrance | **Écart le plus important** | Aucun suivi par ligne : `delivrerPrescriptionAction` change uniquement le statut global de la prescription (`validee` → `delivree`/`delivree_partiellement`), sans jamais savoir *quelle quantité, de quelle ligne*, a été délivrée. Concrètement : (1) rien n'empêche de délivrer deux fois la même prescription en entier si deux pharmacies (ou la même, deux fois) la traitent presque simultanément — pas de verrou transactionnel (RG-PHA-11) ; (2) aucune substitution par générique, aucun motif de non-délivrance par ligne ; (3) une délivrance n'est pas annulable (RG-PHA-13). |
| F-PHA-04 Historique des délivrances | Partiel | L'historique existe via `EvenementPrescription`, mais pas de filtre par période/médicament, pas de vue dédiée "de ma pharmacie uniquement" distincte de l'historique général des prescriptions. |
| F-PHA-05 Suivi des stocks | Non fait | Marqué P2 dans le pack, hors MVP — cohérent avec l'absence de développement ici. |

## Pourquoi ce n'est pas un correctif de cette passe

F-PHA-03 (le plus important) suppose une notion de "quantité restante par
ligne de prescription", qui n'existe nulle part dans le modèle de données
actuel (`LignePrescription` n'a qu'une quantité *prescrite*, jamais une
quantité *délivrée*). L'ajouter correctement implique : un champ ou un modèle
de suivi par ligne, une transaction avec verrou pour empêcher le
double-décompte concurrent (RG-PHA-11, avec un vrai test de concurrence comme
l'exige le critère d'acceptation CA-1 du pack), et une refonte du formulaire
de délivrance (aujourd'hui un choix global "délivrée / partiellement", à
transformer en saisie par ligne). C'est un chantier cohérent, pas un
correctif de sécurité isolé comme ceux traités aujourd'hui pour le médecin et
le laboratoire.

## Recommandation

Si le temps du challenge permet de revenir sur ce rôle, F-PHA-03 (suivi par
ligne + verrou anti-double-délivrance) est la priorité : c'est un risque
d'intégrité concret (une prescription pourrait être délivrée deux fois en
entier), pas seulement un écart de confort. F-PHA-02 (numéro d'ordonnance +
année de naissance) est secondaire et de toute façon bloqué tant qu'aucun
numéro d'ordonnance dédié n'existe (voir le "reste à faire" de
`docs/audit-cote-medecin.md`, point F-PRE-04).
