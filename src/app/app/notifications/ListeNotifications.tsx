"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useTransition } from "react";
import {
  marquerNotificationLueAction,
  marquerToutesLuesAction,
  type NotificationResume,
} from "@/modules/notification/actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

function formaterDate(dateIso: string): string {
  return new Date(dateIso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LigneNotification({ notification }: { notification: NotificationResume }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(marquerNotificationLueAction, {
    error: null,
    success: false,
  });

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  const contenu = (
    <div
      className={
        "flex flex-col gap-1 rounded-champ border px-4 py-3 " +
        (notification.lu
          ? "border-bordure bg-surface"
          : "border-accent bg-accent-clair")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] text-encre">{notification.message}</p>
        {!notification.lu ? <Badge tone="accent">Nouveau</Badge> : null}
      </div>
      <p className="text-[12px] text-encre-attenuee">{formaterDate(notification.date)}</p>
    </div>
  );

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        {notification.lien ? (
          <Link href={notification.lien} className="block">
            {contenu}
          </Link>
        ) : (
          contenu
        )}
      </div>
      {!notification.lu ? (
        <form action={formAction}>
          <input type="hidden" name="notificationId" value={notification.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={pending}>
            Marquer comme lue
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function ListeNotifications({
  notifications,
}: {
  notifications: NotificationResume[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const nombreNonLues = notifications.filter((n) => !n.lu).length;

  function marquerToutesLues() {
    demarrer(async () => {
      await marquerToutesLuesAction();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {nombreNonLues > 0 ? (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={marquerToutesLues}
            disabled={enCours}
          >
            {enCours ? "..." : "Tout marquer comme lu"}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {notifications.map((notification) => (
          <LigneNotification key={notification.id} notification={notification} />
        ))}
      </div>
    </div>
  );
}
