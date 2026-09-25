import Link from "next/link";
import { Bell } from "lucide-react";

export interface ClocheNotificationsProps {
  nombreNonLues: number;
}

/**
 * Cloche de notifications dans l'en-tete (fond marine) : lien direct vers
 * /app/notifications, avec une pastille de compte si des notifications non
 * lues existent. Composant serveur (aucune interactivite propre), le compte
 * est recalcule a chaque rendu du layout.
 */
export function ClocheNotifications({ nombreNonLues }: ClocheNotificationsProps) {
  const libelle =
    nombreNonLues > 0
      ? `Notifications, ${nombreNonLues} non lue${nombreNonLues > 1 ? "s" : ""}`
      : "Notifications";

  return (
    <Link
      href="/app/notifications"
      aria-label={libelle}
      title={libelle}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors motion-reduce:transition-none hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
    >
      <Bell size={18} aria-hidden="true" />
      {nombreNonLues > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-critique px-1 text-[10px] font-bold leading-none text-white"
        >
          {nombreNonLues > 9 ? "9+" : nombreNonLues}
        </span>
      ) : null}
    </Link>
  );
}
