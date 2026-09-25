# 7. Fiches fonctionnelles — Comptes, identité et accès

> [!NOTE] Comment lire une fiche
> Chaque fiche suit le même plan : **identité de la fiche** (rôles, priorité, étape du plan, écrans, API), **objectif**, **préconditions**, **déroulé pas à pas** (ce que fait l'utilisateur, ce que fait le système, dans l'ordre), **cas particuliers et erreurs** (avec le message exact à afficher), **règles strictes**, **données** (avec leurs contrôles), **traçabilité**, **critères d'acceptation**. Les messages d'erreur utilisent les codes du catalogue (section 18.8).

### F-AUTH-01 — Créer un compte citoyen

| Élément | Valeur |
|---|---|
| Rôles | Visiteur non connecté → devient `CITIZEN` |
| Priorité / étape | P0 / E04 puis E10 |
| Écrans | `/inscription`, `/inscription/verification` |
| API | `POST /api/v1/auth/register`, `POST /api/v1/auth/phone/verify` |

**Objectif.** Permettre à toute personne de créer son espace santé avec son numéro de téléphone, en moins de 2 minutes, sans email obligatoire.

**Préconditions.** Aucune session ouverte. Le téléphone n'est pas déjà rattaché à un compte actif.

**Déroulé pas à pas.**

| # | Utilisateur | Système |
|---|---|---|
| 1 | Touche « Créer mon espace santé » | Affiche le formulaire (une seule page, champs dans cet ordre) : nom, prénoms, date de naissance, sexe, téléphone, email (facultatif), mot de passe, case « J'accepte les conditions d'utilisation et la politique de confidentialité » (liens cliquables). |
| 2 | Remplit et touche « Continuer » | Valide chaque champ **côté navigateur** (messages sous le champ), puis **côté serveur** (mêmes règles, schéma Zod partagé). |
| 3 | — | Normalise le téléphone au format `+22901XXXXXXXX`. Vérifie qu'aucun compte actif n'utilise ce téléphone. |
| 4 | — | Crée une **inscription en attente** (pas encore un compte) valable 30 minutes, envoie un code SMS de 6 chiffres. Affiche l'écran de saisie du code avec le numéro masqué (`+229 01 •• •• 45 67`) et un compteur « Renvoyer le code dans 60 s ». |
| 5 | Saisit le code | Vérifie le code (haché en base, comparaison à temps constant). |
| 6 | — | Recherche un **dossier patient existant** créé par un établissement ou un agent avec le même téléphone **et** la même date de naissance. S'il existe : propose « Nous avons trouvé un dossier à votre nom créé par [établissement]. Est-ce vous ? » → rattachement (voir F-AUTH-03, étape 5). Sinon : crée un nouveau dossier patient. |
| 7 | — | Dans **une seule transaction** : crée l'utilisateur (niveau N1), le dossier patient, l'identifiant santé, la preuve d'acceptation des conditions (version + horodatage) ; ouvre la session. |
| 8 | — | Redirige vers l'assistant de première utilisation (F-CIT-01). |

**Cas particuliers et erreurs.**

