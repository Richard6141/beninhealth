// Service worker minimal (Phase 10) : usage limite et honnete, adapte a une
// connexion instable sur le terrain plutot qu'a une synchronisation hors
// ligne complete (hors perimetre de ce MVP, voir docs/roadmap.md).
//
// Strategie :
// - Navigation (changement de page) : reseau en priorite, secours sur le
//   cache si deja visite, secours final sur offline.html si rien n'est
//   disponible.
// - Autres requetes GET de meme origine (CSS, JS, images) : reseau en
//   priorite, mise en cache de chaque reponse reussie au passage, secours
//   sur le cache si le reseau echoue.
// Aucune tentative de rejouer des ecritures (formulaires) hors ligne : une
// action medicale ne doit jamais sembler reussie sans etre reellement
// parvenue au serveur.

const NOM_CACHE = "bhip-cache-v1";
const PAGE_HORS_LIGNE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(NOM_CACHE).then((cache) => cache.add(PAGE_HORS_LIGNE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) =>
        Promise.all(
          cles
            .filter((cle) => cle !== NOM_CACHE)
            .map((cle) => caches.delete(cle))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requete = event.request;

  if (requete.method !== "GET" || new URL(requete.url).origin !== self.location.origin) {
    return;
  }

  if (requete.mode === "navigate") {
    event.respondWith(
      fetch(requete)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(NOM_CACHE).then((cache) => cache.put(requete, copie));
          return reponse;
        })
        .catch(
          () =>
            caches.match(requete).then((reponseCache) => reponseCache ?? caches.match(PAGE_HORS_LIGNE))
        )
    );
    return;
  }

  event.respondWith(
    fetch(requete)
      .then((reponse) => {
        const copie = reponse.clone();
        caches.open(NOM_CACHE).then((cache) => cache.put(requete, copie));
        return reponse;
      })
      .catch(() => caches.match(requete))
  );
});
