import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le service worker n'est pas un module : on l'execute dans un contexte vm
 * avec de faux `self`, `caches` et `fetch`, puis on lui envoie des evenements.
 * Regle testee : jamais de page ni d'API en cache (donnees de sante, cache
 * relu par le prochain utilisateur du poste apres une deconnexion).
 */

type Ecouteur = (evenement: unknown) => void;

const source = readFileSync(path.join(process.cwd(), "public", "service-worker.js"), "utf8");

function charger() {
  const ecouteurs: Record<string, Ecouteur> = {};
  const cachePut = vi.fn();
  const cacheAdd = vi.fn();
  const cacheOuvert = { put: cachePut, add: cacheAdd };
  const cachesFaux = {
    open: vi.fn(async () => cacheOuvert),
    match: vi.fn(async (_demande?: unknown) => undefined as unknown),
    keys: vi.fn(async () => ["bhip-cache-v1", "bhip-cache-v2", "autre"]),
    delete: vi.fn(async () => true),
  };
  const fetchFaux = vi.fn();
  const contexte = {
    self: {
      location: { origin: "https://bhip.example" },
      addEventListener: (nom: string, fn: Ecouteur) => {
        ecouteurs[nom] = fn;
      },
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    },
    caches: cachesFaux,
    fetch: fetchFaux,
    URL,
  };
  vm.runInNewContext(source, contexte);
  return { ecouteurs, cachePut, cachesFaux, fetchFaux };
}

function evenementFetch(url: string, options: { method?: string; mode?: string } = {}) {
  const respondWith = vi.fn();
  return {
    evenement: { request: { url, method: options.method ?? "GET", mode: options.mode ?? "no-cors" }, respondWith },
    respondWith,
  };
}

let sw: ReturnType<typeof charger>;

beforeEach(() => {
  sw = charger();
});

describe("service worker : aucune donnee de sante en cache", () => {
  it.each([
    "https://bhip.example/app/patient/dossier",
    "https://bhip.example/api/documents/abc",
    "https://bhip.example/api/patient/export/json",
    "https://bhip.example/app/medecin/patients?_rsc=1x2y",
    "https://bhip.example/app/etablissement/audit",
  ])("n'intercepte jamais %s", (url) => {
    const { evenement, respondWith } = evenementFetch(url);
    sw.ecouteurs.fetch(evenement);
    expect(respondWith).not.toHaveBeenCalled();
    expect(sw.cachePut).not.toHaveBeenCalled();
  });

  it("une navigation va au reseau et ne met jamais la page en cache", async () => {
    const reponse = { ok: true, clone: () => reponse };
    sw.fetchFaux.mockResolvedValue(reponse);
    const { evenement, respondWith } = evenementFetch("https://bhip.example/app/patient", { mode: "navigate" });

    sw.ecouteurs.fetch(evenement);
    expect(respondWith).toHaveBeenCalledTimes(1);
    expect(await respondWith.mock.calls[0][0]).toBe(reponse);
    expect(sw.cachePut).not.toHaveBeenCalled();
  });

  it("hors ligne, une navigation montre la page hors ligne et jamais une page de donnees deja vue", async () => {
    sw.fetchFaux.mockRejectedValue(new Error("hors ligne"));
    sw.cachesFaux.match.mockImplementation(async (demande: unknown) => (demande === "/offline.html" ? "PAGE_HORS_LIGNE" : "PAGE_DE_DONNEES"));
    const { evenement, respondWith } = evenementFetch("https://bhip.example/app/patient/dossier", { mode: "navigate" });

    sw.ecouteurs.fetch(evenement);
    expect(await respondWith.mock.calls[0][0]).toBe("PAGE_HORS_LIGNE");
  });

  it("ignore les requetes qui ne sont pas des GET ou qui visent une autre origine", () => {
    for (const requete of [
      evenementFetch("https://bhip.example/app/x", { method: "POST" }),
      evenementFetch("https://autre.example/_next/static/a.js"),
    ]) {
      sw.ecouteurs.fetch(requete.evenement);
      expect(requete.respondWith).not.toHaveBeenCalled();
    }
  });
});

describe("service worker : fichiers statiques publics", () => {
  it.each([
    "https://bhip.example/_next/static/chunks/abc.js",
    "https://bhip.example/logo-header-blanc.png",
    "https://bhip.example/manifest.webmanifest",
    "https://bhip.example/fonts/mont.woff2",
  ])("met en cache %s quand le reseau repond", async (url) => {
    const reponse = { ok: true, clone: () => "COPIE" };
    sw.fetchFaux.mockResolvedValue(reponse);
    const { evenement, respondWith } = evenementFetch(url);

    sw.ecouteurs.fetch(evenement);
    expect(await respondWith.mock.calls[0][0]).toBe(reponse);
    await Promise.resolve();
    expect(sw.cachePut).toHaveBeenCalledWith(evenement.request, "COPIE");
  });

  it("ne met pas en cache une reponse en erreur, et retombe sur le cache si le reseau echoue", async () => {
    sw.fetchFaux.mockResolvedValueOnce({ ok: false, clone: () => "ERREUR" });
    const premier = evenementFetch("https://bhip.example/_next/static/a.js");
    sw.ecouteurs.fetch(premier.evenement);
    await premier.respondWith.mock.calls[0][0];
    await Promise.resolve();
    expect(sw.cachePut).not.toHaveBeenCalled();

    sw.fetchFaux.mockRejectedValueOnce(new Error("hors ligne"));
    sw.cachesFaux.match.mockResolvedValueOnce("COPIE_EN_CACHE");
    const second = evenementFetch("https://bhip.example/_next/static/a.js");
    sw.ecouteurs.fetch(second.evenement);
    expect(await second.respondWith.mock.calls[0][0]).toBe("COPIE_EN_CACHE");
  });
});

describe("service worker : purge de l'ancien cache", () => {
  it("a l'activation, supprime tout cache autre que la version courante (les pages mises en cache par v1 disparaissent)", async () => {
    const attendre = vi.fn();
    sw.ecouteurs.activate({ waitUntil: attendre });
    await attendre.mock.calls[0][0];

    expect(sw.cachesFaux.delete).toHaveBeenCalledWith("bhip-cache-v1");
    expect(sw.cachesFaux.delete).toHaveBeenCalledWith("autre");
    expect(sw.cachesFaux.delete).not.toHaveBeenCalledWith("bhip-cache-v2");
  });

  it("a l'installation, ne met en cache que la page hors ligne", async () => {
    const attendre = vi.fn();
    sw.ecouteurs.install({ waitUntil: attendre });
    await attendre.mock.calls[0][0];
    const cacheOuvert = await sw.cachesFaux.open.mock.results[0].value;
    expect(cacheOuvert.add).toHaveBeenCalledTimes(1);
    expect(cacheOuvert.add).toHaveBeenCalledWith("/offline.html");
  });
});
