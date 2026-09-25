# 28. Données de démonstration et présentation

## 28.1 Principes

- **RG-DEMO-01** — Toutes les données de démonstration sont **fictives** (V1, Partie 9 §4) mais **réalistes** et ancrées dans le contexte béninois : noms courants, communes réelles, pathologies fréquentes (paludisme, infections respiratoires, diarrhées, hypertension, diabète, drépanocytose), calendrier vaccinal.
- **RG-DEMO-02** — Les établissements de démonstration portent la mention **« (démo) »** dans leur nom, pour ne jamais être confondus avec des établissements réels.
- **RG-DEMO-03** — Le jeu de données est **reproductible** : `pnpm db:reset` recrée exactement les mêmes données (générateur aléatoire à graine fixe), avec des dates **relatives** à aujourd'hui (les rendez-vous « de demain » sont toujours demain).

## 28.2 Établissements de démonstration (extrait)

| Nom | Type | Commune | Département |
|---|---|---|---|
| CHD Ouémé (démo) | Centre hospitalier départemental | Porto-Novo | Ouémé |
| Hôpital de zone Abomey-Calavi (démo) | Hôpital de zone | Abomey-Calavi | Atlantique |
| CS Akpakpa (démo) | Centre de santé | Cotonou | Littoral |
| CS Godomey (démo) | Centre de santé | Abomey-Calavi | Atlantique |
| CS Zogbadjè (démo) | Centre de santé | Abomey-Calavi | Atlantique |
| CS Banikoara (démo) | Centre de santé | Banikoara | Alibori |
| Laboratoire Cotonou Centre (démo) | Laboratoire | Cotonou | Littoral |
| Pharmacie Étoile (démo) | Pharmacie | Cotonou | Littoral |
| Clinique Les Palmiers (démo) | Clinique privée | Parakou | Borgou |

Au total 30 établissements sur 4 départements (Littoral, Atlantique, Ouémé, Borgou) + quelques-uns dans d'autres départements pour la carte.

## 28.3 Comptes de démonstration

Mot de passe commun de démonstration : défini dans le `README` (jamais utilisé hors dev et staging). Les codes du second facteur sont lisibles sur `/dev/comptes-demo`.

| Identifiant (téléphone ou email) | Rôle | Espace | Situation préparée |
|---|---|---|---|
| +229 01 90 00 00 01 | CITIZEN | Citoyen | **Aïcha DOSSOU**, 34 ans, allergique à la pénicilline, hypertendue, 2 enfants à charge (1 vérifié, 1 déclaré), historique de 6 consultations, 1 ordonnance active, rendez-vous demain au CS Akpakpa |
| +229 01 90 00 00 02 | CITIZEN | Citoyen | **Koffi AGBODJAN**, 58 ans, diabétique, résultats de laboratoire anormaux, a autorisé le Dr Hounkpè pour 30 jours |
| +229 01 90 00 00 03 | CITIZEN | Citoyen | **Rachida SANNI**, 27 ans, une consultation **sensible** et un résultat en attente d'annonce |
| +229 01 90 00 00 04 | CITIZEN | Citoyen | Compte neuf, pour tester la première utilisation |
| Code de réclamation affiché sur `/dev/comptes-demo` | — | — | **Jean KOSSOU**, dossier sans compte créé au CS Godomey |
| medecin.akpakpa@demo.bhip.bj | DOCTOR | Pro — CS Akpakpa (démo) | **Dr Adèle HOUNKPÈ**, médecin généraliste, aussi affiliée à la Clinique Les Palmiers |
| medecin.attente@demo.bhip.bj | DOCTOR | — | Profil **en attente de validation** |
| infirmier.akpakpa@demo.bhip.bj | NURSE | Pro — CS Akpakpa (démo) | **Serge TCHIBOZO**, infirmier |
| accueil.akpakpa@demo.bhip.bj | RECEPTIONIST | Pro — CS Akpakpa (démo) | **Mireille ADJOVI** |
| relais.godomey@demo.bhip.bj | CHW | Terrain — CS Godomey (démo) | **Mathieu SOSSOU**, aire : 3 quartiers, 120 personnes |
| labo.tech@demo.bhip.bj | LAB_TECH | Labo — Laboratoire Cotonou Centre (démo) | Technicienne |
| labo.bio@demo.bhip.bj | LAB_SUPERVISOR | Labo — Laboratoire Cotonou Centre (démo) | Biologiste |
| pharmacie@demo.bhip.bj | PHARMACIST | Pharmacie Étoile (démo) | Pharmacien |
| direction.akpakpa@demo.bhip.bj | FACILITY_ADMIN | Établissement — CS Akpakpa (démo) | Responsable |
| ministere@demo.bhip.bj | HEALTH_AUTHORITY (NATIONAL) | Pilotage | Analyste national |
| dds.littoral@demo.bhip.bj | HEALTH_AUTHORITY (DEPARTMENT Littoral) | Pilotage | Direction départementale |
| auditeur@demo.bhip.bj | AUDITOR | Audit | Délégué à la protection des données |
| admin@demo.bhip.bj | PLATFORM_ADMIN | Administration | Administrateur |

