# 2. Analyse critique de la version initiale et décisions

Une revue professionnelle commence par chercher ce qui est **ambigu, contradictoire, répété ou manquant**. Chaque constat ci-dessous, s'il n'était pas tranché, deviendrait un bug, une faille de sécurité ou un désaccord lors de la démonstration. Pour chacun, une décision est prise ; elle est appliquée dans le reste du document.

## 2.1 Structure du document

| # | Constat | Risque | [DÉCISION] |
|---|---|---|---|
| C01 | Les parties sont dans le désordre (10, 11, 12, 13 avant 2) et la « Partie 1 » n'existe que sous forme de résumé exécutif. | Lecture difficile ; le développeur construit dans le mauvais ordre. | Ordre logique quoi → comment → avec quoi → dans quel ordre. Chapitre 1 reconstitué. |
| C02 | Les mêmes sujets sont répétés 2 à 3 fois avec des variantes (Git, environnements, tests, rôles). Exemple : l'environnement intermédiaire s'appelle « Staging », « Préproduction » ou « Test » selon la partie. | Contradictions, confusion. | Un seul endroit par sujet. Vocabulaire unique : **dev**, **staging** (préproduction), **production**. |
| C03 | La V1 décrit *quoi* faire mais presque jamais *comment* ni *dans quel ordre* : pas de déroulé, pas de règles chiffrées, pas de critères d'acceptation (sauf un exemple). | Chaque développeur (ou Claude Code) invente ses propres règles. | Fiches fonctionnalités complètes (chapitres 7 à 18) sur le modèle de fiche que la V1 demandait elle-même en Partie 11 §5. |

## 2.2 Rôles et droits d'accès

| # | Constat | Risque | [DÉCISION] |
|---|---|---|---|
| C04 | « Le médecin accède aux **patients autorisés** » : la notion d'« autorisé » n'est jamais définie. | Soit tout le monde voit tout (faille), soit personne ne voit rien (inutilisable). | Modèle d'accès formel en 7 **bases d'accès** : soi-même, tutelle, consentement, contexte de soins, accès d'urgence, affectation (labo/pharmacie/agent communautaire), auteur (chapitre 5). Les rôles de pilotage n'ont, eux, accès qu'à des agrégats. |
| C05 | Le modèle annoncé est « RBAC » (droits par rôle) alors que les besoins exigent de vérifier aussi la **relation avec le patient** et le **contexte**. | Un contrôle par rôle seul laisse tout médecin lire tout dossier. | Contrôle en trois couches : rôle → permission → base d'accès pour ce patient (chapitre 5, section 5.3). |
| C06 | « Un utilisateur peut avoir plusieurs rôles » sans préciser comment : un médecin peut travailler dans deux établissements et être aussi patient. | Mélange des contextes, fuite de données entre établissements. | Notion d'**affiliation** (rôle + établissement) et d'**espace actif** : l'utilisateur choisit l'espace dans lequel il travaille ; ses droits dépendent de cet espace. |
| C07 | Le « motif » d'accès est exigé dans l'audit mais on ne sait pas qui le saisit ni quand. | Traçabilité inutilisable ou saisie fastidieuse à chaque clic. | Motif **déduit automatiquement** de la base d'accès (ex. « Consultation du 12/10 ») ; **saisie obligatoire** uniquement pour l'accès d'urgence et les exports. |
| C08 | Aucun rôle d'**accueil** alors que les rendez-vous et l'arrivée des patients doivent être gérés. | Les médecins font l'accueil ; flux irréaliste. | Rôle **RECEPTIONIST** (agent d'accueil). |
| C09 | Aucune **validation** des résultats de laboratoire par un responsable, alors que la V1 mentionne « validation » dans le workflow. | Résultats non vérifiés envoyés au patient. | Rôle **LAB_SUPERVISOR** (biologiste) qui valide ; seuls les résultats validés sont visibles. |
| C10 | Aucun rôle pour contrôler l'audit et les demandes des personnes (gouvernance des données, Partie 7 §12). | Personne n'exploite le journal d'audit. | Rôle **AUDITOR** (auditeur / délégué à la protection des données). |
| C11 | Les **enfants et personnes dépendantes** ne sont pas prévus, alors que la santé infantile et la vaccination sont des cas d'usage cités. | Impossible de gérer le carnet d'un enfant. | Fonction **personnes à charge** (tutelle) avec vérification (fiches F-CIT-07 à F-CIT-09). |
| C12 | Pas de gestion de l'**urgence** : un patient inconscient ne peut pas donner son consentement. | Soit refus de soins numériques, soit contournement dangereux. | **Accès d'urgence (« bris de glace »)** : justification obligatoire, durée 4 h, patient informé, revue systématique (F-CLI-10). |

## 2.3 Identité et dossier patient

