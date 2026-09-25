# 29. Risques, glossaire et références

## 29.1 Registre des risques

| Risque | Probabilité | Impact | Parade |
|---|---|---|---|
| Fuite de données de santé par un contrôle d'accès oublié | Élevée chez un débutant | Critique | Fonction unique `authorize()`, test RG-ARC-12, suite de matrice, IDOR, revue E27 |
| Claude Code fait « tout d'un coup » et casse des règles | Élevée | Élevé | `CLAUDE.md`, une étape à la fois, rapport, validation manuelle, tests protégés (RG-TST-02) |
| Retard sur le planning | Élevée | Élevé | Étapes P1 supprimables (25.5), démonstration centrée sur les P0 |
| Doublons de patients sans identifiant national | Élevée | Élevé | Score de doublons, recherche obligatoire, fusion réversible, ANIP en P2 |
| Connectivité faible sur le terrain | Élevée | Moyen | Pages légères, hors ligne ciblé, SMS |
| Faible maîtrise numérique de certains citoyens | Élevée | Moyen | Parcours en 3 écrans, vocabulaire simple, tests utilisateurs, création de dossier au guichet |
| Adoption faible par les professionnels (charge de saisie) | Moyenne | Élevé | Saisie rapide (listes, modèles), constantes par l'infirmier, zéro ressaisie, formation |
| Utilisation de l'IA sur des données réelles sans autorisation | Moyenne | Critique | Désactivée par défaut, données fictives, minimisation, journal |
| Données de démonstration confondues avec des données réelles | Faible | Élevé | Mention « (démo) », bandeau « Données fictives » |
| Non-conformité réglementaire (APDP, hébergement) | Moyenne | Critique | Section 23.8, validation juridique avant tout usage réel |
| Référentiels cliniques inexacts | Moyenne | Élevé | Validation par les autorités sanitaires avant usage réel (18.4) |
| Perte de données | Faible | Critique | Sauvegardes chiffrées doubles, restauration testée |
| Erreur humaine (mauvais patient) | Moyenne | Élevé | Bandeau patient permanent, vérification de présence, « saisi par erreur » tracé |
| Panne réseau prolongée | Moyenne | Moyen | Brouillons locaux, terrain hors ligne, mode dégradé |

## 29.2 Glossaire

| Terme | Définition simple |
|---|---|
| **Affiliation** | Rattachement d'un utilisateur à un rôle dans un établissement (ou une portée géographique). |
| **Agrégat** | Nombre calculé sur un groupe (ex. nombre de consultations d'une commune en octobre), sans donnée individuelle. |
| **ANIP / NPI** | Agence nationale d'identification des personnes / numéro personnel d'identification. |
| **APDP** | Autorité de protection des données à caractère personnel (Bénin). |
| **Audit (journal d')** | Registre infalsifiable de qui a fait quoi, quand, sur quelle donnée. |
| **Base d'accès** | Raison enregistrée qui autorise un acteur à voir les données d'un patient donné (chapitre 5). |
| **Bris de glace** | Accès d'urgence exceptionnel, justifié et contrôlé après coup. |
| **CIM-10** | Classification internationale des maladies (10e révision) de l'OMS : codes des diagnostics. |
| **Consentement** | Autorisation donnée par le patient à un soignant ou un établissement. |
| **Contexte de soins** | Accès temporaire ouvert quand un patient est présent dans un établissement. |
| **DCI** | Dénomination commune internationale : nom scientifique d'un médicament (ex. amoxicilline). |
| **DHIS2** | Logiciel utilisé par le système national d'information sanitaire pour les données agrégées. |
| **Empreinte (hash)** | Code calculé à partir d'un contenu ; si le contenu change d'un seul caractère, l'empreinte change. Sert à prouver qu'un document n'a pas été modifié. |
| **FHIR** | Standard international (HL7) d'échange de données de santé. |
| **Idempotent** | Qu'on peut répéter sans effet supplémentaire (renvoyer deux fois ne crée pas de doublon). |
| **Immuable** | Qui ne peut plus être modifié. |
| **Migration** | Script versionné qui fait évoluer la structure de la base de données. |
| **Monolithe modulaire** | Une seule application découpée en modules indépendants. |
| **MVP** | Produit minimum viable : première version qui démontre la valeur. |
| **OTP** | Code à usage unique (ex. reçu par SMS). |
| **PWA** | Application web installable sur le téléphone, qui peut fonctionner en partie sans réseau. |
| **Ré-authentification** | Confirmation d'identité demandée juste avant une action sensible. |
| **Seed** | Script qui remplit la base avec des données de départ ou de démonstration. |
| **Service worker** | Programme du navigateur qui permet le fonctionnement hors ligne d'une PWA. |
| **TOTP** | Code à 6 chiffres qui change toutes les 30 secondes, affiché par une application d'authentification. |
| **Transaction** | Groupe d'opérations en base qui réussissent toutes ou échouent toutes. |
| **Zero Trust** | Principe : aucune requête n'est de confiance par défaut ; tout est vérifié. |

## 29.3 Références

- Ministère de la Santé du Bénin — Annuaires des statistiques sanitaires (organisation en 12 départements et 34 zones sanitaires ; saisie des données agrégées dans DHIS2 depuis 2014).
- Décret n° 2022-148 portant organisation de la pyramide sanitaire en République du Bénin.
- Loi n° 2017-20 du 20 avril 2018 portant Code du numérique en République du Bénin (livre V : protection des données personnelles) ; Autorité de protection des données à caractère personnel (APDP).
- ARCEP Bénin — passage de la numérotation téléphonique à 10 chiffres (30 novembre 2024).
- HL7 FHIR R4 ; OMS — CIM-10 ; OWASP — Application Security Verification Standard et fiches « Cheat Sheets » ; W3C — WCAG 2.1.
