"use server";

/**
 * Server Actions du module notification (Phase 10). Perimetre reduit a ce
 * qui est realiste sans passerelle SMS/email reelle pour ce MVP (voir
 * src/modules/notification/README.md) : notifications internes uniquement,
 * affichees dans la plateforme. L'envoi de SMS/email reste hors perimetre,
 * documente comme evolution future.
 *
 * L'ecriture d'une notification (`creerNotification`) vit dans creer.ts, hors
 * de ce fichier "use server" : elle n'a aucun controle de session et ne doit
 * jamais etre atteignable comme point d'entree. Ce fichier ne porte que les
 * lectures et actions du destinataire connecte.
 */

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { conditionEspace, espaceDesRoles, TAILLE_PAGE_NOTIFICATIONS } from "./espace-notification";

export interface NotificationResume {
  id: string;
  type: string;
  message: string;
  lien: string | null;
  lu: boolean;
  date: string; // ISO
}

export interface NotificationActionState {
  error: string | null;
  success: boolean;
}

export interface PageNotifications {
  notifications: NotificationResume[];
  /** A passer a l'appel suivant pour les notifications plus anciennes, null s'il n'y en a plus. */
  curseurSuivant: string | null;
}

/**
 * Notifications de l'utilisateur connecte DANS SON ESPACE ACTIF (F-NOT-01), les
 * plus recentes en premier, par pages de TAILLE_PAGE_NOTIFICATIONS avec un
 * curseur (l'identifiant de la derniere notification recue). Un curseur qui
 * n'appartient pas a l'utilisateur ne donne rien : la requete reste bornee a
 * ses propres notifications.
 */
export async function getMesNotifications(curseur?: string): Promise<PageNotifications> {
  const session = await getSession();

  if (!session) {
    return { notifications: [], curseurSuivant: null };
  }

  const debut = typeof curseur === "string" && curseur.length > 0 ? curseur : null;
  const lignes = await prisma.notification.findMany({
    where: { utilisateurId: session.userId, ...conditionEspace(espaceDesRoles(session.roles)) },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: TAILLE_PAGE_NOTIFICATIONS + 1,
    ...(debut ? { cursor: { id: debut }, skip: 1 } : {}),
  });

  const page = lignes.slice(0, TAILLE_PAGE_NOTIFICATIONS);
  return {
    notifications: page.map((notification) => ({
      id: notification.id,
      type: notification.type,
      message: notification.message,
      lien: notification.lien,
      lu: notification.lu,
      date: notification.date.toISOString(),
    })),
    curseurSuivant: lignes.length > TAILLE_PAGE_NOTIFICATIONS ? page[page.length - 1].id : null,
  };
}

/** Nombre de notifications non lues de l'utilisateur connecte dans son espace actif (0 si aucune session). */
export async function getNombreNotificationsNonLues(): Promise<number> {
  const session = await getSession();

  if (!session) {
    return 0;
  }

  return prisma.notification.count({
    where: { utilisateurId: session.userId, lu: false, ...conditionEspace(espaceDesRoles(session.roles)) },
  });
}

/**
 * Marque une notification comme lue. Verifie qu'elle appartient bien a
 * l'utilisateur connecte avant toute modification (Zero Trust : jamais
 * confiance en l'id transmis sans verification de propriete).
 */
export async function marquerNotificationLueAction(
  prevState: NotificationActionState,
  formData: FormData
): Promise<NotificationActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Vous devez etre connecte.", success: false };
  }

  const notificationId = formData.get("notificationId");

  if (typeof notificationId !== "string" || notificationId.length === 0) {
    return { error: "Notification invalide.", success: false };
  }

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification || notification.utilisateurId !== session.userId) {
    return { error: "Notification introuvable.", success: false };
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { lu: true },
  });

  return { error: null, success: true };
}

/** Marque comme lues toutes les notifications de l'utilisateur connecte dans son espace actif. */
export async function marquerToutesLuesAction(): Promise<void> {
  const session = await getSession();

  if (!session) {
    return;
  }

  await prisma.notification.updateMany({
    where: { utilisateurId: session.userId, lu: false, ...conditionEspace(espaceDesRoles(session.roles)) },
    data: { lu: true },
  });
}
