"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker (Phase 10, voir public/service-worker.js).
 * Composant client minimal sans rendu visuel : l'enregistrement ne doit
 * jamais bloquer ni faire echouer le chargement de la page si le navigateur
 * ne supporte pas les service workers ou si l'enregistrement echoue.
 */
export function RegistreServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Echec silencieux volontaire : l'absence de mode hors ligne ne doit
      // jamais empecher l'utilisation normale de la plateforme en ligne.
    });
  }, []);

  return null;
}
