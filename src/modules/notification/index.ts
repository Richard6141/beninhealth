// Phase 10 : notifications internes. Voir src/modules/notification/actions.ts
// pour l'implementation et src/modules/notification/README.md pour le
// perimetre (canal in-app uniquement, pas de SMS/email reel pour ce MVP).
export {
  creerNotification,
  getMesNotifications,
  getNombreNotificationsNonLues,
  marquerNotificationLueAction,
  marquerToutesLuesAction,
  type NotificationResume,
  type NotificationActionState,
} from "./actions";
