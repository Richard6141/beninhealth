// Service worker minimal (Phase 10) : usage limite et honnete, adapte a une
// connexion instable sur le terrain plutot qu'a une synchronisation hors
// ligne complete (hors perimetre de ce MVP, voir docs/reste-a-faire.md).
//
// REGLE DE CONFIDENTIALITE : ce fichier ne met JAMAIS en cache une page ni une
// reponse d'API. Les pages /app/*, les routes /api/* et les navigations
// contiennent des donnees de sante ; le cache de ce navigateur survit a la
// deconnexion et serait relu par le prochain utilisateur du poste. Seuls les
// fichiers statiques publics (scripts, feuilles de style, images, polices,
// manifeste) et la page hors ligne sont mis en cache.
//
// Strategie :
// - Navigation : reseau uniquement ; hors ligne, on montre /offline.html.
// - Fichier statique public : reseau en priorite, copie en cache en cas de
//   succes, secours sur le cache si le reseau echoue.
// - Tout le reste (API, pages de donnees, flux RSC) : jamais intercepte.
// Aucune tentative de rejouer des ecritures (formulaires) hors ligne : une
// action medicale ne doit jamais sembler reussie sans etre reellement
// parvenue au serveur.

// v2 : le changement de nom purge (voir "activate") les copies de pages et de
// reponses d'API que la version precedente avait conservees.
const NOM_CACHE = "bhip-cache-v2";
const PAGE_HORS_LIGNE = "/offline.html";

const EXTENSIONS_STATIQUES = /\.(?:js|css|png|jpe?g|svg|ico|webp|gif|woff2?|ttf|webmanifest)$/i;

function estFichierStatiquePublic(url) {
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/app/")) {
    return false;
  }
  return url.pathname.startsWith("/_next/static/") || EXTENSIONS_STATIQUES.test(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(NOM_CACHE).then((cache) => cache.add(PAGE_HORS_LIGNE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((cle) => cle !== NOM_CACHE).map((cle) => caches.delete(cle))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  const url = new URL(requete.url);

  if (requete.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (requete.mode === "navigate") {
    event.respondWith(fetch(requete).catch(() => caches.match(PAGE_HORS_LIGNE)));
    return;
  }

  if (!estFichierStatiquePublic(url)) {
    return;
  }

  event.respondWith(
    fetch(requete)
      .then((reponse) => {
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(NOM_CACHE).then((cache) => cache.put(requete, copie));
        }
        return reponse;
      })
      .catch(() => caches.match(requete))
  );
});
