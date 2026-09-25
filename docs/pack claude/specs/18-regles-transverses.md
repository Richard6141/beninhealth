# 18. Règles transverses, formats et catalogues

Ce chapitre regroupe les règles qui s'appliquent **partout**. Claude Code DOIT les implémenter une seule fois, dans `src/lib/` (formats, identifiants) ou dans les référentiels, et les réutiliser.

## 18.1 Formats

| Donnée | Saisie acceptée | Stockage | Affichage |
|---|---|---|---|
| Date | JJ/MM/AAAA (sélecteur de date natif sur mobile) | `date` ISO (AAAA-MM-JJ) | « 14/10/2026 » ou « mardi 14 octobre 2026 » dans les phrases |
| Date et heure | Heure locale | `timestamptz` en **UTC** | Heure locale **Africa/Porto-Novo** (UTC+1), format 24 h « 09:30 » |
| Téléphone | Avec ou sans espaces, points, tirets ; avec ou sans +229 | E.164 `+22901XXXXXXXX` | `+229 01 97 12 34 56` ; masqué `+229 01 •• •• 34 56` hors de son propre compte |
| Nom de famille | Libre | MAJUSCULES, espaces multiples réduits | MAJUSCULES |
| Prénoms | Libre | Première lettre de chaque prénom en majuscule | Idem |
| Email | Libre | Minuscules, espaces retirés | Tel quel |
| Poids / taille / températures | Virgule ou point décimal | Nombre décimal en unités SI (kg, cm, °C) | Virgule décimale française « 37,8 °C » |
| Recherche textuelle | Libre | — | Comparaison **sans accents ni casse** (extension PostgreSQL `unaccent` + index trigrammes `pg_trgm`) |

## 18.2 Identifiants lisibles

Les identifiants techniques (clés primaires) sont des **UUID** et ne sont **jamais affichés**. Les identifiants lisibles utilisent l'alphabet **Crockford base 32** (chiffres et lettres sans I, L, O, U, pour éviter les confusions). **Seul l'identifiant santé** porte un **caractère de contrôle** (qui détecte une faute de frappe), calculé selon l'algorithme Crockford « modulo 37 » (symboles de contrôle supplémentaires `*`, `~`, `$`, `=`, `U`). Les codes de partage utilisent en plus un alphabet **sans 0 ni 1** (RG-CIT-90).

| Identifiant | Format | Exemple | Règle |
|---|---|---|---|
| Identifiant santé | `BJ-XXXXX-XXXXX-C` (10 caractères aléatoires + 1 contrôle) | `BJ-7K2QM-9XW4T-H` | Unique, jamais réutilisé ; la saisie accepte minuscules et tirets absents |
| Ordonnance | `RX-XXXX-XXXX` | `RX-4K7M-2QX9` | Unique |
| Demande d'examen | `LB-XXXX-XXXX` | `LB-8QH2-M3ZC` | Unique |
| Rendez-vous | `AP-XXXX-XXXX` | `AP-2M9K-QX7H` | Unique, communiqué au patient |
| Code de partage | `XXXX-XXXX` | `K7M4-QX9P` | 10 minutes, usage unique (F-CIT-11) |
| Code de réclamation | 6 chiffres | `482913` | 30 jours (F-AUTH-03) |

- **RG-GEN-01** — Les identifiants lisibles DOIVENT être générés avec un générateur aléatoire cryptographique (`crypto.randomBytes`), jamais avec `Math.random()`.
- **RG-GEN-02** — Une saisie d'**identifiant santé** dont le caractère de contrôle est faux DOIT être refusée localement avec « Identifiant incorrect, vérifiez la saisie » sans appel au serveur.

## 18.3 Score de détection des doublons

Le score (0 à 100) compare un nouveau dossier à chaque dossier existant de même sexe ou de sexe non renseigné, dont l'année de naissance est à ± 2 ans.

| Critère | Points |
|---|---|
| Nom de famille identique (sans accents) / très proche (similarité Jaro-Winkler ≥ 0,9) | 25 / 18 |
| Au moins un prénom identique / proche | 20 / 12 |
| Date de naissance identique / même année (dont date approximative) | 25 / 10 |
| Téléphone identique | 20 |
| Même sexe | 5 |
| Même commune de résidence | 5 |

