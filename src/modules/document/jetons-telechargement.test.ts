import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consommerJetonTelechargementDocument,
  creerJetonTelechargementDocument,
} from "@/modules/document/jetons-telechargement";

const MAINTENANT = new Date("2026-09-27T10:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("jetons de telechargement d'un document (F-CIT-06, RG-CIT-50)", () => {
  it("un jeton frais, pour le bon document, est accepte", () => {
    const jeton = creerJetonTelechargementDocument("doc-1");
    expect(consommerJetonTelechargementDocument("doc-1", jeton)).toBe(true);
  });

  it("CA-1 : un jeton deja consomme est refuse la deuxieme fois", () => {
    const jeton = creerJetonTelechargementDocument("doc-1");
    expect(consommerJetonTelechargementDocument("doc-1", jeton)).toBe(true);
    expect(consommerJetonTelechargementDocument("doc-1", jeton)).toBe(false);
  });

  it("CA-1 : un jeton reutilise apres 60 secondes est refuse", () => {
    const jeton = creerJetonTelechargementDocument("doc-1");
    vi.setSystemTime(new Date(MAINTENANT.getTime() + 60_001));
    expect(consommerJetonTelechargementDocument("doc-1", jeton)).toBe(false);
  });

  it("un jeton valide 59 secondes plus tard reste accepte (juste avant l'expiration)", () => {
    const jeton = creerJetonTelechargementDocument("doc-1");
    vi.setSystemTime(new Date(MAINTENANT.getTime() + 59_000));
    expect(consommerJetonTelechargementDocument("doc-1", jeton)).toBe(true);
  });

  it("refuse un jeton inconnu", () => {
    expect(consommerJetonTelechargementDocument("doc-1", "jeton-invente")).toBe(false);
  });

  it("refuse un jeton valide mais associe a un autre document", () => {
    const jeton = creerJetonTelechargementDocument("doc-1");
    expect(consommerJetonTelechargementDocument("doc-2", jeton)).toBe(false);
    // Le jeton n'est pas consomme par cette tentative pour le mauvais document.
    expect(consommerJetonTelechargementDocument("doc-1", jeton)).toBe(true);
  });

  it("le nettoyage automatique des jetons expires n'affecte pas un jeton encore valide", () => {
    const jetonExpire = creerJetonTelechargementDocument("doc-perime");
    vi.setSystemTime(new Date(MAINTENANT.getTime() + 61_000));
    const jetonValide = creerJetonTelechargementDocument("doc-1");

    // La creation de jetonValide declenche le nettoyage : jetonExpire doit
    // avoir disparu, jetonValide doit rester utilisable.
    expect(consommerJetonTelechargementDocument("doc-perime", jetonExpire)).toBe(false);
    expect(consommerJetonTelechargementDocument("doc-1", jetonValide)).toBe(true);
  });
});
