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

describe("getTexteSmsDuCatalogue : repli sur le catalogue compile quand la table n'est pas encore semee", () => {
  it("un code connu du pack, absent de la base (ecran d'administration jamais ouvert), envoie quand meme le texte compile", async () => {
    findUniqueMock.mockResolvedValue(null);

    expect(await getTexteSmsDuCatalogue("N-2FA-RESET")).toBe(
      "BHIP : la double authentification de votre compte a été réinitialisée. Si ce n'est pas vous, contactez le support."
    );
  });

  it("un code compile mais 'interne seulement' (texte vide) n'envoie toujours aucun SMS meme absent de la base", async () => {
    findUniqueMock.mockResolvedValue(null);

    expect(await getTexteSmsDuCatalogue("N-MERGE")).toBeNull();
  });

  it("une ligne DEJA presente en base (l'administrateur a ouvert l'ecran une fois) garde toujours la priorite sur le texte compile", async () => {
    findUniqueMock.mockResolvedValue({ actif: false, texteModele: "BHIP : texte compile" });

    expect(await getTexteSmsDuCatalogue("N-2FA-RESET")).toBeNull();
  });

  it("un code totalement inconnu (ni en base, ni dans le catalogue compile) n'envoie jamais rien", async () => {
    findUniqueMock.mockResolvedValue(null);

    expect(await getTexteSmsDuCatalogue("N-CE-CODE-N-EXISTE-PAS")).toBeNull();
  });
});