| Situation | Comportement attendu |
|---|---|
| Téléphone déjà utilisé par un compte actif | Message générique : « Si ce numéro n'a pas encore de compte, un code vient d'être envoyé. Sinon, connectez-vous ou utilisez “Mot de passe oublié”. » (ne jamais confirmer qu'un compte existe) — code `AUTH_PHONE_TAKEN` journalisé côté serveur uniquement. |
| Téléphone au format à 8 chiffres | « Les numéros béninois comptent désormais 10 chiffres et commencent par 01. » (`VAL_PHONE_OLD_FORMAT`) |
| Date de naissance dans le futur ou âge > 120 ans | « Vérifiez la date de naissance. » (`VAL_BIRTHDATE`) |
| Âge < 15 ans | « Les enfants de moins de 15 ans sont suivis depuis le compte d'un parent. Demandez à votre parent de vous ajouter. » L'inscription est bloquée (RG-AUTH-05). |
| Code SMS erroné | « Code incorrect. Il vous reste X essais. » Après 5 erreurs : inscription annulée, recommencer (`AUTH_OTP_LOCKED`). |
| Code expiré (> 10 min) | « Ce code a expiré. Touchez “Renvoyer le code”. » |
| Trop de SMS demandés | « Trop de demandes. Réessayez dans 1 heure. » (`RATE_LIMITED`) |
| Réseau coupé pendant l'envoi | Les données saisies restent dans le formulaire ; message « Connexion perdue, réessayez. » |

**Règles strictes.**

- **RG-AUTH-01** — Le téléphone DOIT être au format béninois à 10 chiffres (`^\+22901\d{8}$` après normalisation). Les espaces, points et tirets saisis sont acceptés puis retirés.
- **RG-AUTH-02** — Le mot de passe d'un citoyen DOIT faire au moins **8 caractères** et au plus 128 ; il NE DOIT PAS figurer dans la liste des 10 000 mots de passe les plus courants ni contenir le numéro de téléphone ou la date de naissance. Aucune autre règle de composition n'est imposée (pas d'obligation de majuscule ou de symbole).
- **RG-AUTH-03** — Le code OTP DOIT comporter 6 chiffres aléatoires, être valable **10 minutes**, être stocké **haché**, accepter **5 essais maximum**. Un nouveau code annule le précédent. Délai minimal de **60 s** entre deux envois ; maximum **5 SMS par heure** et **10 par jour** par numéro, et **20 par heure** par adresse IP.
- **RG-AUTH-04** — Le compte NE DOIT être créé qu'**après** vérification du code (pas de compte N0 utilisable).
- **RG-AUTH-05** — Âge minimum pour un compte personnel : **15 ans** [DÉCISION à valider juridiquement]. En dessous, le dossier est géré par un tuteur (F-CIT-07).
- **RG-AUTH-06** — L'identifiant santé DOIT être généré par le serveur au format défini en section 18.2, unique, jamais réutilisé, jamais modifié.
- **RG-AUTH-07** — L'acceptation des conditions DOIT enregistrer la **version** du texte accepté.

**Données.**

| Champ | Type | Obligatoire | Contrôle |
|---|---|---|---|
| Nom | Texte | Oui | 1 à 60 caractères, lettres, espaces, tirets, apostrophes ; stocké en majuscules |
| Prénoms | Texte | Oui | 1 à 80 caractères ; première lettre de chaque prénom en majuscule |
| Date de naissance | Date | Oui | Passé, âge entre 15 et 120 ans |
| Sexe | Liste | Oui | `F`, `M` (état civil) |
| Téléphone | Texte | Oui | RG-AUTH-01 |
| Email | Texte | Non | Format valide, stocké en minuscules, unique s'il est renseigné |
| Mot de passe | Texte | Oui | RG-AUTH-02 ; jamais stocké en clair ni journalisé |
| Acceptation des conditions | Booléen | Oui | Doit être cochée |

**Traçabilité.** Événements d'audit `ACCOUNT_CREATED`, `OTP_SENT`, `OTP_FAILED`, `PATIENT_LINKED` (si rattachement).

**Critères d'acceptation.**

- **CA-1** — Étant donné un numéro jamais utilisé, quand je remplis le formulaire valide et saisis le bon code, alors mon compte, mon dossier et mon identifiant santé sont créés et j'arrive sur l'assistant de bienvenue.
- **CA-2** — Étant donné un code erroné saisi 5 fois, alors l'inscription est annulée et aucun compte n'existe en base.
- **CA-3** — Étant donné un numéro déjà inscrit, quand je tente de m'inscrire, alors le message affiché est identique à celui d'un numéro libre (aucune fuite d'information).
- **CA-4** — Étant donné une personne de 13 ans, alors l'inscription est refusée avec le message prévu.
- **CA-5** — Aucune trace du mot de passe ni du code n'apparaît dans les journaux techniques (test automatisé qui recherche les valeurs saisies dans les logs).

### F-AUTH-02 — Se connecter et se déconnecter

| Élément | Valeur |
|---|---|
| Rôles | Tous |
| Priorité / étape | P0 / E04 |
| Écrans | `/connexion`, `/connexion/double-facteur`, menu « Se déconnecter » |
| API | `POST /api/v1/auth/sign-in`, `POST /api/v1/auth/sign-out` |

**Objectif.** Ouvrir une session sécurisée adaptée au rôle, et la fermer proprement.

**Déroulé pas à pas.**

| # | Utilisateur | Système |
|---|---|---|
| 1 | Saisit son identifiant (téléphone **ou** email) et son mot de passe ; coche éventuellement « Appareil partagé » | Normalise l'identifiant (téléphone au format international, email en minuscules). |
| 2 | Touche « Se connecter » | Vérifie le mot de passe. En cas d'échec : message unique « Identifiant ou mot de passe incorrect. » et incrément du compteur d'échecs. |
| 3 | — | Si le compte est `SUSPENDED` ou `CLOSED` : « Votre compte est suspendu. Contactez le support. » (`AUTH_ACCOUNT_SUSPENDED`). |
| 4 | — | Si le compte possède au moins une affiliation professionnelle active : exige le **second facteur** (F-AUTH-06) avant d'ouvrir la session. |
| 5 | — | Crée la session (cookie `HttpOnly`, `Secure`, `SameSite=Lax`) avec les durées de la section 23.3. |
| 6 | — | Si l'utilisateur n'a qu'un espace : l'active et redirige vers sa page d'accueil. S'il en a plusieurs : affiche le sélecteur d'espace (F-AUTH-07), présélectionnant le dernier utilisé. |
| 7 | Touche « Se déconnecter » | Supprime la session côté serveur, efface le cookie, **vide les données en cache** de l'application (y compris le stockage hors ligne sauf saisies terrain non synchronisées, voir F-COM-08), redirige vers `/connexion`. |

**Cas particuliers et erreurs.**

| Situation | Comportement attendu |
|---|---|
| 5 échecs consécutifs | Compte verrouillé **15 minutes** ; message « Trop de tentatives. Réessayez dans 15 minutes ou réinitialisez votre mot de passe. » ; SMS d'alerte au titulaire (sans lien cliquable). |
| 10 échecs en 24 h | Verrouillage 24 h ; notification à l'administrateur si le compte est professionnel. |
| Connexion d'un compte professionnel depuis un nouvel appareil | Notification in-app et SMS « Nouvelle connexion à votre compte BHIP le [date] ». |
| Déconnexion avec des saisies terrain non synchronisées | Avertissement bloquant : « Vous avez X saisies non envoyées. Synchronisez avant de vous déconnecter. » (bouton « Synchroniser » ou « Rester connecté »). |

**Règles strictes.**

- **RG-AUTH-10** — Le message d'échec DOIT être identique que l'identifiant existe ou non.
- **RG-AUTH-11** — Les sessions DOIVENT être stockées côté serveur (base de données) pour pouvoir être révoquées ; le cookie ne contient qu'un jeton aléatoire.
- **RG-AUTH-12** — Avec « Appareil partagé » coché, la session DOIT expirer à la fermeture du navigateur et au plus tard après 30 minutes d'inactivité, même pour un citoyen.
- **RG-AUTH-13** — Une nouvelle connexion DOIT régénérer l'identifiant de session (pas de réutilisation).

**Critères d'acceptation.**

- **CA-1** — Un citoyen se connecte avec son téléphone saisi « 01 97 12 34 56 » et arrive sur `/citoyen`.
- **CA-2** — Un médecin ne peut pas accéder à `/pro` sans avoir validé son second facteur (test d'appel direct à l'URL et à l'API).
- **CA-3** — Après 5 mots de passe erronés, la 6e tentative avec le bon mot de passe est refusée pendant 15 minutes.
- **CA-4** — Après déconnexion, le bouton « Retour » du navigateur ne réaffiche aucune donnée de santé.

### F-AUTH-03 — Réclamer un dossier existant

| Élément | Valeur |
|---|---|
| Rôles | Visiteur / `CITIZEN` |
| Priorité / étape | P1 / E10 |
| Écrans | `/inscription/reclamer` |
| API | `POST /api/v1/patients/claim` |

**Objectif.** Permettre à une personne dont le dossier a été créé par un établissement ou un agent communautaire (sans compte) de le rattacher à un compte personnel.

**Déroulé pas à pas.**

1. Lors de la création d'un dossier sans compte (F-CLI-03, F-COM-02), le système envoie au téléphone du patient (s'il en a un) le SMS `N-CLAIM-CODE` (catalogue F-NOT-04) contenant le code de réclamation.
2. La personne s'inscrit normalement (F-AUTH-01) **ou** choisit « J'ai reçu un code ».
3. Elle saisit : code de réclamation, date de naissance, téléphone.
4. Le système vérifie les trois éléments. Il vérifie aussi le téléphone par OTP.
5. Le système rattache le dossier au compte (base `SELF`), passe le niveau de vérification à N1 (ou conserve N2 si l'établissement avait vérifié la pièce d'identité).

**Règles strictes.**

- **RG-AUTH-20** — Le code de réclamation DOIT être à usage unique, valable **30 jours**, haché en base ; **5 essais** maximum puis blocage du code (l'établissement peut en regénérer un).
- **RG-AUTH-21** — Le rattachement NE DOIT se faire que si le téléphone vérifié **et** la date de naissance correspondent au dossier.
- **RG-AUTH-22** — Un dossier déjà rattaché à un compte NE PEUT PAS être réclamé à nouveau ; message : « Ce dossier est déjà associé à un compte. Présentez-vous à l'accueil d'un établissement. »

**Critères d'acceptation.** CA-1 : un patient créé au guichet avec son téléphone peut, avec le code reçu, accéder à ses consultations passées. CA-2 : un code valide saisi avec une mauvaise date de naissance est refusé et compte comme un essai.

### F-AUTH-04 — Mot de passe oublié

| Élément | Valeur |
|---|---|
| Rôles | Tous |
| Priorité / étape | P0 / E04 |
| Écrans | `/mot-de-passe-oublie`, `/mot-de-passe-oublie/nouveau` |
| API | `POST /api/v1/auth/password/forgot`, `POST /api/v1/auth/password/reset` |

**Déroulé pas à pas.**

1. L'utilisateur saisit son téléphone (ou email).
2. Le système affiche **toujours** : « Si un compte existe, un code vient d'être envoyé. »
3. Si le compte existe : envoi d'un code OTP (SMS, ou email si l'identifiant est un email).
4. L'utilisateur saisit le code puis son nouveau mot de passe (deux fois).
5. Le système met à jour le mot de passe, **ferme toutes les sessions** du compte, envoie un SMS de confirmation « Votre mot de passe BHIP a été modifié. Si ce n'est pas vous, contactez le support. »
6. Pour un compte professionnel, la réinitialisation NE désactive PAS la double authentification : le second facteur reste exigé à la connexion suivante.

**Règles strictes.** RG-AUTH-03 s'applique aux codes. **RG-AUTH-30** — Le nouveau mot de passe NE DOIT PAS être identique à l'actuel. **RG-AUTH-31** — Pour un compte `PLATFORM_ADMIN` ou `AUDITOR`, la réinitialisation en libre-service est **désactivée** : elle passe par un autre administrateur.

**Critères d'acceptation.** CA-1 : après réinitialisation, une session ouverte sur un autre appareil est déconnectée à la requête suivante. CA-2 : la réponse de l'API est identique (contenu et temps de réponse ±100 ms) pour un compte existant ou non.

### F-AUTH-05 — Activer un compte professionnel sur invitation

| Élément | Valeur |
|---|---|
| Rôles | Professionnel invité (`DOCTOR`, `NURSE`, `RECEPTIONIST`, `CHW`, `LAB_*`, `PHARMACIST`, `FACILITY_ADMIN`, `HEALTH_AUTHORITY`, `AUDITOR`) |
| Priorité / étape | P0 / E05 |
| Écrans | `/activer?jeton=…` |
| API | `GET /api/v1/invitations/{token}`, `POST /api/v1/invitations/{token}/accept` |

**Objectif.** Un professionnel ne s'inscrit jamais seul : il est **invité** par un responsable habilité, ce qui garantit son rattachement à un établissement réel.

**Déroulé pas à pas.**

| # | Professionnel | Système |
|---|---|---|
| 1 | Reçoit un SMS ou un email : « [Établissement] vous invite sur BHIP en tant que [rôle]. Lien valable 7 jours. » | L'invitation contient un jeton aléatoire (32 octets) stocké haché. |
| 2 | Ouvre le lien | Vérifie le jeton (existant, non expiré, non utilisé). Affiche l'établissement et le rôle proposés. |
| 3 | Si un compte existe déjà avec ce téléphone ou email : se connecte | Ajoute l'affiliation au compte existant. |
| 4 | Sinon : complète nom, prénoms, date de naissance, sexe, mot de passe (**12 caractères minimum**), vérifie son téléphone par OTP | Crée le compte. |
| 5 | Pour un rôle clinique : saisit sa profession, sa spécialité, son **numéro d'inscription à l'Ordre** (ou au registre professionnel correspondant), et téléverse sa carte professionnelle (PDF/JPG, 5 Mo max) | Crée le profil professionnel au statut `PENDING_VALIDATION`. |
| 6 | Configure la double authentification (F-AUTH-06) — étape obligatoire | — |
| 7 | — | Rôle non clinique : l'affiliation devient `ACTIVE`. Rôle clinique : l'affiliation reste `INVITED` tant que l'administrateur n'a pas validé le profil (F-ADM-03) ; l'utilisateur voit « Votre profil est en cours de vérification ». |

**Règles strictes.**

- **RG-AUTH-40** — Une invitation DOIT expirer après **7 jours** et être à usage unique. Le responsable peut la renvoyer (l'ancienne est alors annulée).
- **RG-AUTH-41** — Qui peut inviter qui : `PLATFORM_ADMIN` → `FACILITY_ADMIN`, `HEALTH_AUTHORITY`, `AUDITOR`, `PLATFORM_ADMIN` ; `FACILITY_ADMIN` → `DOCTOR`, `NURSE`, `RECEPTIONIST`, `CHW`, `LAB_TECH`, `LAB_SUPERVISOR`, `PHARMACIST` **de son établissement uniquement** et selon le type d'établissement (un laboratoire n'invite pas de médecin, section 18.5).
- **RG-AUTH-42** — Le numéro d'inscription professionnel DOIT être unique par profession.
- **RG-AUTH-43** — Mot de passe professionnel : 12 caractères minimum, mêmes interdictions que RG-AUTH-02.

**Critères d'acceptation.** CA-1 : un lien d'invitation utilisé une fois renvoie « Invitation déjà utilisée » à la seconde ouverture. CA-2 : un médecin invité mais non validé ne voit aucun patient. CA-3 : un responsable d'établissement ne peut pas inviter quelqu'un dans un autre établissement (test API).

### F-AUTH-06 — Double authentification (second facteur)

| Élément | Valeur |
|---|---|
| Rôles | Obligatoire pour tous les rôles sauf `CITIZEN` |
| Priorité / étape | P0 / E06 |
| Écrans | `/compte/securite/double-facteur`, `/connexion/double-facteur` |
| API | `POST /api/v1/auth/2fa/enable`, `POST /api/v1/auth/2fa/verify` |

**Objectif.** Protéger les comptes qui ouvrent l'accès à des données de santé de nombreuses personnes.

**Déroulé — activation.**

1. Le système génère un secret TOTP et affiche un QR code à scanner avec une application d'authentification (Google Authenticator, Microsoft Authenticator, FreeOTP…), ainsi que la clé en texte.
2. L'utilisateur saisit le code à 6 chiffres affiché par son application.
3. Le système vérifie le code (fenêtre de ±1 période de 30 s), active le second facteur et affiche **10 codes de secours** à usage unique, une seule fois, avec un bouton « Télécharger » et la case obligatoire « J'ai conservé mes codes de secours ».

**Déroulé — connexion.** Après le mot de passe, l'utilisateur saisit le code TOTP (ou un code de secours). En cas de 5 échecs, le compte est verrouillé 15 minutes.

**Règles strictes.**

- **RG-AUTH-50** — Méthode MVP : **TOTP** (application). Le code par SMS est accepté **uniquement** comme solution de repli pour `CHW` et `RECEPTIONIST` si l'administrateur l'active (paramètre), car le SMS est moins sûr.
- **RG-AUTH-51** — Le secret TOTP DOIT être stocké **chiffré**. Les codes de secours DOIVENT être stockés hachés et invalidés après usage.
- **RG-AUTH-52** — La perte du second facteur se règle par un administrateur (réinitialisation tracée) ; jamais en libre-service.
- **RG-AUTH-53** — Le second facteur est redemandé à chaque connexion. Une **ré-authentification** (code du second facteur pour un professionnel, mot de passe pour un citoyen, valable 5 minutes, RG-SEC-01) est exigée pour : signer une ordonnance, ouvrir un accès d'urgence, valider un résultat, retirer un élément « saisi par erreur », exporter des données (liste complète : tableau 23.3).

**Critères d'acceptation.** CA-1 : un compte professionnel sans second facteur activé est redirigé vers l'activation à chaque connexion et ne peut rien faire d'autre. CA-2 : un code de secours utilisé une fois est refusé la deuxième fois.

### F-AUTH-07 — Choisir son espace actif

| Élément | Valeur |
|---|---|
| Rôles | Tout utilisateur ayant au moins une affiliation |
| Priorité / étape | P0 / E05 |
| Écrans | `/espaces`, sélecteur dans l'en-tête |
| API | `POST /api/v1/session/active-space` |

**Objectif.** Un utilisateur peut être citoyen, médecin au CHD de Parakou et médecin dans une clinique privée. Il DOIT toujours savoir **dans quel espace** il agit.

**Déroulé.**

1. Après connexion (ou via le sélecteur de l'en-tête), l'utilisateur voit ses espaces sous forme de cartes : « Mon espace santé (personnel) », « Médecin — CHD Borgou », « Médecin — Clinique X ».
2. Il en choisit un. Le système vérifie que l'affiliation est `ACTIVE`, que le profil professionnel est validé et que le second facteur est fait.
3. Le système enregistre l'espace actif **dans la session côté serveur**, écrit une trace `CONTEXT_SWITCH`, et redirige vers l'accueil de l'espace.
4. L'en-tête affiche en permanence le nom de l'espace, avec la couleur de l'espace (section 19.2).

**Règles strictes.**

- **RG-AUTH-60** — L'espace actif DOIT être lu depuis la session serveur ; il NE DOIT PAS être transmis par le navigateur dans l'URL ou un paramètre modifiable.
- **RG-AUTH-61** — Changer d'espace DOIT fermer toutes les fenêtres de saisie en cours après confirmation (« Votre consultation en brouillon est enregistrée. Changer d'espace ? »).

**Critères d'acceptation.** CA-1 : un médecin affilié à deux établissements ne voit que les patients de l'établissement actif. CA-2 : la modification manuelle d'un identifiant d'établissement dans une requête API est sans effet (réponse 403).

### F-AUTH-08 — Verrouillage d'écran pour inactivité

| Élément | Valeur |
|---|---|
| Rôles | `DOCTOR`, `NURSE`, `RECEPTIONIST`, `CHW`, `LAB_*`, `PHARMACIST` (10 min) ; les autres rôles suivent le tableau 23.3 |
| Priorité / étape | P1 / E27 |

**Déroulé.** Après **10 minutes** sans action dans un espace professionnel, l'écran est flouté et remplacé par « Session verrouillée — saisissez votre mot de passe ou code ». Les brouillons sont conservés. Après 3 échecs, déconnexion complète. **RG-AUTH-70** — Aucune donnée patient NE DOIT rester visible derrière l'écran de verrouillage (le contenu est retiré du DOM, pas seulement masqué).

**Critère d'acceptation.** CA-1 : après 10 minutes d'inactivité, l'inspecteur du navigateur ne contient plus aucune donnée patient.

### F-AUTH-09 — Gérer ses appareils et sessions

| Élément | Valeur |
|---|---|
| Rôles | Tous |
| Priorité / étape | P1 / E27 |
| Écrans | `/compte/securite` |

**Déroulé.** L'utilisateur voit la liste de ses sessions actives (type d'appareil, navigateur, ville approximative, dernière activité) et peut fermer une session ou « Déconnecter tous les autres appareils ». Il peut changer son mot de passe (ancien mot de passe exigé) ; toutes les autres sessions sont alors fermées.

**Critère d'acceptation.** CA-1 : fermer une session depuis le téléphone déconnecte l'ordinateur à sa requête suivante.
