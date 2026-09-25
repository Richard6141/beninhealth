# 1. Vision, contexte et cadrage

## 1.1 Résumé exécutif

**Bénin Health Intelligence Platform** (abrégé **BHIP** dans ce document) est une plateforme nationale de santé numérique. Elle connecte les citoyens, les professionnels de santé, les établissements sanitaires, les laboratoires, les pharmacies et les structures de pilotage du ministère de la Santé.

Elle est conçue comme une **infrastructure numérique évolutive** : elle fait circuler les informations de santé **autorisées**, avec un contrôle strict des accès, et fournit à l'État des indicateurs fiables issus de **données agrégées**.

La première version est un **MVP de démonstration** (challenge) qui doit prouver, sur des **données fictives réalistes**, que le parcours complet fonctionne : un citoyen crée son espace santé, prend rendez-vous, un médecin le consulte et prescrit, la pharmacie délivre, et le ministère voit les indicateurs agrégés.

## 1.2 Contexte sanitaire à prendre en compte

Ces éléments de contexte conditionnent directement la conception. Ils doivent être connus du développeur.

| Élément | Conséquence pour la plateforme |
|---|---|
| Le système de santé est organisé en **pyramide à trois niveaux** : central (ministère, hôpitaux nationaux et universitaires), intermédiaire (12 départements, directions départementales, centres hospitaliers départementaux), périphérique (**zones sanitaires** avec hôpital de zone et centres de santé de premier contact). | Le référentiel des établissements et les tableaux de bord DOIVENT connaître le niveau, le département, la commune et la **zone sanitaire** de chaque établissement. |
| Le pays compte **12 départements** et **34 zones sanitaires** (annuaire des statistiques sanitaires). | Les filtres du tableau de bord ministère DOIVENT proposer : national, département, zone sanitaire, commune, établissement. |
| Les données sanitaires agrégées du pays sont déjà saisies dans **DHIS2** depuis 2014 (système national d'information sanitaire). | BHIP NE DOIT PAS concurrencer DHIS2 : il DEVRAIT pouvoir, plus tard, **exporter** ses agrégats vers DHIS2 (P2). Les définitions d'indicateurs doivent être compatibles. |
| Les numéros de téléphone béninois sont passés à **10 chiffres** (préfixe « 01 ») le 30 novembre 2024. | Le format de téléphone accepté est `+229 01 XX XX XX XX`. Les anciens numéros à 8 chiffres saisis par erreur DOIVENT être signalés. |
| L'identité des personnes relève de l'**ANIP** (Agence nationale d'identification des personnes), qui attribue le **NPI** (numéro personnel d'identification). | L'intégration ANIP est **P2** (autorisations à obtenir). Le MVP prévoit l'emplacement technique (adaptateur) sans appel réel. |
| Les données de santé sont des **données sensibles** au sens du Code du numérique (loi n° 2017-20, livre V) ; leur traitement est soumis à des formalités préalables auprès de l'**APDP**. | Aucune donnée réelle de patient dans le MVP. Conformité détaillée au chapitre 23. |
| Connectivité mobile variable, smartphones d'entrée de gamme fréquents, maîtrise numérique hétérogène, langue officielle française avec de nombreuses langues nationales. | Mobile d'abord, pages légères, mode hors ligne ciblé, vocabulaire simple, icônes toujours accompagnées d'un texte, architecture prête pour la traduction. |

## 1.3 Vision produit

> La plateforme devient une **couche numérique commune** du système sanitaire béninois : le citoyen suit son parcours de santé, le professionnel accède aux informations nécessaires à la prise en charge, et l'État dispose d'indicateurs sanitaires fiables.

Trois promesses guident chaque décision :

1. **Pour le citoyen** : « Mes informations de santé sont au même endroit, je sais qui les a consultées et je décide qui peut les voir. »
2. **Pour le professionnel** : « Je retrouve en quelques secondes ce qui compte pour soigner ce patient, et je documente ma consultation sans ressaisie. »
3. **Pour l'État** : « Je vois l'activité sanitaire du pays, par territoire, sans jamais voir de donnée nominative. »

## 1.4 Objectifs mesurables

Un objectif professionnel est mesurable. Les objectifs de la V1 sont conservés et chiffrés pour le MVP.

| Bénéficiaire | Objectif (V1) | Indicateur | Cible MVP | Mesure |
|---|---|---|---|---|
| Citoyen | Faciliter l'accès aux services | Temps pour créer son compte et son profil santé | < 4 min sur smartphone | Test chronométré avec 5 personnes |
| Citoyen | Faciliter l'accès aux services | Temps pour prendre un rendez-vous | < 90 s | Test chronométré |
| Citoyen | Conserver les documents | Documents et ordonnances visibles dans le dossier après une consultation | 100 % | Test de recette |
| Professionnel | Améliorer la coordination | Temps pour ouvrir le résumé d'un patient autorisé | < 10 s (3 clics) | Test chronométré |
| Professionnel | Réduire les informations manquantes | Consultations validées avec motif + diagnostic codé | 100 % (contrôle bloquant) | Requête SQL |
| Professionnel | Faciliter la prise en charge | Temps pour saisir une consultation simple avec ordonnance | < 5 min | Test chronométré |
| État | Vision globale sécurisée | Données nominatives visibles dans l'espace ministère | **0** | Tests de permissions |
| État | Vision globale | Délai de mise à jour des indicateurs | ≤ 1 h | Horodatage des agrégats |
| Tous | Sécurité | Accès non autorisés réussis lors des tests | **0** | Suite de tests de la matrice (chapitre 26) |
| Tous | Traçabilité | Lectures de données médicales sans trace d'audit | **0** | Test automatisé |
| Tous | Performance | Chargement du tableau de bord citoyen en profil réseau « Slow 4G » | < 4 s | Lighthouse, profil « Slow 4G » |

## 1.5 Utilisateurs prévus

La V1 cite : patients, médecins, infirmiers, agents communautaires, centres de santé, hôpitaux, laboratoires, pharmacies et responsables du ministère. La V2 les traduit en **12 rôles techniques** précis (chapitre 4), en ajoutant quatre rôles indispensables que la V1 n'avait pas nommés : **agent d'accueil**, **responsable de laboratoire** (validation des résultats), **administrateur de la plateforme** et **auditeur / délégué à la protection des données**.

## 1.6 Principes directeurs non négociables

| # | Principe | Traduction concrète |
|---|---|---|
| P1 | **Le patient au centre et maître de ses données** | Consentement explicite, historique des accès visible par le patient, retrait possible à tout moment. |
| P2 | **Moindre privilège** | Chaque utilisateur ne voit que ce qui est nécessaire à sa mission, pour ce patient, à ce moment. |
| P3 | **Tout est tracé** | Chaque lecture, création ou modification de donnée médicale produit une trace d'audit infalsifiable. |
| P4 | **Rien n'est effacé** | Aucune donnée médicale n'est supprimée ; on corrige par ajout (addendum) ou on marque « saisi par erreur ». |
| P5 | **L'humain décide** | L'IA assiste mais ne diagnostique pas et ne valide rien seule. |
| P6 | **Simple d'abord** | Mobile d'abord, parcours courts, vocabulaire courant, fonctionne en connexion faible. |
| P7 | **Ouvert mais maîtrisé** | Identifiants stables, API documentée, compatibilité HL7 FHIR ; aucune donnée ne sort sans règle. |
| P8 | **Construire pour durer** | Architecture modulaire, code testé et documenté, décisions écrites. |

Règle finale de la V1, conservée : chaque décision technique et produit doit répondre à la question **« Cette décision permet-elle de construire une plateforme fiable, accessible et capable d'évoluer vers un système national ? »** Si la réponse est non, la solution est revue.
