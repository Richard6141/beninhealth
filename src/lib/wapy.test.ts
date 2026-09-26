import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envoyerMessageWapy, wapyConfigure } from "@/lib/wapy";

const message = {
  destinataire: "+2290197000000",
  texte: "Bonjour, votre code est 482913",
  consentement: "inscription-test",
  cleIdempotence: "demande-1",
};

function reponse(statut: number, corps?: unknown, entetes: Record<string, string> = {}) {
  return new Response(corps === undefined ? null : JSON.stringify(corps), { status: statut, headers: entetes });
}

describe("envoyerMessageWapy", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("WAPY_PONT_CLE", "cle-de-test");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("n'appelle jamais le reseau sans cle configuree", async () => {
    vi.stubEnv("WAPY_PONT_CLE", "");
    expect(wapyConfigure()).toBe(false);
    expect(await envoyerMessageWapy(message)).toEqual({ ok: false, raison: "non_configure" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envoie la cle en Bearer, la cle d'idempotence en en-tete, et exactement les 3 champs du contrat", async () => {
    fetchMock.mockResolvedValue(reponse(200, { id: 1, statut: "envoye", rejeu: false }));

    const resultat = await envoyerMessageWapy(message);

    expect(resultat).toEqual({ ok: true, rejeu: false });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://wapy.pro/pont/v1/messages");
    expect(options.headers.Authorization).toBe("Bearer cle-de-test");
    expect(options.headers["Idempotency-Key"]).toBe("demande-1");
    expect(JSON.parse(options.body)).toEqual({
      destinataire: message.destinataire,
      texte: message.texte,
      consentement: message.consentement,
    });
  });

  it("signale un rejeu d'idempotence comme un succes", async () => {
    fetchMock.mockResolvedValue(reponse(200, { rejeu: true }));
    expect(await envoyerMessageWapy(message)).toEqual({ ok: true, rejeu: true });
  });

  it.each([
    [404, { detail: "destinataire-inexistant" }, "destinataire_injoignable"],
    [403, { detail: "destinataire-desabonne" }, "destinataire_injoignable"],
    [403, { detail: "compte-suspendu" }, "refuse"],
    [401, { detail: "cle-inconnue" }, "refuse"],
    [400, { detail: "numero-illisible" }, "requete_invalide"],
    [502, { detail: "whatsapp-injoignable" }, "service_indisponible"],
    [503, { detail: "numero-deconnecte" }, "service_indisponible"],
  ])("traduit le statut %i (%o) en %s", async (statut, corps, raisonAttendue) => {
    fetchMock.mockResolvedValue(reponse(statut, corps));
    const resultat = await envoyerMessageWapy(message);
    expect(resultat).toMatchObject({ ok: false, raison: raisonAttendue });
  });

  it("lit Retry-After sur un 429", async () => {
    fetchMock.mockResolvedValue(reponse(429, { detail: "plafond-horaire" }, { "Retry-After": "42" }));
    expect(await envoyerMessageWapy(message)).toMatchObject({
      ok: false,
      raison: "limite_atteinte",
      reessayerDansSecondes: 42,
    });
  });

  it("applique une attente par defaut si Retry-After est absent", async () => {
    fetchMock.mockResolvedValue(reponse(429, { detail: "trop-rapide" }));
    expect(await envoyerMessageWapy(message)).toMatchObject({ raison: "limite_atteinte", reessayerDansSecondes: 5 });
  });

  it("traite une panne reseau comme un service indisponible, sans lever d'exception", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    expect(await envoyerMessageWapy(message)).toMatchObject({ ok: false, raison: "service_indisponible" });
  });

  it("refuse un texte vide ou depassant 1000 caracteres avant tout appel reseau", async () => {
    expect(await envoyerMessageWapy({ ...message, texte: "   " })).toMatchObject({ raison: "requete_invalide" });
    expect(await envoyerMessageWapy({ ...message, texte: "x".repeat(1001) })).toMatchObject({
      raison: "requete_invalide",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
