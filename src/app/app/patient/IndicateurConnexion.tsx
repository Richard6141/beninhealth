"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export interface IndicateurConnexionProps {
  /** Instant du rendu serveur de la page (ISO), affiche si la connexion tombe pendant la consultation. */
  genereLe: string;
}

function formaterHorodatage(genereLe: string): string {
  try {
    return new Date(genereLe).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return genereLe;
  }
}

/**
 * Bandeau "Hors connexion" (F-CIT-02, RG-CIT-10 : "le tableau de bord doit
 * fonctionner hors ligne en lecture avec les dernieres donnees chargees").
 *
 * Ce depot ne met JAMAIS en cache une page de donnees de sante dans le
 * service worker (voir public/service-worker.js, decision de confidentialite
 * documentee de la Phase 10 : le cache survivrait a la deconnexion et serait
 * relu par le prochain utilisateur d'un poste partage). Un rechargement reel
 * hors connexion affiche donc /offline.html, jamais cette page avec des
 * donnees perimees.
 *
 * Ce que ce composant couvre reellement, et c'est ce que RG-CIT-10 demande a
 * la lettre : si la connexion tombe PENDANT que la page est deja ouverte
 * (sans rechargement), les donnees deja rendues restent visibles a l'ecran
 * (React ne les efface pas) ; ce bandeau se contente de l'annoncer avec
 * l'horodatage du chargement, plutot que de laisser l'utilisateur croire que
 * tout est a jour.
 */
export function IndicateurConnexion({ genereLe }: IndicateurConnexionProps) {
  // Toujours false au premier rendu, cote serveur ET cote client (jamais de
  // mismatch d'hydratation) : navigator.onLine n'est fiable qu'apres montage,
  // certains navigateurs (Chromium sans acces reseau au premier rendu, entre
  // autres) le rapportent a tort a false avant que la page ne soit meme
  // affichee. La vraie valeur est lue une fois montee, dans l'effet ci-dessous.
  const [horsLigne, setHorsLigne] = useState(false);

  useEffect(() => {
    const surHorsLigne = () => setHorsLigne(true);
    const surEnLigne = () => setHorsLigne(false);

    // Lecture differee au montage (jamais pendant le rendu) : synchronise
    // l'etat avec un systeme externe au composant (l'API navigateur), le cas
    // meme que documente par la regle react-hooks/set-state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHorsLigne(!navigator.onLine);

    window.addEventListener("offline", surHorsLigne);
    window.addEventListener("online", surEnLigne);
    return () => {
      window.removeEventListener("offline", surHorsLigne);
      window.removeEventListener("online", surEnLigne);
    };
  }, []);

  if (!horsLigne) {
    return null;
  }

  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-champ border border-vigilance bg-vigilance-clair px-4 py-2 text-[13px] font-semibold text-vigilance"
    >
      <WifiOff size={16} aria-hidden="true" />
      Hors connexion : données du {formaterHorodatage(genereLe)}
    </div>
  );
}
