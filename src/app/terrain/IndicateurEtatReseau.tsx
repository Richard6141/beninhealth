"use client";

import { useEffect, useState } from "react";

/**
 * RG-OFF-04 : indicateur permanent d'etat, affiche sur les deux ecrans
 * terrain. Trois etats possibles : "En ligne", "Hors ligne, X saisies en
 * attente", "Synchronisation...".
 */
export function IndicateurEtatReseau({
  nombreEnAttente,
  synchronisationEnCours,
}: {
  nombreEnAttente: number;
  synchronisationEnCours: boolean;
}) {
  const [enLigne, setEnLigne] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));

  useEffect(() => {
    const surEnLigne = () => setEnLigne(true);
    const surHorsLigne = () => setEnLigne(false);
    window.addEventListener("online", surEnLigne);
    window.addEventListener("offline", surHorsLigne);
    return () => {
      window.removeEventListener("online", surEnLigne);
      window.removeEventListener("offline", surHorsLigne);
    };
  }, []);

  let libelle: string;
  let couleur: string;

  if (synchronisationEnCours) {
    libelle = "Synchronisation…";
    couleur = "bg-sky-100 text-sky-800";
  } else if (!enLigne) {
    libelle = `Hors ligne, ${nombreEnAttente} saisie${nombreEnAttente > 1 ? "s" : ""} en attente`;
    couleur = "bg-amber-100 text-amber-800";
  } else if (nombreEnAttente > 0) {
    libelle = `En ligne, ${nombreEnAttente} saisie${nombreEnAttente > 1 ? "s" : ""} en attente`;
    couleur = "bg-amber-100 text-amber-800";
  } else {
    libelle = "En ligne";
    couleur = "bg-emerald-100 text-emerald-800";
  }

  return (
    <div className={`rounded-md px-3 py-2 text-sm font-medium ${couleur}`} role="status" aria-live="polite">
      {libelle}
    </div>
  );
}
