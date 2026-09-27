import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { fonctionnaliteActivable: { findUnique: vi.fn() } } }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";

const findUniqueMock = (prisma as unknown as { fonctionnaliteActivable: { findUnique: Mock } }).fonctionnaliteActivable.findUnique;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("estFonctionnaliteActive (F-ADM-07, RG-ADM-50)", () => {
  it("relit la base a chaque appel : un basculement prend effet sans redemarrage", async () => {
    findUniqueMock.mockResolvedValueOnce({ actif: true }).mockResolvedValueOnce({ actif: false });

    expect(await estFonctionnaliteActive("lab.module")).toBe(true);
    expect(await estFonctionnaliteActive("lab.module")).toBe(false);
    expect(findUniqueMock).toHaveBeenCalledTimes(2);
  });

  it("ligne absente : modules metier actifs, IA et le reste desactives", async () => {
    findUniqueMock.mockResolvedValue(null);

    expect(await estFonctionnaliteActive("pharmacy.module")).toBe(true);
    expect(await estFonctionnaliteActive("lab.module")).toBe(true);
    expect(await estFonctionnaliteActive("community.module")).toBe(true);
    expect(await estFonctionnaliteActive("ai.summary")).toBe(false);
    expect(await estFonctionnaliteActive("ai.citizen_assistant")).toBe(false);
    expect(await estFonctionnaliteActive("access.by_npi")).toBe(false);
    expect(await estFonctionnaliteActive("demo.banner")).toBe(false);
  });

  it("une desactivation explicite d'un module est respectee (ligne existante a faux)", async () => {
    findUniqueMock.mockResolvedValue({ actif: false });

    expect(await estFonctionnaliteActive("pharmacy.module")).toBe(false);
  });

  it("une base en panne ne lance jamais d'exception : etat par defaut (les acces sensibles restent fermes)", async () => {
    findUniqueMock.mockRejectedValue(new Error("base indisponible"));
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await estFonctionnaliteActive("access.by_npi")).toBe(false);
    expect(await estFonctionnaliteActive("lab.module")).toBe(true);
    expect(erreurConsole).toHaveBeenCalled();

    erreurConsole.mockRestore();
  });
});
