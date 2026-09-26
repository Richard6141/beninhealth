"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { getNombreNotificationsNonLues } from "@/modules/notification/actions";
import { demarrerRafraichissementCompteur } from "./rafraichissement-compteur";

export interface ClocheNotificationsProps {
  nombreNonLues: number;
}

const INTERVALLE_RAFRAICHISSEMENT_MS = 60_000;

/**
 * Cloche de notifications dans l'en-tete (fond marine) : lien direct vers
 * /app/notifications, avec une pastille de compte si des notifications non
 * lues existent. Le compte initial vient du rendu serveur du layout, puis
 * est relu toutes les 60 s et au retour sur l'onglet (F-NOT-01 du pack), sans
 * recharger la page. La lecture passe par une Server Action qui derive
 * l'utilisateur de la session : aucun identifiant n'est fourni par le client.
 */
export function ClocheNotifications({ nombreNonLues }: ClocheNotificationsProps) {
  const [compte, setCompte] = useState(nombreNonLues);
  const [compteServeurPrecedent, setCompteServeurPrecedent] = useState(nombreNonLues);

  // Une navigation qui re-rend le layout apporte un nouveau compte serveur :
  // il remplace le compte local (ajustement d'etat pendant le rendu).
  if (nombreNonLues !== compteServeurPrecedent) {
    setCompteServeurPrecedent(nombreNonLues);
    setCompte(nombreNonLues);
  }

  useEffect(() => {
    const rafraichissement = demarrerRafraichissementCompteur(getNombreNotificationsNonLues, setCompte, {
      intervalleMs: INTERVALLE_RAFRAICHISSEMENT_MS,
      estVisible: () => document.visibilityState === "visible",
    });

    const auRetourSurOnglet = () => {
      void rafraichissement.rafraichir();
    };
    document.addEventListener("visibilitychange", auRetourSurOnglet);

    return () => {
      document.removeEventListener("visibilitychange", auRetourSurOnglet);
      rafraichissement.arreter();
    };
  }, []);

  const libelle =
    compte > 0 ? `Notifications, ${compte} non lue${compte > 1 ? "s" : ""}` : "Notifications";

  return (
    <Link
      href="/app/notifications"
      aria-label={libelle}
      title={libelle}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors motion-reduce:transition-none hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
    >
      <Bell size={18} aria-hidden="true" />
      {compte > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-critique px-1 text-[10px] font-bold leading-none text-white"
        >
          {compte > 9 ? "9+" : compte}
        </span>
      ) : null}
    </Link>
  );
}
