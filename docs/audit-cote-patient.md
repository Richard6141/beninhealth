# Audit côté patient — écart entre l'existant et le pack Claude (cahier des charges V2)

Date : 2026-09-25. Référence : `docs/pack claude/specs/` (chapitres 5, 7, 8).
Portée : uniquement le rôle **CITOYEN/PATIENT**. Les autres rôles ne sont pas couverts ici.

## 1. Écart fondamental à connaître avant tout

Le pack suppose une **authentification par téléphone + code SMS (OTP)** comme identifiant principal
(F-AUTH-01/02, format `+22901XXXXXXXX`). Notre implémentation actuelle utilise **email + mot de passe**
uniquement, sans téléphone comme identifiant, sans SMS, sans OTP. C'est la divergence la plus lourde :
elle touche F-AUTH-01, 02, 03, 04, 06, et indirectement F-CIT-05 (carte QR liée à l'identité vérifiée).
Basculer vers un système téléphone+OTP est un chantier à part entière (fournisseur SMS, même simulé en
boîte `/dev/sms`), pas une correction ponctuelle.

## 2. Tableau des fiches citoyen (chapitre 8)

| Fiche | Sujet | État réel | Détail |
|---|---|---|---|
| F-CIT-01 | Assistant de première utilisation (4 étapes) | **Non fait** | Aucun assistant après inscription ; le dossier patient est créé avec des valeurs par défaut vides, jamais de parcours guidé « groupe sanguin / allergies / maladie chronique / contact d'urgence ». |
| F-CIT-02 | Tableau de bord citoyen | **Partiel** | Existe et fonctionne (rendez-vous, traitements, indicateurs). Ordre et contenu imposé par la fiche pas suivi à la lettre (pas de sélecteur « personne à charge », pas de cloche de notifications reliée à un vrai centre de notifications, pas de mode hors-ligne RG-CIT-10). |
| F-CIT-03 | Consulter son dossier | **Partiel** | Le dossier s'affiche (résumé, antécédents, historique). Manque : étiquette « déclaré par vous » / « confirmé par [pro] » (RG-CIT-01 — actuellement sans objet puisqu'aucun professionnel ne modifie ces champs), masquage d'un résultat « à annoncer » (RG-CIT-20), non-affichage des observations internes du médecin (à vérifier module clinique). |
| F-CIT-04 | Gérer ses informations déclarées | **Partiel** | Le patient peut modifier allergies/antécédents/groupe sanguin. Aucune distinction déclaré/confirmé (pas encore nécessaire, aucun professionnel n'édite ces champs), pas de "versioning" ni de statut `RETIRED` conservé dans l'historique. |
| F-CIT-05 | Carte santé QR | **Partiel** | Une fonctionnalité QR existe (`/app/profil`, module `verification`), mais ne suit pas exactement la fiche (jeton HMAC 5 minutes à usage unique, mode hors-ligne dégradé). À vérifier avec l'autre session qui l'a construite. |
| F-CIT-06 | Ordonnances, résultats, documents | **Partiel** | Prescriptions et examens consultables. Pas de QR par ordonnance, pas de PDF téléchargeable, pas d'URL de téléchargement à durée de vie 60 s (RG-CIT-50). |
| F-CIT-07/08/09 | Personnes à charge / tutelle | **Non fait** (P1, pas P0) | Aucun modèle de données ni écran. Cohérent avec la priorité P1 du cahier des charges — pas urgent. |
| F-CIT-10 | Autorisations de partage (niveaux + durée) | **Corrigé aujourd'hui** | Avant : consentement toujours permanent (`dateFin` jamais renseigné), non vérifié à la lecture. Après : durée obligatoire (24h/7j/30j/6mois/12mois, RG-ACC-12), expiration réellement appliquée dans les 3 modules qui lisent un consentement (clinique, laboratoire, vérification QR), statut affiché « Expiré » distinctement. Reste manquant : les 3 niveaux `SUMMARY`/`FULL`/`FULL_SENSITIVE` (notre modèle n'a que des types de ressources : dossier complet/consultations/prescriptions/examens/documents, pas de notion de sensibilité). |
| F-CIT-11 | Partage par code temporaire | **Non fait** | Aucun système de code à 8 caractères. |
| F-CIT-12 | Qui a consulté mon dossier | **Fait** | Écran `/app/patient/acces` : historique regroupé par acteur et par jour (RG-CIT-100), couvrant médecin, laboratoire, pharmacie et agent communautaire (`getMesAccesDossier` résout aussi les entrées `JournalAudit` liées via les consultations/prescriptions/examens/suivis du patient, pas seulement `patient:<id>`). Filtre par type d'accès. Bouton « Je ne reconnais pas cet accès » (RG-CIT-101) : crée une entrée `signalement_acces_suspect` tracée pour un futur écran d'audit (F-AUD-04, non construit). Non fait : mise en évidence rouge des accès d'urgence, car aucun mécanisme de bris de glace n'existe dans ce dépôt (voir `docs/audit-cote-medecin.md`, F-CLI-09 à 14) ; filtre par période (seul le filtre par type a été retenu, valeur jugée suffisante pour ce volume de démo). |
| F-CIT-13 | Droits sur ses données (export, rectification, fermeture) | **Non fait** (P1) | Aucun écran, aucune API. |

