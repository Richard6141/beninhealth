# 8. Fiches fonctionnelles — Espace citoyen

L'espace citoyen utilise la couleur **verte** (section 19.2), des textes de 17 px minimum, une action principale par écran et un vocabulaire sans jargon (« ordonnance » plutôt que « prescription », « analyse » plutôt que « examen biologique »).

### F-CIT-01 — Assistant de première utilisation

| Élément | Valeur |
|---|---|
| Rôles | `CITIZEN` (juste après F-AUTH-01) |
| Priorité / étape | P0 / E10 |
| Écrans | `/citoyen/bienvenue` (4 étapes) |
| API | `PATCH /api/v1/me/patient/declared` |

**Objectif.** Constituer un profil santé minimal utile en urgence, en 2 minutes, sans obliger à tout remplir.

**Déroulé pas à pas.** Une barre de progression « Étape X sur 4 » est affichée. Chaque étape a deux boutons : « Continuer » et « Passer cette étape ». Chaque étape est **enregistrée dès qu'on la quitte**.

| Étape | Question | Saisie |
|---|---|---|
| 1 | « Connaissez-vous votre groupe sanguin ? » | Boutons : A+, A−, B+, B−, AB+, AB−, O+, O−, « Je ne sais pas » |
| 2 | « Avez-vous des allergies ? » | « Non » / « Je ne sais pas » / « Oui » → liste de suggestions fréquentes (pénicilline, aspirine, sulfamides, arachide, fruits de mer, iode…) + champ libre ; pour chacune : réaction (liste) |
| 3 | « Avez-vous une maladie qui dure dans le temps ? » | Suggestions : hypertension, diabète, drépanocytose, asthme, épilepsie, VIH (**marqué sensible automatiquement**, avec l'explication « Cette information ne sera visible que par vous et les soignants que vous autorisez »), autre (libre) |
| 4 | « Qui prévenir en cas d'urgence ? » | Nom, lien (liste), téléphone (format RG-AUTH-01) |

À la fin : écran « Votre espace santé est prêt » avec la carte santé et le bouton « Aller à mon tableau de bord ».

**Règles strictes.**

- **RG-CIT-01** — Toute information saisie par le citoyen DOIT être marquée **« déclarée par le patient »** et affichée ainsi aux professionnels, distinctement des informations **« confirmées par un professionnel »**.
- **RG-CIT-02** — L'assistant NE DOIT PAS réapparaître une fois terminé ou passé ; un bandeau discret « Complétez votre profil (2/4) » reste sur le tableau de bord tant que des étapes ont été passées.
- **RG-CIT-03** — Maximum **3 contacts d'urgence**.

**Critères d'acceptation.** CA-1 : un citoyen qui passe les 4 étapes arrive sur le tableau de bord sans erreur. CA-2 : une allergie déclarée apparaît chez le médecin avec l'étiquette « déclarée par le patient ». CA-3 : la maladie « VIH » déclarée est absente du résumé d'un médecin qui n'a pas le niveau `FULL_SENSITIVE`.

### F-CIT-02 — Tableau de bord citoyen

| Élément | Valeur |
|---|---|
| Rôles | `CITIZEN` (et tuteur agissant pour une personne à charge) |
| Priorité / étape | P0 / E11 |
| Écrans | `/citoyen` |
| API | `GET /api/v1/me/dashboard` |

**Composition, de haut en bas (ordre imposé).**

1. **En-tête** : prénom, sélecteur de personne (moi / personnes à charge), cloche de notifications avec le nombre de non lues, accès au compte.
2. **Alertes importantes** (si présentes) : résultat disponible, rendez-vous annulé par l'établissement, accès d'urgence réalisé sur le dossier, demande de consentement reçue, profil incomplet.
3. **Prochain rendez-vous** : date en toutes lettres (« Mardi 14 octobre à 9 h 30 »), établissement, service, boutons « Itinéraire » et « Annuler ».
4. **Traitements en cours** : ordonnances actives (non expirées) avec les médicaments et la posologie en langage simple (« 1 comprimé matin et soir pendant 5 jours »).
5. **Derniers documents** : les 3 plus récents (ordonnance, résultat, compte rendu).
6. **Actions rapides** (4 grandes tuiles, toujours dans cet ordre) : « Prendre rendez-vous », « Mon dossier », « Mes résultats », « Partager mon dossier ».

**Règles strictes.**

- **RG-CIT-10** — Le tableau de bord DOIT fonctionner **hors ligne en lecture** avec les dernières données chargées, affichant « Hors connexion — données du [date heure] ».
- **RG-CIT-11** — Une section vide DOIT afficher un message utile, jamais un blanc (ex. « Aucun rendez-vous prévu » + bouton « Prendre rendez-vous »).
- **RG-CIT-12** — La page DOIT se charger en moins de 4 s sur un profil réseau « Slow 4G » (objectif section 1.4).

**Critères d'acceptation.** CA-1 : après une consultation avec ordonnance, le traitement apparaît dans « Traitements en cours ». CA-2 : en mode avion, la page s'affiche avec la mention de la date des données.

### F-CIT-03 — Consulter son dossier santé

| Élément | Valeur |
|---|---|
| Rôles | `CITIZEN` (base `SELF` ou `GUARDIAN`) |
| Priorité / étape | P0 / E11 |
| Écrans | `/citoyen/dossier`, `/citoyen/dossier/[type]/[id]` |
| API | `GET /api/v1/me/record/summary`, `GET /api/v1/me/record/timeline?type=&from=&to=&cursor=` |

**Contenu.**

- **Résumé santé** (en haut) : groupe sanguin, allergies, maladies chroniques, traitements actifs, dernières vaccinations. Chaque élément porte l'étiquette « déclaré par vous » ou « confirmé par [professionnel] le [date] ».
- **Chronologie** (en dessous), du plus récent au plus ancien, 20 éléments par page avec « Voir plus » : consultations, ordonnances, analyses, vaccinations, documents, hospitalisations (P2). Filtres : type, année, établissement.
- **Détail d'une consultation** vu par le patient : date, établissement, professionnel, motif, diagnostic **en langage courant** (libellé CIM-10 simplifié), conclusion et conseils, ordonnance liée, analyses demandées. Les **notes internes** du médecin (champ « observations cliniques réservées ») ne sont pas affichées au patient [DÉCISION, section 10, RG-CLI-54].

**Règles strictes.**

- **RG-CIT-20** — Un résultat marqué « à annoncer par un professionnel » (F-LAB-05) NE DOIT PAS apparaître tant que le professionnel ne l'a pas libéré ; la chronologie affiche seulement « Un résultat vous sera communiqué par votre médecin ».
- **RG-CIT-21** — Chaque ouverture du dossier par le citoyen lui-même n'est **pas** affichée dans son historique d'accès (on n'y montre que les autres), mais elle est journalisée.
- **RG-CIT-22** — Les éléments marqués « saisi par erreur » DOIVENT apparaître barrés avec la mention « Retiré le [date] par [professionnel] : [motif] ».

**Critères d'acceptation.** CA-1 : un citoyen voit ses 3 dernières consultations dans l'ordre chronologique inverse. CA-2 : il ne voit jamais les observations réservées. CA-3 : un résultat VIH non libéré n'apparaît pas (vérification dans la réponse de l'API, pas seulement à l'écran).

### F-CIT-04 — Gérer ses informations déclarées

| Élément | Valeur |
|---|---|
| Rôles | `CITIZEN` |
| Priorité / étape | P0 / E11 |
| Écrans | `/citoyen/dossier/infos` |
| API | `POST/PATCH /api/v1/me/allergies`, `/me/conditions`, `/me/emergency-contacts` |

**Déroulé.** Le citoyen ajoute, modifie ou retire une information **qu'il a lui-même déclarée** (allergie, maladie chronique, contact d'urgence, groupe sanguin si non confirmé). Chaque modification crée une nouvelle **version** (section 21.3).

**Règles strictes.**

- **RG-CIT-30** — Une information **confirmée par un professionnel** NE PEUT PAS être modifiée ni retirée par le citoyen. Il peut seulement cliquer « Signaler une erreur », ce qui crée une demande de rectification (F-CIT-13) visible par le professionnel auteur.
- **RG-CIT-31** — « Retirer » une allergie déclarée ne l'efface pas : elle passe au statut `RETIRED` avec la date, et reste visible dans l'historique des versions pour les professionnels.

**Critère d'acceptation.** CA-1 : le bouton « Modifier » n'existe pas sur une allergie confirmée par un médecin, et l'API renvoie 403 si on tente la modification.

### F-CIT-05 — Carte santé numérique (QR)

| Élément | Valeur |
|---|---|
| Rôles | `CITIZEN` |
| Priorité / étape | P0 / E11 |
| Écrans | `/citoyen/carte` |
| API | `POST /api/v1/me/health-card/token` |

**Objectif.** Permettre à l'accueil d'un établissement de **prouver la présence** du patient et de retrouver son dossier sans saisie.

**Déroulé.**

1. Le citoyen ouvre « Ma carte santé » : nom, prénoms, date de naissance, photo (P2), **identifiant santé** en gros caractères, niveau de vérification, et un **QR code**.
2. Le QR contient un **jeton temporaire signé** (valable **5 minutes**, usage unique), jamais l'identifiant en clair ni aucune donnée médicale. Il se régénère automatiquement toutes les 5 minutes quand l'écran est ouvert (compte à rebours visible).
3. Hors ligne, la carte affiche l'identifiant santé et un QR **hors ligne** de secours contenant uniquement l'identifiant santé (qui ne suffit pas à ouvrir un contexte de soins sans vérification complémentaire).
4. Bouton « Imprimer ma carte » (P1) : PDF au format carte bancaire avec l'identifiant santé (sans QR dynamique).

**Règles strictes.**

- **RG-CIT-40** — Le jeton du QR DOIT être signé côté serveur (HMAC) et contenir : identifiant interne du patient, date d'expiration, nonce ; il DOIT être refusé après usage ou expiration.
- **RG-CIT-41** — Le scan d'un QR hors ligne (identifiant seul) DOIT exiger en plus le code SMS ou la vérification sur pièce (RG-ACC-20).

**Critères d'acceptation.** CA-1 : un QR scanné une deuxième fois est refusé (« Code déjà utilisé, demandez au patient d'actualiser sa carte »). CA-2 : un QR vieux de 6 minutes est refusé.