## 28.4 Volume d'activité simulée

300 patients fictifs, 6 mois d'historique : environ 2 500 consultations (répartition réaliste des diagnostics, pic de paludisme en saison des pluies), 1 800 ordonnances dont 75 % délivrées, 600 demandes d'examens, 900 vaccinations (dont terrain), 3 000 rendez-vous (dont 12 % d'absences), une alerte épidémiologique de paludisme préparée dans une zone. Les agrégats sont calculés à la fin du seed.

## 28.5 Scénario de démonstration (8 à 10 minutes)

Structure recommandée par la V1 (Partie 11 §11 et Partie 13 §9) : problème → solution → citoyen → professionnel → ministère → vision nationale.

| Temps | Séquence | Écran | Message clé |
|---|---|---|---|
| 0:00 | **Le problème** (1 diapositive) | — | Informations dispersées, dossiers papier perdus, peu de données fiables pour décider |
| 0:45 | **La solution** (1 diapositive + schéma) | — | Une couche numérique commune, centrée sur le patient, sécurisée |
| 1:30 | **Citoyen** : Aïcha ouvre son tableau de bord, montre son dossier, sa carte santé, prend rendez-vous | Téléphone | Simple, rapide, sur mobile |
| 3:00 | Aïcha montre « Qui a consulté mon dossier » et ses autorisations | Téléphone | Le patient garde le contrôle |
| 3:45 | **Accueil** scanne la carte santé | Tablette ou ordinateur | Présence prouvée, accès ouvert pour la visite |
| 4:15 | **Médecin** : résumé (allergie en rouge), consultation, diagnostic codé, ordonnance → alerte pénicilline → correction → signature | Ordinateur | Sécurité du patient, zéro ressaisie |
| 6:15 | **Pharmacie** scanne l'ordonnance, délivre | Téléphone | Ordonnance infalsifiable, traçabilité |
| 7:00 | **Ministère** : centre national, carte, filtre département, paludisme sur 12 semaines, alerte | Grand écran | Pilotage en temps quasi réel, **aucune donnée nominative** |
| 8:30 | **Vision nationale** (1 diapositive) : pilote, extension, interopérabilité FHIR/DHIS2, ANIP | — | Une base durable et ouverte |

**Plan de secours** : vidéo enregistrée du scénario complet ; staging et local prêts ; téléphone de démonstration chargé ; données remises à zéro 1 heure avant.

## 28.6 Checklist avant démonstration (V1, Partie 13 §8, précisée)

| Domaine | Point | Coché |
|---|---|---|
| Produit | Parcours du scénario 28.5 réalisé 2 fois sans erreur | ☐ |
| Produit | Données cohérentes (dates relatives à jour, agrégats recalculés) | ☐ |
| Produit | Comptes de démonstration testés (y compris second facteur) | ☐ |
| Interface | Design finalisé, responsive, aucune erreur visuelle, textes relus | ☐ |
| Interface | Bandeau « Données fictives » visible | ☐ |
| Technique | Application déployée sur staging en HTTPS | ☐ |
| Technique | Sauvegarde du jour disponible ; test de restauration documenté | ☐ |
| Technique | Documentation prête (README, architecture, API, sécurité, guides) | ☐ |
| Sécurité | Suite de tests de permissions verte ; pages `/dev` inaccessibles en production | ☐ |

## 28.7 Livrables attendus (V1, Partie 9 §11)

Code source complet (dépôt Git avec historique propre) · documentation technique (architecture, API, sécurité, décisions) · documentation utilisateur (un guide par rôle) · procédure d'installation · base de démonstration (script de seed) · comptes de test · version déployée · présentation du produit (diapositives + vidéo de secours) · rapports de fin d'étape E00 à E30 · grille de recette remplie.
