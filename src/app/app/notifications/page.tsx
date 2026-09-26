import Link from "next/link";
import { Settings } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getMesNotifications } from "@/modules/notification/actions";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { ListeNotifications } from "./ListeNotifications";

/**
 * Ecran "Mes notifications" (Phase 10). Route distincte, accessible en
 * navigant directement (le lien depuis l'en-tete de l'espace authentifie
 * sera ajoute une fois le chantier sidebar stabilise, voir CLAUDE.md).
 */
export default async function NotificationsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  const notifications = await getMesNotifications();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Notifications
          </p>
          <h1 className="text-[28px] font-black text-encre">Mes notifications</h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Rendez-vous confirmés, résultats d&apos;examens disponibles et autres
            événements concernant votre espace.
          </p>
        </div>
        <Link
          href="/app/notifications/preferences"
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
        >
          <Settings size={14} aria-hidden="true" />
          Préférences
        </Link>
      </header>

      <Card>
        {notifications.length === 0 ? (
          <Alert level="info" title="Aucune notification">
            Vous n&apos;avez reçu aucune notification pour le moment.
          </Alert>
        ) : (
          <ListeNotifications notifications={notifications} />
        )}
      </Card>
    </div>
  );
}