### F-CIT-06 — Ordonnances, résultats et documents

| Élément | Valeur |
|---|---|
| Rôles | `CITIZEN` |
| Priorité / étape | P0 (ordonnances) / P1 (résultats, documents) — E11, E17, E19, E20 |
| Écrans | `/citoyen/ordonnances`, `/citoyen/ordonnances/[id]`, `/citoyen/resultats`, `/citoyen/documents` |
| API | `GET /api/v1/me/prescriptions`, `GET /api/v1/me/lab-results`, `GET /api/v1/me/documents`, `GET /api/v1/me/documents/{id}/download` |

**Ordonnance vue par le patient.** Statut en clair (« Valable jusqu'au 12 janvier » / « Délivrée en partie » / « Délivrée » / « Expirée » / « Annulée »), médicaments avec posologie en langage simple, prescripteur, établissement, **QR de l'ordonnance** à présenter en pharmacie, bouton « Télécharger en PDF ».

**Résultat vu par le patient.** Nom de l'analyse, date, laboratoire, valeur, unité, valeurs normales, indicateur visuel (normal / hors normes) **sans interprétation médicale**, avec la mention « Discutez de ce résultat avec votre médecin ».

**Règles strictes.**

- **RG-CIT-50** — Chaque téléchargement de document DOIT passer par une URL temporaire (60 secondes) générée **après** contrôle d'accès, et être journalisé `DOWNLOAD`.
- **RG-CIT-51** — Le PDF d'une ordonnance DOIT porter la mention « Document généré par BHIP — vérifiable en scannant le QR code ».

**Critère d'acceptation.** CA-1 : une URL de téléchargement réutilisée après 60 s renvoie une erreur.

### F-CIT-07 — Ajouter une personne à charge

| Élément | Valeur |
|---|---|
| Rôles | `CITIZEN` de niveau N1 minimum |
| Priorité / étape | P1 / E10 |
| Écrans | `/citoyen/proches/ajouter` |
| API | `POST /api/v1/me/dependents` |

**Objectif.** Un parent suit le carnet de santé (vaccinations, rendez-vous, consultations) de ses enfants ; un aidant suit une personne dépendante.

**Déroulé pas à pas.**

1. Le citoyen choisit « Enfant de moins de 15 ans » ou « Personne majeure dont je m'occupe ».
2. **Enfant** : saisit nom, prénoms, date de naissance, sexe, lien (mère, père, tuteur légal). Le système cherche un dossier existant (même nom, prénoms, date de naissance, et téléphone du parent déjà enregistré comme contact). S'il le trouve, il propose le rattachement ; sinon, il crée le dossier.
3. **Personne majeure** : la personne concernée doit **accepter** depuis son propre compte (notification), ou la tutelle doit être déclarée à l'accueil d'un établissement avec justificatif (N2).
4. La tutelle est créée au statut `DECLARED` (non vérifiée).
5. Lors d'un passage en établissement, l'accueil peut la passer à `VERIFIED` après avoir vu un justificatif (acte de naissance, carnet de santé, jugement de tutelle) ; le type de justificatif est enregistré.

**Règles strictes.**

- **RG-CIT-60** — Tutelle `DECLARED` : le tuteur PEUT prendre des rendez-vous, voir le carnet de vaccination et les rendez-vous ; il NE PEUT PAS voir les consultations, ordonnances et résultats. Tutelle `VERIFIED` : accès complet selon RG-ACC-30.
- **RG-CIT-61** — Maximum **10 personnes à charge** par compte ; maximum **2 tuteurs vérifiés** par enfant.
- **RG-CIT-62** — Si un deuxième parent déclare le même enfant, le premier tuteur vérifié est notifié.

**Critères d'acceptation.** CA-1 : un parent avec tutelle `DECLARED` reçoit une réponse 403 sur l'API des consultations de l'enfant. CA-2 : après vérification à l'accueil, il voit les consultations.

### F-CIT-08 — Agir pour une personne à charge

| Élément | Valeur |
|---|---|
| Rôles | Tuteur |
| Priorité / étape | P1 / E11 |
| Écrans | Sélecteur de personne dans l'en-tête de l'espace citoyen |

**Déroulé.** Le tuteur choisit la personne dans le sélecteur ; tout l'espace citoyen (tableau de bord, dossier, rendez-vous, carte santé) s'affiche **pour cette personne**, avec un bandeau coloré permanent « Vous agissez pour : [prénom] ». Chaque action est journalisée avec la base `GUARDIAN`.

**Règle stricte.** **RG-CIT-70** — Le bandeau NE DOIT JAMAIS disparaître tant qu'une personne à charge est sélectionnée, pour éviter une prise de rendez-vous au mauvais nom.

**Critère d'acceptation.** CA-1 : un rendez-vous pris avec l'enfant sélectionné est bien au nom de l'enfant (vérification en base).

### F-CIT-09 — Fin de tutelle à la majorité (P2)

À la date des 18 ans, une tâche planifiée met fin à la base `GUARDIAN`, notifie le tuteur et envoie à la personne (si un téléphone est connu) un code de réclamation (F-AUTH-03). **MVP** : l'administrateur termine la tutelle manuellement.

### F-CIT-10 — Gérer ses autorisations de partage

| Élément | Valeur |
|---|---|
| Rôles | `CITIZEN` (ou tuteur vérifié) |
| Priorité / étape | P0 / E12 |
| Écrans | `/citoyen/partage`, `/citoyen/partage/nouveau` |
| API | `GET/POST /api/v1/me/consents`, `POST /api/v1/me/consents/{id}/revoke` |

**Objectif.** Le patient décide qui accède à son dossier, à quel niveau et pour combien de temps (base B3, chapitre 5).

**Déroulé — accorder une autorisation.**

1. Le citoyen touche « Autoriser un soignant ou un établissement ».
2. Il cherche un **professionnel** (par nom + établissement) ou un **établissement** (par nom + commune). Seuls les professionnels validés et les établissements actifs apparaissent.
3. Il choisit le **niveau**, présenté en langage simple :
   - « **L'essentiel** » (`SUMMARY`) : groupe sanguin, allergies, maladies chroniques, traitements en cours, vaccins.
   - « **Tout mon dossier** » (`FULL`) : en plus, consultations, ordonnances, analyses, documents — **sauf** informations sensibles.
   - « **Tout, y compris les informations sensibles** » (`FULL_SENSITIVE`) : uniquement vers un professionnel nommé, uniquement avec un compte N2 (RG-ACC-13).
4. Il choisit la **durée** : 24 heures, 7 jours, 30 jours, 6 mois, 12 mois.
5. Un écran de confirmation récapitule en une phrase : « Dr Adèle Hounkpè (CS Akpakpa) pourra voir **tout votre dossier sauf les informations sensibles** jusqu'au **14 novembre 2026**. » → « Confirmer ».
6. Le système crée le consentement, notifie le bénéficiaire, journalise `CONSENT_GRANT`.

**Déroulé — retirer.** Chaque autorisation active a un bouton « Retirer » → confirmation → effet en moins de 60 secondes (RG-ACC-04), notification au bénéficiaire, trace `CONSENT_REVOKE`.

**Déroulé — demandes reçues.** Si un professionnel a demandé l'accès, la demande apparaît en haut avec « Accepter » (ouvre l'étape 3 pré-remplie) ou « Refuser ».

