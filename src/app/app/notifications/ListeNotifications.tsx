"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import {
  getMesNotifications,
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

/** Cle de jour calendaire "AAAA-MM-JJ", en heure locale (pas UTC). */
function cleJour(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Libelle d'en-tete de groupe (F-NOT-01 : "regroupees par jour") : Aujourd'hui / Hier / date complete. */
function libelleJour(date: Date, maintenant: Date): string {
  if (cleJour(date) === cleJour(maintenant)) return "Aujourd'hui";
  const hier = new Date(maintenant);
  hier.setDate(hier.getDate() - 1);
  if (cleJour(date) === cleJour(hier)) return "Hier";
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

interface GroupeJour {
  cle: string;
  libelle: string;
  notifications: NotificationResume[];
}

/** Regroupe une liste deja triee (plus recent d'abord) par jour calendaire, sans reordonner. */
function grouperParJour(notifications: NotificationResume[]): GroupeJour[] {
  const maintenant = new Date();
  const groupes: GroupeJour[] = [];
  const index = new Map<string, GroupeJour>();

  for (const notification of notifications) {
    const date = new Date(notification.date);
    const cle = cleJour(date);
    let groupe = index.get(cle);

    if (!groupe) {
      groupe = { cle, libelle: libelleJour(date, maintenant), notifications: [] };
      index.set(cle, groupe);
      groupes.push(groupe);
    }

    groupe.notifications.push(notification);
  }

  return groupes;
}

function LigneNotification({ notification, onLue }: { notification: NotificationResume; onLue: (id: string) => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(marquerNotificationLueAction, {
    error: null,
    success: false,
  });

  useEffect(() => {
    if (state.success) {
      onLue(notification.id);
      router.refresh();
    }
  }, [state.success, router, onLue, notification.id]);

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
  notifications: premierePage,
  curseurInitial,
}: {
  notifications: NotificationResume[];
  curseurInitial: string | null;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  // Pages plus anciennes chargees a la demande (F-NOT-01, curseur) ; la premiere page vient du serveur et se rafraichit avec lui.
  const [plusAnciennes, setPlusAnciennes] = useState<NotificationResume[]>([]);
  const [curseur, setCurseur] = useState<string | null>(curseurInitial);
  const [luesLocalement, setLuesLocalement] = useState<ReadonlySet<string>>(new Set());
  const [chargement, demarrerChargement] = useTransition();

  const notifications = [...premierePage, ...plusAnciennes].map((notification) => (luesLocalement.has(notification.id) ? { ...notification, lu: true } : notification));
  const nombreNonLues = notifications.filter((n) => !n.lu).length;
  const groupes = grouperParJour(notifications);

  function marquerToutesLues() {
    demarrer(async () => {
      await marquerToutesLuesAction();
      setLuesLocalement(new Set(notifications.map((notification) => notification.id)));
      router.refresh();
    });
  }

  function chargerPlus() {
    if (curseur === null) return;
    demarrerChargement(async () => {
      const page = await getMesNotifications(curseur);
      setPlusAnciennes((precedentes) => [...precedentes, ...page.notifications]);
      setCurseur(page.curseurSuivant);
    });
  }

  // Identite stable : LigneNotification la met en dependance d'un effet.
  const marquerLueLocalement = useCallback((id: string) => {
    setLuesLocalement((precedentes) => new Set(precedentes).add(id));
  }, []);

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
      <div className="flex flex-col gap-4">
        {groupes.map((groupe) => (
          <div key={groupe.cle} className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-encre-attenuee">
              {groupe.libelle}
            </p>
            {groupe.notifications.map((notification) => (
              <LigneNotification key={notification.id} notification={notification} onLue={marquerLueLocalement} />
            ))}
          </div>
        ))}
      </div>
      {curseur !== null ? (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={chargerPlus} disabled={chargement}>
            {chargement ? "Chargement" : "Voir les notifications plus anciennes"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
