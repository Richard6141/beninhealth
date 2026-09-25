# 3. Périmètre, priorités et hypothèses

## 3.1 Ce que le MVP doit démontrer

La V1 (Partie 9) fixe sept priorités pour le MVP. Elles sont conservées et deviennent le **socle P0** :

1. Authentification et gestion des rôles.
2. Création d'un profil patient.
3. Création d'un espace professionnel de santé.
4. Consultation médicale numérique.
5. Prescription électronique.
6. Tableau de bord administratif.
7. Visualisation de données sanitaires.

Le **scénario de démonstration** (chapitre 28) enchaîne : un citoyen crée son espace santé → prend rendez-vous → l'accueil enregistre son arrivée → un médecin consulte son dossier autorisé → réalise la consultation → crée une ordonnance → (P1) la pharmacie la délivre → le ministère voit l'activité agrégée.

## 3.2 Classement de toutes les fonctionnalités

Chaque fonctionnalité a une fiche. Le tableau ci-dessous est la **liste de référence** : une fonctionnalité qui n'y figure pas n'est pas à développer.

| Module | P0 — MVP obligatoire | P1 — Important | P2 — Futur (ne pas coder) |
|---|---|---|---|
| Comptes et identité (ch. 7) | F-AUTH-01 création compte citoyen · F-AUTH-02 connexion/déconnexion · F-AUTH-04 mot de passe oublié · F-AUTH-05 activation compte pro · F-AUTH-06 double authentification · F-AUTH-07 espace actif | F-AUTH-03 réclamer un dossier existant · F-AUTH-08 verrouillage d'écran · F-AUTH-09 appareils et sessions | Vérification ANIP (N3) |
| Espace citoyen (ch. 8) | F-CIT-01 première utilisation · F-CIT-02 tableau de bord · F-CIT-03 dossier santé · F-CIT-04 informations déclarées · F-CIT-05 carte santé QR · F-CIT-06 ordonnances et documents · F-CIT-10 autorisations · F-CIT-11 partage temporaire · F-CIT-12 historique des accès | F-CIT-07 ajouter une personne à charge · F-CIT-08 agir pour une personne à charge · F-CIT-13 droits sur ses données | F-CIT-09 fin de tutelle à la majorité (automatisation) |
| Établissements et rendez-vous (ch. 9) | F-ETA-01 recherche · F-ETA-02 fiche établissement · F-ETA-03 gestion fiche · F-ETA-04 personnel · F-ETA-05 agendas · F-RDV-01 prise de RDV · F-RDV-02 annulation · F-RDV-03 confirmation · F-RDV-04 arrivée · F-RDV-05 absences et clôture · F-RDV-07 rappels | F-RDV-06 RDV pris au guichet | Téléconsultation |
| Clinique (ch. 10) | F-CLI-01 tableau de bord pro · F-CLI-02 recherche patient · F-CLI-03 création de dossier · F-CLI-04 résumé · F-CLI-05 démarrer · F-CLI-06 saisie clinique · F-CLI-07 validation · F-CLI-09 historique | F-CLI-08 addendum · F-CLI-10 accès d'urgence · F-CLI-11 vaccination · F-CLI-12 prise en charge infirmière · F-CLI-13 documents | F-CLI-14 référence entre établissements |
| Prescription et pharmacie (ch. 11) | F-PRE-01 à F-PRE-04 création, contrôles, référentiel, signature · F-PRE-06 vérification publique | F-PRE-05 annulation/renouvellement · F-PHA-01 à F-PHA-04 pharmacie | F-PHA-05 stocks |
| Laboratoire (ch. 12) | — | F-LAB-01 à F-LAB-06 | Connexion automates |
| Communautaire et hors ligne (ch. 13) | — | F-COM-01 préparation appareil · F-COM-02 enregistrement · F-COM-03 visite · F-COM-04 vaccination terrain · F-COM-08 synchronisation | F-COM-05 grossesse · F-COM-06 enfant · F-COM-07 campagnes |
| Pilotage (ch. 14) | F-PIL-01 tableau établissement · F-PIL-02 centre national · F-PIL-03 carte · F-PIL-07 calcul des agrégats | F-PIL-04 tendances · F-PIL-05 exports · F-PIL-06 alertes | Export DHIS2, prédiction |
| Administration et audit (ch. 15) | F-ADM-01 tableau admin · F-ADM-02 établissements · F-ADM-03 validation pros · F-ADM-05 comptes · F-AUD-01 journal d'audit | F-ADM-04 référentiels · F-ADM-06 fusion de doublons · F-ADM-07 paramètres · F-AUD-02 revue urgences · F-AUD-03 anomalies · F-AUD-04 demandes de droits | — |
| IA (ch. 16) | — | F-IA-01 résumé pour médecin · F-IA-05 gouvernance IA | F-IA-02 assistant citoyen · F-IA-03 aide à la saisie · F-IA-04 analyses ministère |
| Notifications (ch. 17) | F-NOT-01 centre de notifications · F-NOT-02 SMS · F-NOT-04 catalogue | F-NOT-03 préférences | WhatsApp, messages vocaux |
| Interopérabilité (ch. 22) | API REST documentée | Façade FHIR en lecture | Écriture FHIR, DHIS2, ANIP, assurance |

> [!WARNING] Règle de discipline
> Aucune P2 n'est codée dans le MVP : elles sont décrites uniquement pour que l'architecture ne les empêche pas plus tard. Pour les P1, **l'ordre du plan de construction (chapitre 25) fait foi** : les petites parties P1 intégrées à une étape P0 y sont réalisées ; les étapes entièrement P1 (E18 à E22, E25, E26) sont réalisées dans l'ordre du plan si le calendrier le permet, et peuvent être **reportées après E24** si l'une des étapes P0 prend du retard.

## 3.3 Hors périmètre du MVP

- Paiement en ligne (consultation, mobile money) et facturation des actes.
- Assurance maladie, tiers payant.
- Téléconsultation vidéo.
- Imagerie médicale (DICOM) : on stocke seulement des comptes rendus en PDF ou image.
- Applications mobiles natives (la PWA en tient lieu).
- Connexion réelle à l'ANIP, à DHIS2 ou à des automates de laboratoire.
- Toute donnée réelle de patient.

## 3.4 Hypothèses

| # | Hypothèse | Si elle est fausse |
|---|---|---|
| H1 | Le MVP est évalué sur des données **fictives** réalistes. | Formalités APDP à réaliser avant tout usage réel (chapitre 23). |
| H2 | Un développeur débutant à temps plein, aidé de Claude Code, pendant environ 14 semaines. | Réduire aux P0 ; le plan (chapitre 25) indique les étapes supprimables. |
| H3 | Les SMS sont **simulés** en développement et en démonstration (boîte d'envoi visible dans l'application). | Brancher un fournisseur SMS via l'adaptateur prévu (chapitre 17). |
| H4 | Le français est la seule langue du MVP, mais tous les textes passent par des fichiers de traduction. | Ajout des langues nationales sans modifier le code. |
| H5 | Hébergement de démonstration sur un serveur unique avec Docker. | Architecture de production décrite au chapitre 27. |
| H6 | Les référentiels (CIM-10, médicaments, examens, vaccins, géographie) sont chargés depuis des fichiers de départ fournis avec le projet (sous-ensembles). | Import complet ultérieur via F-ADM-04. |