**Règles strictes.** RG-ACC-10 à RG-ACC-15. **RG-CIT-80** — La liste DOIT afficher séparément les autorisations **actives**, **expirées** (90 derniers jours) et **retirées**. **RG-CIT-81** — Les accès via contexte de soins (B4) en cours DOIVENT aussi être affichés (« L'équipe du CS Akpakpa peut voir votre résumé jusqu'au 15/10 à 9 h — lié à votre visite ») avec un bouton « Mettre fin » qui réduit l'accès au seul droit de terminer la consultation en cours.

**Critères d'acceptation.** CA-1 : après retrait, le médecin reçoit l'erreur `PATIENT_NOT_FOUND` (« Aucun patient accessible ne correspond. ») en moins de 60 s. CA-2 : l'option « Tout, y compris sensible » est grisée pour un établissement ou un compte N1, avec l'explication.

### F-CIT-11 — Partager son dossier par code temporaire

| Élément | Valeur |
|---|---|
| Rôles | `CITIZEN` |
| Priorité / étape | P0 / E12 |
| Écrans | `/citoyen/partage/code` ; côté pro : `/pro/patients` (champ « Code de partage ») |
| API | `POST /api/v1/me/share-codes`, `POST /api/v1/share-codes/redeem` |

**Objectif.** Partager rapidement son dossier avec un soignant présent devant soi, sans le chercher dans une liste.

