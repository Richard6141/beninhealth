# 17. Fiches fonctionnelles — Notifications

## 17.1 Canaux

| Canal | Usage | MVP |
|---|---|---|
| **Notification interne** (dans l'application) | Tous les messages, avec le détail accessible après connexion | Oui |
| **SMS** | Codes (OTP), rappels de rendez-vous, alertes de sécurité, information « quelque chose est disponible » | **Simulé** : les SMS sont écrits dans une boîte d'envoi consultable (`/dev/sms`, disponible en développement et en staging) ; un vrai fournisseur se branche via l'adaptateur |
| **Email** | Invitations professionnelles, exports, copie facultative des notifications | Oui, via un serveur de test (Mailpit) en développement |
| **Notification push du navigateur** | Rappels et résultats pour ceux qui l'acceptent | P2 |

- **RG-NOT-01** — Aucun SMS, email ou notification push NE DOIT contenir de donnée médicale (diagnostic, nom d'examen, valeur, nom de médicament). Seule la notification **interne**, lue après connexion, peut contenir des détails.
- **RG-NOT-02** — Les SMS DOIVENT faire au maximum **160 caractères** (un seul SMS), sans accents problématiques (translittération automatique si le fournisseur l'exige), commencer par « BHIP : ».
- **RG-NOT-03** — Les notifications DOIVENT être envoyées **après** la validation de la transaction qui les déclenche (jamais pour une action annulée), via la file de tâches, avec **3 tentatives** (après 1 min, 5 min, 30 min) puis statut `FAILED` visible par l'administrateur.
- **RG-NOT-04** — Les SMS non urgents (rappels, informations) NE DOIVENT PAS être envoyés entre **21 h 00 et 7 h 00** (heure locale) : ils sont différés à 7 h 00. Les codes OTP et alertes de sécurité ne sont pas différés.

### F-NOT-01 — Centre de notifications

| Élément | Valeur |
|---|---|
| Rôles | Tous |
| Priorité / étape | P0 / E23 |
| Écrans | Cloche dans l'en-tête + `/[espace]/notifications` |
| API | `GET /api/v1/notifications?cursor=`, `POST /api/v1/notifications/read` |

Liste des notifications de l'**espace actif** (les notifications citoyennes n'apparaissent pas dans l'espace pro et inversement), non lues en gras, regroupées par jour, avec un lien direct vers l'élément concerné (qui revérifie les droits à l'ouverture). « Tout marquer comme lu ». Conservation **90 jours**. Rafraîchissement du compteur toutes les 60 s (P2 : temps réel).

### F-NOT-02 — Envoi de SMS (adaptateur)

| Élément | Valeur |
|---|---|
| Rôles | Système |
| Priorité / étape | P0 / E04 (OTP) puis E23 |

Interface unique `SmsProvider.send({ to, text, category })` avec deux implémentations : `OutboxSmsProvider` (écrit dans la table `sms_outbox`, statut `SIMULATED`) et `HttpSmsProvider` (fournisseur réel, P2, choisi par configuration). Chaque envoi est tracé (destinataire masqué sauf 4 derniers chiffres, catégorie, modèle utilisé, statut, coût si connu) — **jamais le code OTP en clair** dans les journaux.

### F-NOT-03 — Préférences de notification

| Élément | Valeur |
|---|---|
| Rôles | `CITIZEN` (et professionnels pour leurs alertes) |
| Priorité / étape | P1 / E23 |
| Écrans | `/citoyen/compte/notifications` |

Pour chaque **catégorie** (rendez-vous, résultats et documents, traitements, accès à mon dossier, informations sanitaires générales), l'utilisateur choisit les canaux (interne toujours actif ; SMS oui/non ; email oui/non). **RG-NOT-10** — Les catégories **sécurité** (connexion, mot de passe, accès d'urgence à mon dossier) et **codes** ne peuvent pas être désactivées.

### F-NOT-04 — Catalogue des notifications

Toute notification DOIT figurer dans ce catalogue (source unique pour les modèles de texte, stockés dans les fichiers de traduction).

| Code | Déclencheur | Destinataire | Canaux | Texte SMS (modèle) |
|---|---|---|---|---|
| `N-OTP` | Demande de code | Titulaire | SMS | « BHIP : votre code est 482913. Il expire dans 10 min. Ne le communiquez à personne. » |
| `N-APPT-CONFIRMED` | RDV confirmé | Patient / tuteur | Interne + SMS | « BHIP : RDV confirmé le 14/10 à 09:30, CS Akpakpa. » |
| `N-APPT-REMINDER` | Veille 18 h / H-2 | Patient / tuteur | Interne + SMS | RG-RDV-51 |
| `N-APPT-CANCELLED-FAC` | Annulation par l'établissement | Patient | Interne + SMS | « BHIP : votre RDV du 14/10 est annulé par l'établissement. Détails dans l'application. » |
| `N-APPT-REQUEST` | Nouvelle demande à confirmer | Accueil | Interne | — |
| `N-CONSULT-AVAILABLE` | Consultation validée | Patient | Interne (+ SMS si activé) | « BHIP : un nouveau document est disponible dans votre dossier. » |
| `N-RX-AVAILABLE` | Ordonnance signée | Patient | Interne (+ SMS) | Idem |
| `N-RX-DISPENSED` | Délivrance | Patient | Interne | — |
| `N-LAB-RESULT-PRO` | Résultat validé | Prescripteur | Interne (prioritaire si critique) | — |
| `N-LAB-RESULT-PATIENT` | Résultat validé non soumis à annonce, ou annoncé | Patient | Interne (+ SMS) | « BHIP : un résultat est disponible dans votre dossier. » |
| `N-CONSENT-REQUEST` | Un professionnel demande l'accès | Patient | Interne + SMS | « BHIP : un soignant demande l'accès à votre dossier. Répondez dans l'application. » |
| `N-CONSENT-GRANTED` | Consentement accordé | Bénéficiaire | Interne | — |
| `N-EMERGENCY-ACCESS` | Accès d'urgence ouvert | Patient / tuteur, responsable, auditeur | Interne + SMS (patient) | « BHIP : votre dossier a été consulté en urgence par [établissement] le 14/10. Détails dans l'application. » |
| `N-NEW-DEVICE` | Connexion pro depuis un nouvel appareil | Titulaire | Interne + SMS | « BHIP : nouvelle connexion à votre compte le 14/10 à 08:12. Si ce n'est pas vous, contactez le support. » |
| `N-PASSWORD-CHANGED` | Mot de passe modifié | Titulaire | SMS | « BHIP : votre mot de passe a été modifié. Si ce n'est pas vous, contactez le support. » |
| `N-INVITE` | Invitation professionnelle | Invité | SMS ou email | « BHIP : [établissement] vous invite. Activez votre compte : [lien] (7 jours). » |
| `N-PRACTITIONER-DECISION` | Profil validé / refusé | Professionnel (+ responsable si refus) | Interne + SMS | « BHIP : votre profil professionnel a été examiné. Détails dans l'application. » |
| `N-CLAIM-CODE` | Dossier créé sans compte | Patient | SMS | « BHIP : un dossier santé a été créé pour vous. Créez votre compte avec ce numéro. Code : 482913 (30 jours). » |
| `N-SYNC-REVIEW` | Saisie terrain mise en revue | Agent | Interne | — |
| `N-HEALTH-ALERT` | Alerte épidémiologique | Autorités de la portée | Interne | — |
| `N-DRAFT-REMINDER` | Brouillon de consultation de 3 jours | Médecin | Interne | — |
| `N-APPT-REJECTED` | Demande de RDV refusée | Patient | Interne + SMS | « BHIP : votre demande de RDV du 14/10 n'a pas pu être acceptée. Détails dans l'application. » |
| `N-APPT-EXPIRED` | Demande de RDV expirée | Patient | Interne + SMS | « BHIP : votre demande de RDV du 14/10 n'a pas reçu de réponse. Choisissez un autre créneau. » |
| `N-RX-CANCELLED` | Ordonnance annulée ou arrêtée | Patient | Interne | — |
| `N-CONSULT-ERROR` | Consultation retirée « saisie par erreur » | Responsable d'établissement, patient | Interne | — |
| `N-LAB-SAMPLE-REJECTED` | Échantillon rejeté | Prescripteur, patient | Interne + SMS (patient) | « BHIP : un nouveau prélèvement est nécessaire. Détails dans l'application. » |
| `N-LAB-CANCELLED` | Demande d'examen annulée | Patient, laboratoire | Interne | — |
| `N-LAB-CRITICAL-ESCALATION` | Résultat critique non lu sous 2 h | Responsable d'établissement du prescripteur | Interne (prioritaire) | — |
| `N-LAB-ANNOUNCE-OVERDUE` | Résultat à annoncer non annoncé sous 30 jours | Auditeur, prescripteur | Interne | — |
| `N-CONSENT-REVOKED` | Consentement retiré | Bénéficiaire | Interne | — |
| `N-GUARDIAN-CONFLICT` | Second parent déclare le même enfant | Tuteur vérifié existant | Interne + SMS | « BHIP : une autre personne a déclaré être tuteur d'un de vos proches. Détails dans l'application. » |
| `N-GUARDIAN-REQUEST` | Demande de tutelle d'une personne majeure | Personne concernée | Interne + SMS | « BHIP : une personne demande à gérer votre dossier. Répondez dans l'application. » |
| `N-ACCOUNT-LOCKED` | Compte verrouillé après échecs | Titulaire | SMS | « BHIP : trop de tentatives de connexion. Votre compte est bloqué temporairement. » |
| `N-EMERGENCY-NONCOMPLIANT` | Revue d'urgence non conforme | Professionnel, responsable | Interne | — |
| `N-EMERGENCY-LIMIT` | Limite d'accès d'urgence dépassée | Auditeur | Interne | — |
| `N-MERGE` | Fusion de dossiers | Patient(s) ayant un compte | Interne | — |
| `N-2FA-RESET` | Second facteur réinitialisé | Titulaire | Interne + SMS | « BHIP : la double authentification de votre compte a été réinitialisée. Si ce n'est pas vous, contactez le support. » |
| `N-COMMUNITY-REFERRAL` | Référence communautaire reçue | Soignants du centre de santé | Interne | — |