Seuils : **≥ 60** = candidat affiché ; **≥ 80** = doublon probable (création forcée → file de revue, RG-CLI-21). Le calcul est fait en base (index trigrammes) sur au plus 200 dossiers présélectionnés.

## 18.4 Référentiels de départ (fournis avec le projet)

| Référentiel | Contenu minimal du MVP | Fichier de départ |
|---|---|---|
| Géographie | 12 départements, 77 communes, zones sanitaires (34), arrondissements (facultatif en MVP) avec codes | `seed/geo/*.csv` |
| Établissements fictifs | 30 établissements répartis sur 4 départements (tous types) | `seed/facilities.csv` |
| Services | 15 services (médecine générale, pédiatrie, maternité, consultation prénatale, vaccination, chirurgie, urgences, laboratoire, pharmacie, dentaire, ophtalmologie, ORL, cardiologie, diabétologie, santé mentale) | `seed/services.csv` |
| CIM-10 | ~200 codes fréquents en soins primaires + tous les codes des groupes de la section 18.6, libellé médical et libellé simplifié pour le patient | `seed/icd10.csv` |
| Médicaments | ~150 présentations de médicaments essentiels courants (DCI, forme, dosage, classe ATC, contre-indications codées) | `seed/medications.csv` |
| Classes et allergies | Correspondance allergie → DCI et classes (pénicillines, céphalosporines, sulfamides, AINS, aspirine, iode, etc.) | `seed/allergy-classes.csv` |
| Examens | ~40 examens (NFS, goutte épaisse, TDR paludisme, glycémie, créatinine, transaminases, VIH, AgHBs, syphilis, ECBU, groupe sanguin, test de grossesse…) avec paramètres, unités et valeurs de référence | `seed/lab-tests.csv` |
| Vaccins | Vaccins du Programme élargi de vaccination (BCG, polio oral et injectable, pentavalent, pneumocoque, rotavirus, rougeole-rubéole, fièvre jaune, méningite A…) avec âges recommandés et intervalles minimaux | `seed/vaccines.csv` |
| Jours fériés | Jours fériés de l'année en cours | `seed/holidays.csv` |

> [!WARNING] Contenu clinique à faire valider
> Les référentiels cliniques (calendrier vaccinal, médicaments, valeurs de référence, signes de danger) sont fournis **pour le développement et la démonstration**. Avant tout usage réel, ils DOIVENT être validés par les autorités sanitaires compétentes (programme de vaccination, autorité du médicament, programme de santé communautaire).

## 18.5 Types d'établissements et rôles autorisés

| Type | Niveau habituel | Rôles qu'il peut affilier |
|---|---|---|
| Centre hospitalier universitaire / hôpital national | Central | `DOCTOR`, `NURSE`, `RECEPTIONIST`, `LAB_TECH`, `LAB_SUPERVISOR`, `PHARMACIST`, `FACILITY_ADMIN` |
| Centre hospitalier départemental | Intermédiaire | Idem |
| Hôpital de zone | Périphérique | Idem |
| Centre de santé (commune ou arrondissement) | Périphérique | `DOCTOR`, `NURSE`, `RECEPTIONIST`, `CHW`, `LAB_TECH`, `LAB_SUPERVISOR`, `PHARMACIST`, `FACILITY_ADMIN` |
| Dispensaire / maternité isolée | Périphérique | `NURSE`, `RECEPTIONIST`, `CHW`, `FACILITY_ADMIN` |
| Clinique / cabinet médical privé | Selon | `DOCTOR`, `NURSE`, `RECEPTIONIST`, `FACILITY_ADMIN` |
| Laboratoire d'analyses (indépendant) | — | `LAB_TECH`, `LAB_SUPERVISOR`, `RECEPTIONIST`, `FACILITY_ADMIN` |
| Pharmacie (officine) | — | `PHARMACIST`, `FACILITY_ADMIN` |

## 18.6 Groupes de maladies et codes sensibles

