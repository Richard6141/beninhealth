import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { parametre: { findUnique: vi.fn() } } }));

import { prisma } from "@/lib/prisma";
import { lireParametre } from "@/modules/administration/parametres-lecture";
import {
  CLES_PARAMETRES,
  PARAMETRES_PAR_DEFAUT,
  definitionParametre,
} from "@/modules/administration/parametres-catalogue";

const findUniqueMock = (prisma as unknown as { parametre: { findUnique: Mock } }).parametre.findUnique;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lireParametre : lecture en base a chaque appel (RG-ADM-50)", () => {
  it("renvoie la valeur de la base et la relit a chaque appel, sans cache", async () => {
    findUniqueMock.mockResolvedValueOnce({ valeur: 20 }).mockResolvedValueOnce({ valeur: 40 });

    expect(await lireParametre("partage.code_duree_minutes")).toBe(20);
    expect(await lireParametre("partage.code_duree_minutes")).toBe(40);

    expect(findUniqueMock).toHaveBeenCalledTimes(2);
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { cle: "partage.code_duree_minutes" }, select: { valeur: true } });
  });

  it("retombe sur la valeur par defaut du catalogue quand la ligne n'existe pas encore", async () => {
    findUniqueMock.mockResolvedValue(null);

    expect(await lireParametre("urgence.limite_acces_24h")).toBe(5);
    expect(await lireParametre("reference.duree_acces_jours")).toBe(30);
  });

  it("refuse une valeur alteree hors des bornes, non entiere ou non finie : valeur par defaut", async () => {
    for (const valeur of [0, 999, -3, 7.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      findUniqueMock.mockResolvedValueOnce({ valeur });
      expect(await lireParametre("urgence.limite_acces_24h")).toBe(5);
    }
  });

  it("accepte les bornes exactes du catalogue", async () => {
    findUniqueMock.mockResolvedValueOnce({ valeur: 1 }).mockResolvedValueOnce({ valeur: 20 });

    expect(await lireParametre("urgence.limite_acces_24h")).toBe(1);
    expect(await lireParametre("urgence.limite_acces_24h")).toBe(20);
  });

  it("une base en panne ne bloque jamais l'appelant : valeur par defaut et erreur journalisee", async () => {
    findUniqueMock.mockRejectedValue(new Error("base indisponible"));
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await lireParametre("identity.code_verification_duree_minutes")).toBe(10);
    expect(erreurConsole).toHaveBeenCalled();

    erreurConsole.mockRestore();
  });
});

describe("catalogue des parametres", () => {
  it("chaque cle du catalogue a une definition, sans doublon", () => {
    expect(new Set(CLES_PARAMETRES).size).toBe(CLES_PARAMETRES.length);
    expect(PARAMETRES_PAR_DEFAUT.map((definition) => definition.cle).sort()).toEqual([...CLES_PARAMETRES].sort());
  });

  it("chaque valeur par defaut est un entier compris dans ses propres bornes", () => {
    for (const definition of PARAMETRES_PAR_DEFAUT) {
      expect(Number.isInteger(definition.valeurDefaut)).toBe(true);
      expect(definition.borneMin).toBeLessThanOrEqual(definition.valeurDefaut);
      expect(definition.valeurDefaut).toBeLessThanOrEqual(definition.borneMax);
      // 0 est admis quand il signifie "non renseigne" (numero d'urgence), jamais un negatif.
      expect(definition.borneMin).toBeGreaterThanOrEqual(0);
    }
  });

  it("aucune description ne pretend encore qu'un parametre n'est pas branche", () => {
    for (const definition of PARAMETRES_PAR_DEFAUT) {
      expect(definition.description).not.toContain("non encore branche");
    }
  });

  it("definitionParametre refuse une cle inconnue", () => {
    expect(() => definitionParametre("inconnue" as never)).toThrow();
  });
});