| # | Constat | Risque | [DÉCISION] |
|---|---|---|---|
| C13 | « Une identité santé doit être unique » sans mécanisme contre les **doublons**, alors que l'ANIP n'est pas encore intégrée. | Un même patient a trois dossiers ; historique éclaté, risque médical. | Recherche **obligatoire** avant toute création, score de similarité, création forcée justifiée, outil de fusion tracé (F-ADM-06). |
| C14 | Un patient peut être enregistré par un agent ou un établissement **sans avoir de compte** : ce cas n'est pas décrit. | Confusion entre « utilisateur » et « patient ». | Le **Patient** (dossier) est distinct de l'**Utilisateur** (compte). Un dossier peut exister sans compte ; le citoyen le « réclame » ensuite avec un code reçu par SMS (F-AUTH-03). |
| C15 | « Vérification d'identité selon les mécanismes disponibles » : aucun niveau défini. | On ne sait pas quelles actions autoriser à un compte non vérifié. | **4 niveaux de vérification** : N0 déclaratif, N1 téléphone vérifié, N2 vérifié en établissement, N3 vérifié ANIP (P2) (section 5.6). |
| C16 | Pas de **catégories de confidentialité** : un résultat VIH ou une consultation de santé mentale serait visible comme une angine. | Atteinte grave à la vie privée, stigmatisation. | Niveau **SENSIBLE** sur les données concernées : masquées du résumé, visibles seulement par l'auteur ou avec consentement explicite ; certains résultats nécessitent une **annonce par un professionnel** avant d'être visibles par le patient. |
| C17 | « Toute modification doit être historisée » sans méthode. | Historique incomplet ou incohérent. | Données cliniques **immuables après validation** (correction par addendum) ; données modifiables **versionnées** (chapitre 21, section 21.3). |

## 2.4 Modules métier

| # | Constat | Risque | [DÉCISION] |
|---|---|---|---|
| C18 | Les diagnostics sont en texte libre ; or le ministère veut des « tendances sanitaires ». | Aucun indicateur par maladie possible. | Diagnostic principal **codé CIM-10** obligatoire pour valider une consultation (sous-liste de codes fréquents + recherche) (F-CLI-06). |
| C19 | « Signature professionnelle » de l'ordonnance non définie. | Ordonnances falsifiables. | Signature = **ré-authentification** du prescripteur + **empreinte numérique** du contenu + **QR code** de vérification (F-PRE-04). Ce n'est pas une signature électronique qualifiée (P2). |
| C20 | Pas de règles de **validité**, de **délivrance partielle**, ni de **substitution** pour les ordonnances. | Ordonnances délivrées deux fois ou périmées. | Règles RG-PRE et RG-PHA chiffrées (chapitre 11). |
| C21 | « Mode hors connexion » demandé partout, sans périmètre ni règle de **synchronisation** et de conflit. | Projet irréalisable ou données corrompues. | Hors ligne **limité** : lecture des informations déjà chargées pour tous ; **saisie hors ligne uniquement pour l'agent communautaire** (et brouillon de consultation), synchronisation idempotente, pas de conflit possible car les saisies terrain sont des **ajouts** (chapitre 13). |
| C22 | Rendez-vous : annulations et absences citées sans règles. | Créneaux bloqués, abus. | Machine à états complète, délais d'annulation, gestion des absences (chapitre 9). |

## 2.5 Architecture, données et IA

| # | Constat | Risque | [DÉCISION] |
|---|---|---|---|
| C23 | L'architecture cite 7 « services » (Identity Service, Patient Service…), ce qui évoque des **micro-services**, et vise « plusieurs millions d'utilisateurs ». | Pour un débutant, des micro-services multiplient la complexité et les pannes, sans bénéfice au stade MVP. | **Monolithe modulaire** : une seule application Next.js, découpée en modules métier indépendants qui ne communiquent que par leurs interfaces publiques. On pourra extraire un module en service plus tard sans réécrire (chapitre 20). |
| C24 | Le tableau de bord ministère doit « protéger la confidentialité » mais aucune règle d'agrégation n'est donnée. | Une commune avec 1 cas de VIH identifie une personne. | Seuil de **masquage des petits effectifs** (valeurs de 1 à 4 affichées « < 5 »), lecture exclusive de tables agrégées (chapitre 14). |
| C25 | L'IA doit « résumer un dossier », mais rien n'est dit sur **où partent les données**, ni comment éviter les erreurs. | Fuite de données sensibles vers un service externe ; résumé faux pris pour vrai. | IA **désactivable**, désactivée par défaut hors démonstration, données fictives uniquement tant que l'APDP n'a pas autorisé ; résumé toujours accompagné de ses **sources** et relu par le médecin (chapitre 16). |
| C26 | Notifications : SMS, email, internes, sans préciser lequel prime. Au Bénin, l'email est peu utilisé par une partie de la population. | Messages jamais reçus. | **Notification interne + SMS** par défaut ; email optionnel. Contenu des SMS **sans aucune donnée médicale** (chapitre 17). |

> [!IMPORTANT] Pourquoi ces décisions sont prises maintenant
> Elles touchent au **modèle de données** et à la **sécurité**. Les changer après avoir codé les écrans obligerait à tout refaire. C'est pour cela que le plan de construction (chapitre 25) met en place le modèle d'accès, l'audit et les rôles **avant** le moindre écran métier.