| Groupe (tableaux de bord) | Codes CIM-10 | Sensible |
|---|---|---|
| Paludisme | B50–B54 | Non |
| Infections respiratoires aiguës | J00–J22 | Non |
| Maladies diarrhéiques | A00–A09 | Non |
| Fièvre typhoïde | A01.0 | Non |
| Hypertension artérielle | I10–I15 | Non |
| Diabète | E10–E14 | Non |
| Drépanocytose | D57 | Non |
| Malnutrition | E40–E46 | Non |
| Rougeole | B05 | Non (déclaration immédiate) |
| Méningite | A39, G00–G03 | Non (déclaration immédiate) |
| Fièvres hémorragiques virales | A90–A99 | Non (déclaration immédiate) |
| Tuberculose | A15–A19 | Non |
| Infections cutanées | L00–L08 | Non |
| Complications de la grossesse | O00–O99 | Non (mais dimension sexe/âge seulement au département) |
| **VIH** | B20–B24, Z21 | **Oui** |
| **Infections sexuellement transmissibles** | A50–A64 | **Oui** |
| **Troubles mentaux et du comportement** | F00–F99 | **Oui** |
| **Interruption de grossesse** | O04–O07 | **Oui** |
| **Violences et maltraitances** | T74, Y05–Y07, X85–Y09 | **Oui** |
| **Addictions** | F10–F19 (inclus dans F) | **Oui** |

**Un code appartient à un seul groupe : le plus spécifique l'emporte.** Maladies diarrhéiques = A00–A09 **sauf A01.0** (typhoïde) ; complications de la grossesse = O00–O99 **sauf O04–O07** (interruption de grossesse, sensible) ; troubles mentaux = F00–F99 **sauf F10–F19** (addictions). La colonne `icd10_codes.disease_group` contient ce groupe unique.

La liste des codes sensibles est un **paramètre de référentiel** (F-ADM-04), pas une constante dans le code.

## 18.7 Plages d'alerte pédiatriques

| Âge | Pouls (alerte hors) | Fréquence respiratoire (alerte si ≥) | Tension systolique (alerte si <) |
|---|---|---|---|
| < 2 mois | 100–180 | 60 | 60 |
| 2–11 mois | 100–160 | 50 | 70 |
| 1–4 ans | 90–140 | 40 | 70 + 2 × âge |
| 5–11 ans | 70–120 | 30 | 80 |
| ≥ 12 ans | Plages adultes (F-CLI-06) | 24 | 90 |

[Valeurs indicatives à faire valider par un médecin référent avant usage réel.]

## 18.8 Catalogue des erreurs

Toutes les erreurs renvoyées par l'API suivent le format de la section 22.2. Le **code** est stable (utilisé par les tests) ; le **message** est en français simple ; aucun détail technique n'est montré à l'utilisateur (V1, Partie 10 §8).

