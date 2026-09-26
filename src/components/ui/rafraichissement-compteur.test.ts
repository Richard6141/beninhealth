import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demarrerRafraichissementCompteur } from "@/components/ui/rafraichissement-compteur";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("demarrerRafraichissementCompteur (F-NOT-01, 60 s)", () => {
  it("relit le compteur a chaque intervalle et transmet le resultat", async () => {
    const lire = vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(5);
    const surResultat = vi.fn();
    const r = demarrerRafraichissementCompteur(lire, surResultat, { intervalleMs: 60_000, estVisible: () => true });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(surResultat).toHaveBeenLastCalledWith(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(surResultat).toHaveBeenLastCalledWith(5);
    expect(lire).toHaveBeenCalledTimes(2);
    r.arreter();
  });

  it("ne lit rien tant que l'onglet est cache", async () => {
    const lire = vi.fn().mockResolvedValue(1);
    const r = demarrerRafraichissementCompteur(lire, vi.fn(), { intervalleMs: 60_000, estVisible: () => false });

    await vi.advanceTimersByTimeAsync(180_000);
    expect(lire).not.toHaveBeenCalled();
    r.arreter();
  });

  it("un echec de lecture est absorbe et le tour suivant reessaie", async () => {
    const lire = vi.fn().mockRejectedValueOnce(new Error("reseau")).mockResolvedValueOnce(2);
    const surResultat = vi.fn();
    const r = demarrerRafraichissementCompteur(lire, surResultat, { intervalleMs: 60_000, estVisible: () => true });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(surResultat).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(surResultat).toHaveBeenCalledWith(2);
    r.arreter();
  });

  it("apres arret, plus aucune lecture ni resultat transmis", async () => {
    const lire = vi.fn().mockResolvedValue(4);
    const surResultat = vi.fn();
    const r = demarrerRafraichissementCompteur(lire, surResultat, { intervalleMs: 60_000, estVisible: () => true });

    r.arreter();
    await vi.advanceTimersByTimeAsync(300_000);
    await r.rafraichir();
    expect(lire).not.toHaveBeenCalled();
    expect(surResultat).not.toHaveBeenCalled();
  });

  it("un resultat qui arrive apres l'arret est ignore", async () => {
    let resoudre: (n: number) => void = () => undefined;
    const lire = vi.fn(() => new Promise<number>((resolve) => { resoudre = resolve; }));
    const surResultat = vi.fn();
    const r = demarrerRafraichissementCompteur(lire, surResultat, { intervalleMs: 60_000, estVisible: () => true });

    await vi.advanceTimersByTimeAsync(60_000);
    r.arreter();
    resoudre(9);
    await vi.advanceTimersByTimeAsync(0);
    expect(surResultat).not.toHaveBeenCalled();
  });

  it("rafraichir() lit immediatement (retour d'onglet) quand visible", async () => {
    const lire = vi.fn().mockResolvedValue(7);
    const surResultat = vi.fn();
    const r = demarrerRafraichissementCompteur(lire, surResultat, { intervalleMs: 60_000, estVisible: () => true });

    await r.rafraichir();
    expect(surResultat).toHaveBeenCalledWith(7);
    r.arreter();
  });
});