## 3. Corrections apportées aujourd'hui

- **Durée de consentement réellement appliquée** (F-CIT-10, RG-ACC-12) :
  - `src/modules/patient/actions.ts` : nouveau champ obligatoire `duree` (24h/7j/30j/6mois/12mois), calcul de `dateFin`, plus de consentement permanent.
  - `src/modules/clinical/actions.ts`, `src/modules/laboratoire/actions.ts`, `src/modules/verification/actions.ts` : la vérification d'un consentement contrôle désormais aussi `dateFin`, pas seulement `statut`. Avant ce correctif, un consentement "expiré" restait utilisable indéfiniment tant que le patient ne le retirait pas lui-même.
  - Statut affiché au patient distingue maintenant Actif / Expiré / Retiré (RG-CIT-80), au lieu de rester bloqué sur "Actif" après échéance.
  - `src/modules/patient/consentement-durees.ts` (fichier créé par l'autre session en parallèle, cohérent avec mon travail) : constantes partagées, nécessaire car un fichier `"use server"` ne peut exporter que des fonctions.
- Vérifié : `tsc`, `eslint`, `vitest` (68/68) tous verts, et rendu réel vérifié par capture d'écran (formulaire, page consentements).

## 4. Ce qu'il reste, par ordre de valeur probable

1. **F-CIT-01 (assistant de première utilisation)** — actuellement le patient atterrit sur un dossier vide sans être guidé. Un wizard 4 étapes réutilisant les champs déjà existants (groupe sanguin, allergies, maladie chronique, contact d'urgence) est réalisable rapidement.
2. **Niveaux de consentement `SUMMARY`/`FULL`/`FULL_SENSITIVE`** — changement de modèle plus profond (catégorisation des données par sensibilité), à ne faire que si on décide de suivre le pack plus largement.
3. **F-CIT-11 (code de partage temporaire)** et **F-CIT-13 (droits sur les données)** — P1 dans le cahier des charges lui-même, pas bloquants pour une démo.
4. **Authentification téléphone + OTP** — le changement le plus lourd, transverse à tous les rôles, à traiter comme son propre chantier si on veut vraiment suivre le pack plutôt que comme un ajustement "côté patient".

## 5. Recommandation

Le patient est **fonctionnellement complet pour le scénario de démonstration** (créer son espace, consulter son dossier, prendre rendez-vous, gérer ses autorisations, voir prescriptions/examens, et désormais savoir qui a consulté son dossier). F-CIT-12 était le trou "on ne doit rien négliger" le plus visible du chapitre 5 ; il est traité et vérifié à l'écran. Le reste (assistant d'accueil, niveaux de sensibilité, code de partage, droits sur les données) est du P1 ou un chantier transverse, pas bloquant pour la démo.