**Déroulé.** Le citoyen choisit niveau et durée (comme F-CIT-10), puis obtient un **code à 8 caractères** (ex. `K7M4-QX9P`) et un QR, valables **10 minutes**, usage unique. Le professionnel saisit ou scanne le code dans son espace ; le consentement est alors créé **à son nom** et le citoyen voit « Partagé avec Dr X » en temps réel (rafraîchissement toutes les 5 s de l'écran du code).

**Règles strictes.** **RG-CIT-90** — Le code DOIT être généré sans caractères ambigus (pas de 0/O, 1/I/L), stocké haché, 5 essais de saisie maximum par professionnel et par heure. **RG-CIT-91** — Seul un `DOCTOR` ou un `NURSE` validé, dans un espace actif, peut utiliser un code.

**Critère d'acceptation.** CA-1 : un code utilisé par un pharmacien est refusé (seuls `DOCTOR` et `NURSE` peuvent utiliser un code de partage).

### F-CIT-12 — Qui a consulté mon dossier

| Élément | Valeur |
|---|---|
| Rôles | `CITIZEN` (et tuteur vérifié) |
| Priorité / étape | P0 / E12 |
| Écrans | `/citoyen/acces` |
| API | `GET /api/v1/me/access-log?cursor=` |

**Affichage.** Liste du plus récent au plus ancien, **regroupée par personne et par jour** : « **Dr Adèle Hounkpè**, médecin — CS Akpakpa — mardi 14 octobre — a consulté : résumé, consultations — raison : visite du 14/10 ». Les accès d'urgence apparaissent en rouge en tête, avec la justification saisie par le professionnel. Filtres : période, type d'accès.

**Règles strictes.** **RG-CIT-100** — La liste DOIT inclure tous les accès `ALLOWED` d'autres personnes, y compris laboratoire, pharmacie et agent communautaire. **RG-CIT-101** — Bouton « Je ne reconnais pas cet accès » → crée un signalement pour l'auditeur (F-AUD-04).

**Critère d'acceptation.** CA-1 : après qu'un médecin a ouvert le résumé, la ligne apparaît dans la liste du patient dans la minute.

### F-CIT-13 — Exercer ses droits sur ses données

| Élément | Valeur |
|---|---|
| Rôles | `CITIZEN` |
| Priorité / étape | P1 / E27 |
| Écrans | `/citoyen/compte/mes-droits` |
| API | `POST /api/v1/me/data-requests` |

**Types de demandes.** (1) **Obtenir une copie** de mes données : génération automatique d'une archive (PDF lisible + fichier JSON) disponible 7 jours, après ré-authentification ; (2) **Rectification** d'une information confirmée par un professionnel : transmise au professionnel auteur puis, sans réponse sous 30 jours, à l'auditeur ; (3) **Fermeture du compte** : le compte est fermé, mais le dossier médical est **conservé** (obligation de conservation des données de santé, chapitre 23) et redevient un dossier sans compte ; (4) **Signalement d'un accès suspect** (depuis F-CIT-12).

**Règle stricte.** **RG-CIT-110** — Aucune demande NE DOIT entraîner la suppression physique d'une donnée médicale.
