import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enregistrerEvenement,
  limiteAtteinte,
  verifierEtIncrementerDebit,
  viderCompteursDebit,
} from "@/lib/limite-debit";

const FENETRE = 60_000;

beforeEach(() => {
  viderCompteursDebit();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("limiteAtteinte / enregistrerEvenement", () => {
  it("ne compte rien tant qu'aucun evenement n'est enregistre, et lire ne compte jamais", () => {
    for (let i = 0; i < 10; i++) expect(limiteAtteinte("cle", 3, FENETRE)).toBe(false);
  });

  it("devient vrai exactement a la limite", () => {
    enregistrerEvenement("cle", FENETRE);
    enregistrerEvenement("cle", FENETRE);
    expect(limiteAtteinte("cle", 3, FENETRE)).toBe(false);
    enregistrerEvenement("cle", FENETRE);
    expect(limiteAtteinte("cle", 3, FENETRE)).toBe(true);
  });

  it("la fenetre se referme : apres la duree, le compteur repart de zero", () => {
    for (let i = 0; i < 3; i++) enregistrerEvenement("cle", FENETRE);
    expect(limiteAtteinte("cle", 3, FENETRE)).toBe(true);
    vi.advanceTimersByTime(FENETRE + 1);
    expect(limiteAtteinte("cle", 3, FENETRE)).toBe(false);
    enregistrerEvenement("cle", FENETRE);
    expect(limiteAtteinte("cle", 3, FENETRE)).toBe(false);
  });

  it("deux cles sont independantes", () => {
    for (let i = 0; i < 3; i++) enregistrerEvenement("a", FENETRE);
    expect(limiteAtteinte("b", 3, FENETRE)).toBe(false);
  });
});

describe("verifierEtIncrementerDebit (existant)", () => {
  it("autorise jusqu'a la limite puis refuse", () => {
    expect(verifierEtIncrementerDebit("k", 2, FENETRE).autorise).toBe(true);
    expect(verifierEtIncrementerDebit("k", 2, FENETRE).autorise).toBe(true);
    expect(verifierEtIncrementerDebit("k", 2, FENETRE).autorise).toBe(false);
  });
});
