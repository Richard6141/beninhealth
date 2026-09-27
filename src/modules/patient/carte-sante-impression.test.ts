import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consommerJetonImpressionCarteSante, creerJetonImpressionCarteSante } from "@/modules/patient/carte-sante-impression";

const MAINTENANT = new Date("2026-09-27T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("carte-sante-impression : jeton de telechargement du PDF (F-CIT-05, etape 4)", () => {
  it("consomme un jeton valide et renvoie le patient associe", () => {
    const jeton = creerJetonImpressionCarteSante("pat-1");

    expect(consommerJetonImpressionCarteSante(jeton)).toBe("pat-1");
  });

  it("usage unique : la deuxieme consommation du meme jeton echoue", () => {
    const jeton = creerJetonImpressionCarteSante("pat-1");

    consommerJetonImpressionCarteSante(jeton);

    expect(consommerJetonImpressionCarteSante(jeton)).toBeNull();
  });

  it("un jeton inconnu renvoie null", () => {
    expect(consommerJetonImpressionCarteSante("jeton-jamais-cree")).toBeNull();
  });

  it("un jeton expire (plus de 60 secondes) renvoie null", () => {
    const jeton = creerJetonImpressionCarteSante("pat-1");

    vi.setSystemTime(new Date(MAINTENANT.getTime() + 61_000));

    expect(consommerJetonImpressionCarteSante(jeton)).toBeNull();
  });

  it("deux jetons de deux patients differents restent independants", () => {
    const jetonA = creerJetonImpressionCarteSante("pat-a");
    const jetonB = creerJetonImpressionCarteSante("pat-b");

    expect(consommerJetonImpressionCarteSante(jetonA)).toBe("pat-a");
    expect(consommerJetonImpressionCarteSante(jetonB)).toBe("pat-b");
  });
});
