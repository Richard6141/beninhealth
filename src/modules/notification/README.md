# Module notification

Responsabilité : envoi des notifications sortantes (Notification Service).

Périmètre : envoi de SMS, d'emails et de notifications internes, déclenchés
par les autres modules (ex : rappel de rendez-vous, résultat disponible,
validation de prescription).

Hors périmètre : définition du contenu métier des messages, qui reste décidée
par le module à l'origine de la notification, et stockage des données
médicales.

Phase d'implémentation : phase ultérieure, après identity, patient, clinical
et prescription.

## Implémentation Phase 10

Uniquement le canal interne (in-app) : `src/modules/notification/actions.ts`.
`creerNotification(utilisateurId, type, message, lien?)` est le seul point
d'écriture, appelé depuis d'autres modules juste après un événement pertinent
(le destinataire est déterminé par l'appelant à partir de données déjà
vérifiées, jamais d'un id brut transmis par un formulaire). Branché pour
l'instant sur : confirmation de rendez-vous (`src/modules/facility/actions.ts`,
`confirmerRendezVousAction`) et disponibilité d'un résultat d'examen
(`src/modules/laboratoire/actions.ts`, `saisirResultatExamenAction`, notifie
le patient et le médecin demandeur).

`getMesNotifications`/`getNombreNotificationsNonLues` dérivent toujours
l'utilisateur de `getSession()`. `marquerNotificationLueAction` vérifie la
propriété de la notification avant modification (Zero Trust).

SMS et email restent hors périmètre (aucune passerelle disponible pour ce
MVP) : évolution future documentée, pas une lacune silencieuse.
