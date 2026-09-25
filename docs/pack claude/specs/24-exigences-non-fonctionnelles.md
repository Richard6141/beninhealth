# 24. Exigences non fonctionnelles

| Catégorie | Exigence | Cible mesurable | Vérification |
|---|---|---|---|
| Performance (réseau) | Pages citoyennes utilisables en connexion faible | Tableau de bord citoyen < 4 s en « Slow 4G » ; LCP < 2,5 s en 4G | Lighthouse (profil mobile), à chaque étape clé |
| Performance (poids) | Pages légères | JavaScript initial < 200 Ko compressé (citoyen) ; images au format WebP/AVIF | Rapport de build |
| Performance (serveur) | Réponses rapides | 95 % des requêtes API < 500 ms ; recherche patient < 300 ms ; aucune requête SQL > 200 ms sur les données de démonstration | Journaux + `EXPLAIN ANALYZE` |
| Montée en charge | Architecture non bloquante | Index sur toutes les clés étrangères et filtres ; pagination par curseur ; aucune requête « N+1 » ; agrégats pré-calculés ; test de charge : 200 utilisateurs simultanés sur staging sans erreur | Outil de test de charge (k6) en E28 |
| Disponibilité | Service fiable | 99,5 % par mois en production (hors maintenance annoncée) | Supervision |
| Compatibilité | Appareils courants | Android 9+ (Chrome), iOS 15+ (Safari), ordinateur (Chrome, Firefox, Edge récents) ; écrans de 360 à 1 920 px | Tests Playwright mobile + ordinateur |
| Hors ligne | Voir chapitre 13 | Lecture hors ligne citoyen, saisie terrain | Tests en mode avion |
| Accessibilité | WCAG 2.1 AA | Score Lighthouse accessibilité ≥ 95 ; aucune erreur critique axe ; navigation clavier complète des parcours principaux | axe + test manuel |
| Sécurité | Chapitre 23 | 0 accès non autorisé dans la suite de tests ; en-têtes de sécurité conformes | Tests automatisés |
| Traçabilité | Chapitre 5.7 | 100 % des lectures de données patient journalisées | Test automatisé |
| Maintenabilité | Code professionnel | TypeScript strict sans `any` non justifié ; lint sans erreur ; couverture de tests ≥ **80 %** sur `modules/*/rules.ts` et `modules/access`, ≥ 60 % sur le reste | CI |
| Documentation | Livrables V1 (Partie 10 §14) | README, architecture, API, installation, contribution, déploiement, sécurité, guides utilisateurs | Revue avant démonstration |
| Observabilité | Suivi des erreurs et performances | Journaux JSON avec identifiant de requête ; tableau de santé technique (F-ADM-01) ; alerte si une tâche planifiée n'a pas tourné | Supervision |
| Internationalisation | Prêt pour d'autres langues | 0 texte en dur (RG-GEN-20) | Test automatique (recherche de chaînes dans les composants) |
| Horloge | Heure fiable | Serveurs synchronisés (NTP) ; stockage UTC ; affichage Africa/Porto-Novo | Test |
