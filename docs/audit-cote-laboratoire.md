# Audit du rôle laboratoire face au pack Claude Code

Même méthode que les audits précédents. Périmètre : `src/modules/laboratoire/actions.ts`,
`src/app/app/medecin/examens/**`, `src/app/app/medecin/laboratoire/**`,
`src/app/app/patient/examens/**`, comparés à
`docs/pack claude/specs/12-fiches-laboratoire.md` (F-LAB-01 à F-LAB-06). Ce
module est marqué "Phase 8 (à venir)" dans `CLAUDE.md` alors que du code existe
déjà : la roadmap est simplement restée en retard sur l'implémentation réelle.

## Constat principal : un résultat sensible atteignait le patient sans aucun garde-fou

Avant la correction d'aujourd'hui, `ExamenMedical` n'avait aucune notion
d'examen "sensible". Concrètement : un médecin pouvait demander une
« Sérologie VIH », le laboratoire saisir le résultat, et le patient le voyait
**immédiatement** dans son espace, sans passage par le médecin. Pire, la
notification envoyée au patient contenait le **nom de l'examen en clair**
(« Le resultat de votre examen "Sérologie VIH" est disponible »), donc une
information sensible pouvait fuiter par la simple notification, avant même
que le patient n'ouvre l'application. C'est exactement le scénario que
RG-LAB-02 et RG-LAB-41 du pack existent pour empêcher, et RG-LAB-42
l'interdit explicitement pour toute notification, sensible ou non.

## Corrections apportées aujourd'hui

1. **Détection des examens sensibles** (`src/modules/laboratoire/referentiel-examens-sensibles.ts`) :
   `typeExamen` reste un champ texte libre dans ce MVP (pas de vrai référentiel
   d'examens, voir "Limites" ci-dessous), donc la détection se fait par
   mots-clés (VIH, SIDA, HIV) sur le libellé saisi par le médecin, à l'image
   de `referentiel-allergies.ts` pour les prescriptions.
2. **Deux champs additifs sur `ExamenMedical`** : `sensible` (calculé à la
   demande) et `resultatAnnonceAuPatient` (faux par défaut).
3. **`getMesExamens()` masque le résultat** d'un examen sensible tant qu'il
   n'a pas été annoncé : le patient voit « Un résultat vous sera communiqué
   par votre médecin » au lieu de la valeur.
4. **Notifications rendues génériques** (RG-LAB-42) : plus aucune notification
   de résultat ne mentionne le nom de l'examen, sensible ou non.
5. **Nouvelle action `annoncerResultatExamenAction`** : réservée au médecin
   demandeur de l'examen précis (vérifié en base, jamais supposé), ne fait
   rien tant que l'examen n'est pas sensible + terminé + pas déjà annoncé.
   Trace l'annonce dans `JournalAudit`.
6. **UI** : badge « Sensible » sur la carte médecin, bouton « Marquer comme
   annoncé au patient » tant que ce n'est pas fait, confirmation affichée une
   fois annoncé.
7. Vérifié à l'écran de bout en bout (Playwright, 3 comptes de démo) : demande
   « Sérologie VIH » par le médecin → résultat saisi par le laboratoire →
   patient voit le message générique (pas le résultat) → médecin clique
   « Marquer comme annoncé » → le patient voit alors le résultat réel.

## Statut par fiche

| Fiche | Statut | Commentaire |
|---|---|---|
| F-LAB-01 Demander un examen | Partiel | Mise à jour 2026-09-26 (cette ligne était périmée : le sélecteur de patient et le référentiel par famille existent déjà, voir `FormulaireDemandeExamen.tsx`/`referentiel-examens.ts`, faits par une autre session entre-temps). Reste manquant : niveau d'urgence, renseignements cliniques dédiés, "à jeun requis", numéro LB-XXXX-XXXX et QR. |
| F-LAB-02 Recevoir la demande et enregistrer le prélèvement | **Fait** | Périmée également : vérification d'identité (`identiteVerifiee`), enregistrement du prélèvement (type d'échantillon, préleveur, `enregistrerPrelevementAction`) et rejet d'échantillon (`rejeterEchantillonAction`, remet en attente sans effacer la trace du rejet) existent déjà dans `src/modules/laboratoire/actions.ts`, voir `docs/coordination-agents.md` pour le détail. |
| F-LAB-03 Saisir un résultat | Partiel | **Corrigé aujourd'hui pour la confidentialité** (voir ci-dessus). Résultat toujours en texte libre, pas de paramètres structurés par examen (unité, valeur de référence, indicateur N/L/H/LL/HH), pas de contrôle de plage physiologique, pas d'alerte sur valeur critique. |
| F-LAB-04 Valider un résultat (principe des quatre yeux) | **Fait** (adapté) | Nouveau statut intermédiaire `resultat_saisi` (au lieu de passer directement à `termine`). `validerResultatExamenAction` exige la re-saisie du mot de passe, calcule une empreinte SHA-256, et **refuse réellement** si le validateur est la même personne que celle ayant saisi le résultat (`saisiParId === valideParId`), testé pour de vrai (pas seulement en théorie). Adaptation documentée : pas de rôle `LAB_SUPERVISOR` distinct dans ce dépôt, la validation est ouverte à tout autre professionnel du rôle laboratoire du même établissement (quatre yeux entre pairs plutôt qu'une hiérarchie). `renvoyerPourCorrectionAction` (statut `correction_demandee`) conserve l'ancienne valeur du résultat dans `JournalAudit` avant resaisie (RG-ROL-31). |
| F-LAB-05 Mise à disposition et annonce | **Fait** | Le principe des quatre yeux (F-LAB-04) précède désormais réellement la mise à disposition : `getMesExamens`/`getExamensDemandesParProfessionnel` masquent le résultat tant que `statut !== "termine"` (RG-LAB-30), vérifié à l'écran côté médecin et côté patient. |
| F-LAB-06 Annuler une demande | **Fait** | Périmée aussi : `annulerExamenAction` existe (réservée au médecin demandeur, tant qu'aucun résultat n'existe), bouton `BoutonAnnulerExamen.tsx` câblé à l'écran. |

## Limites assumées

- La détection "sensible" par mots-clés sur un champ texte libre est un
  pis-aller honnête, pas une solution définitive : un médecin qui écrit
  "Test rapide VIH" est détecté, mais une faute de frappe ou une formulation
  inhabituelle ne le serait pas. La vraie solution est un référentiel
  d'examens structuré (le pack en fournit la table, section 18.4), qui
  n'existe pas encore dans ce dépôt pour aucun examen.
- Le principe des quatre yeux (F-LAB-04) est fait mais adapté : sans rôle
  hiérarchique `LAB_SUPERVISOR`, c'est un pair du même établissement qui
  valide plutôt qu'un responsable désigné. Cohérent avec le modèle de rôles
  de ce dépôt, à revoir si un jour une hiérarchie de laboratoire est modélisée.

## Recommandation

Les deux risques les plus graves identifiés (confidentialité d'un résultat
sensible, absence de second regard avant qu'un résultat ne devienne définitif)
sont maintenant traités et vérifiés à l'écran. Le prochain effort à plus forte
valeur serait un vrai référentiel d'examens structuré (condition préalable à
des contrôles de plage fiables et à une détection de sensibilité robuste que
le simple filtrage par mots-clés actuel), suivi de F-LAB-02 (enregistrement du
prélèvement) et F-LAB-06 (annulation), tous deux encore non faits.