| Code | HTTP | Message affiché |
|---|---|---|
| `VALIDATION_FAILED` | 422 | « Certaines informations sont incorrectes. » + erreurs par champ |
| `VAL_PHONE_OLD_FORMAT` | 422 | « Les numéros béninois comptent désormais 10 chiffres et commencent par 01. » |
| `VAL_BIRTHDATE` | 422 | « Vérifiez la date de naissance. » |
| `UNAUTHENTICATED` | 401 | « Votre session a expiré. Reconnectez-vous. » |
| `MFA_REQUIRED` | 401 | « Saisissez le code de votre application d'authentification. » |
| `REAUTH_REQUIRED` | 401 | « Pour cette action, confirmez votre identité. » |
| `FORBIDDEN` | 403 | « Vous n'avez pas l'autorisation d'effectuer cette action. » |
| `NO_ACTIVE_SPACE` | 403 | « Choisissez l'espace dans lequel vous travaillez. » |
| `NOT_FOUND` / `PATIENT_NOT_FOUND` | 404 | « Élément introuvable. » / « Aucun patient accessible ne correspond. » (réponse identique que le patient n'existe pas ou ne soit pas accessible) |
| `AUTH_INVALID_CREDENTIALS` | 401 | « Identifiant ou mot de passe incorrect. » |
| `AUTH_LOCKED` | 423 | « Trop de tentatives. Réessayez dans [durée]. » |
| `AUTH_ACCOUNT_SUSPENDED` | 403 | « Votre compte est suspendu. Contactez le support. » |
| `AUTH_OTP_INVALID` / `AUTH_OTP_EXPIRED` / `AUTH_OTP_LOCKED` | 422 / 410 / 423 | « Code incorrect. » / « Ce code a expiré. » / « Trop d'essais. Recommencez. » |
| `RATE_LIMITED` | 429 | « Trop de demandes. Réessayez dans quelques minutes. » |
| `INVITATION_INVALID` | 410 | « Cette invitation n'est plus valable. » |
| `APPT_SLOT_FULL` | 409 | « Ce créneau vient d'être réservé. Choisissez-en un autre. » |
| `APPT_LIMIT_REACHED` | 409 | « Vous avez déjà 3 rendez-vous prévus. » |
| `APPT_SAME_DAY` | 409 | « Vous avez déjà un rendez-vous ce jour-là dans cet établissement. » |
| `APPT_RESCHEDULE_LIMIT` | 409 | « Ce rendez-vous a déjà été déplacé 2 fois. Annulez-le et prenez-en un nouveau. » |
| `CLAIM_ALREADY_LINKED` | 409 | « Ce dossier est déjà associé à un compte. Présentez-vous à l'accueil d'un établissement. » |
| `DEPENDENT_LIMIT` | 409 | « Vous avez atteint le nombre maximal de personnes à charge. » |
| `LAST_FACILITY_ADMIN` | 409 | « Vous êtes le seul responsable actif : désignez-en un autre avant cette action. » |
| `SHARE_CODE_INVALID` | 410 | « Ce code de partage est incorrect ou expiré. » |
| `APPT_TOO_LATE_TO_CANCEL` | 409 | « Il est trop tard pour annuler en ligne. Appelez l'établissement. » |
| `APPT_INVALID_TRANSITION` | 409 | « Cette action n'est plus possible pour ce rendez-vous. » |
| `VISIT_ALREADY_OPEN` | 409 | « Ce patient a déjà une visite en cours dans l'établissement. » |
| `CHECKIN_VERIFICATION_FAILED` | 422 | « La vérification du patient a échoué. » |
| `QR_EXPIRED_OR_USED` | 410 | « Code déjà utilisé ou expiré. Demandez au patient d'actualiser sa carte. » |
| `DUPLICATE_CHECK_REQUIRED` | 428 | « Vérifiez d'abord les doublons. » |
| `CLI_DRAFT_EXISTS` | 409 | « Vous avez déjà une consultation en cours pour ce patient. » |
| `CLI_INCOMPLETE` | 422 | « Complétez les sections obligatoires. » + liste |
| `CLI_LOCKED` | 409 | « Cette consultation est validée et ne peut plus être modifiée. Ajoutez un complément. » |
| `PRE_BLOCKING_ALERT` | 422 | « Une alerte de sécurité doit être traitée avant de signer. » |
| `PRE_LOCKED` | 409 | « Cette ordonnance est signée et ne peut plus être modifiée. » |
| `PRE_WEIGHT_REQUIRED` | 422 | « Le poids de l'enfant est obligatoire. » |
| `PHA_NOT_DISPENSABLE` | 409 | « Cette ordonnance ne peut pas être délivrée : [annulée / expirée / déjà délivrée]. » |
| `PHA_QUANTITY_EXCEEDED` | 409 | « La quantité dépasse le reste à délivrer. » |
| `LAB_SELF_VALIDATION` | 403 | « Un résultat doit être validé par une autre personne. » |
| `EMERGENCY_LIMIT` | 429 | « Nombre maximal d'accès d'urgence atteint. Contactez votre responsable. » |
| `SYNC_CLOCK_SKEW` | 422 | « L'heure de votre téléphone est incorrecte. Corrigez-la puis synchronisez. » |
| `FEATURE_DISABLED` | 404 | « Cette fonctionnalité n'est pas disponible. » |
| `INTERNAL_ERROR` | 500 | « Une erreur est survenue. Réessayez. Référence : [identifiant de requête]. » |

## 18.9 Listes, pagination et tri

- **RG-GEN-10** — Toute liste pouvant dépasser 50 éléments DOIT être **paginée côté serveur** avec un **curseur** (et non un numéro de page), 20 éléments par défaut, 100 au maximum.
- **RG-GEN-11** — Toute liste DOIT avoir un tri par défaut documenté et un état vide explicite.

## 18.10 Langue et textes

- **RG-GEN-20** — Aucun texte affiché NE DOIT être écrit en dur dans les composants : tous passent par les fichiers de traduction (`messages/fr.json`), organisés par espace et par écran.
- **RG-GEN-21** — Style des textes citoyens : phrases courtes (moins de 20 mots), vouvoiement, mots courants, pas d'abréviations médicales, verbes d'action sur les boutons (« Prendre rendez-vous » plutôt que « Valider »).
