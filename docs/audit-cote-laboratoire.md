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
| F-LAB-01 Demander un examen | Partiel | Fonctionne, mais patientId est une saisie texte libre (pas de sélecteur de patient comme côté consultation/prescription), et typeExamen n'est pas choisi dans un référentiel par famille (hématologie, sérologie...). Pas de niveau d'urgence, pas de renseignements cliniques dédiés, pas de "à jeun requis", pas de numéro LB-XXXX-XXXX ni de QR. |
| F-LAB-02 Recevoir la demande et enregistrer le prélèvement | Non fait | Pas de vérification d'identité formelle, pas d'enregistrement de prélèvement (type d'échantillon, préleveur), pas de rejet d'échantillon. Le laboratoire passe directement de "demande" à la saisie du résultat. |
| F-LAB-03 Saisir un résultat | Partiel | **Corrigé aujourd'hui pour la confidentialité** (voir ci-dessus). Résultat toujours en texte libre, pas de paramètres structurés par examen (unité, valeur de référence, indicateur N/L/H/LL/HH), pas de contrôle de plage physiologique, pas d'alerte sur valeur critique. |
| F-LAB-04 Valider un résultat (principe des quatre yeux) | Non fait | Aucune étape de validation séparée par un responsable : celui qui saisit le résultat le rend visible directement. Pas de rôle `LAB_SUPERVISOR` distinct dans la matrice RBAC actuelle. |
| F-LAB-05 Mise à disposition et annonce | Fait pour la partie "annonce" | Corrigé aujourd'hui, mais seulement le mécanisme d'annonce lui-même ; le principe des quatre yeux (F-LAB-04) qui devrait précéder la mise à disposition n'existe pas. |
| F-LAB-06 Annuler une demande | **Fait** (périmètre réduit, médecin uniquement) | `annulerExamenAction` (`src/modules/laboratoire/actions.ts`) : le médecin demandeur peut annuler sa propre demande (Zero Trust, vérifié en base), tant qu'aucun résultat n'existe encore (statuts `demande`/`en_cours`), refusée dès `correction_demandee` puisque l'ancien résultat y est encore conservé. Bouton « Annuler cette demande » avec confirmation à deux temps sur `/app/medecin/examens`. Vérifié en direct (création, annulation, statut `annule` persistant après rechargement). Non fait : aucune action symétrique côté laboratoire pour libérer/rejeter une demande déjà prise en charge. |

## Limites assumées

- La détection "sensible" par mots-clés sur un champ texte libre est un
  pis-aller honnête, pas une solution définitive : un médecin qui écrit
  "Test rapide VIH" est détecté, mais une faute de frappe ou une formulation
  inhabituelle ne le serait pas. La vraie solution est un référentiel
  d'examens structuré (le pack en fournit la table, section 18.4), qui
  n'existe pas encore dans ce dépôt pour aucun examen.
- Le principe des quatre yeux (F-LAB-04, RG-ROL-30) reste le trou le plus
  important après celui corrigé aujourd'hui : rien n'empêche aujourd'hui
  qu'un résultat, sensible ou non, soit rendu visible sans second regard.

## Recommandation

Le correctif du jour traite le risque le plus grave (confidentialité d'un
résultat sensible) avec un changement de portée raisonnable, sans refondre le
cycle de vie complet de l'examen. Le prochain effort à plus forte valeur serait
soit un vrai référentiel d'examens (condition préalable à des contrôles de
plage fiables et à une détection de sensibilité robuste), soit le principe des
quatre yeux (F-LAB-04), qui touche la confiance dans les résultats eux-mêmes.
