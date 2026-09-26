import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { modeleNotification: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { getTexteSmsDuCatalogue, rendreModele } from "@/modules/notification/catalogue";

const findUniqueMock = (prisma as unknown as { modeleNotification: { findUnique: Mock } }).modeleNotification.findUnique;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rendreModele (F-NOT-04)", () => {
  it("remplace chaque variable par sa valeur", () => {
    const rendu = rendreModele("BHIP : RDV le {date} a {heure}, {etablissement}.", {
      date: "12/10",
      heure: "09:30",
      etablissement: "CNHU",
    });
    expect(rendu).toEqual({ texte: "BHIP : RDV le 12/10 a 09:30, CNHU.", manquantes: [] });
  });

  it("signale les variables sans valeur, une seule fois chacune, sans les effacer", () => {
    const rendu = rendreModele("{date} puis {date} et {heure}", { heure: "10:00" });
    expect(rendu.manquantes).toEqual(["date"]);
    expect(rendu.texte).toBe("{date} puis {date} et 10:00");
  });

  it("laisse intact un texte sans variable", () => {
    expect(rendreModele("BHIP : un resultat est disponible.")).toEqual({
      texte: "BHIP : un resultat est disponible.",
      manquantes: [],
    });
  });
});

describe("getTexteSmsDuCatalogue : quand un SMS peut partir", () => {
  it("rend le texte d'une entree active", async () => {
    findUniqueMock.mockResolvedValue({ actif: true, texteModele: "BHIP : code {code}." });
    expect(await getTexteSmsDuCatalogue("N-OTP", { code: "123456" })).toBe("BHIP : code 123456.");
  });

  it("aucun SMS si l'entree est absente, inactive ou sans texte (interne seulement)", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    expect(await getTexteSmsDuCatalogue("N-INCONNU")).toBeNull();

    findUniqueMock.mockResolvedValueOnce({ actif: false, texteModele: "BHIP : x" });
    expect(await getTexteSmsDuCatalogue("N-X")).toBeNull();

    findUniqueMock.mockResolvedValueOnce({ actif: true, texteModele: "   " });
    expect(await getTexteSmsDuCatalogue("N-LAB-RESULT-PRO")).toBeNull();
  });

  it("aucun SMS avec une variable non resolue (jamais un {champ} envoye)", async () => {
    findUniqueMock.mockResolvedValue({ actif: true, texteModele: "RDV le {date}" });
    expect(await getTexteSmsDuCatalogue("N-APPT-CONFIRMED", {})).toBeNull();
  });
});
