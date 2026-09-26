import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Controle "numero d'Ordre verifie" (F-ADM-03) : sans l'interrupteur, tout le
 * monde passe ; avec l'interrupteur, seul un profil approuve depuis moins d'un
 * an passe.
 */

vi.mock("@/lib/prisma", () => ({ prisma: { professionnelSante: { findUnique: vi.fn() } } }));
vi.mock("./parametres", () => ({ estFonctionnaliteActive: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { estFonctionnaliteActive } from "./parametres";
import { MESSAGE_ORDRE_NON_VERIFIE, professionnelValide } from "./validation-professionnels-controle";

const prismaMock = prisma as unknown as { professionnelSante: { findUnique: Mock } };
const interrupteurMock = estFonctionnaliteActive as unknown as Mock;

const MAINTENANT = new Date("2026-09-26T10:00:00.000Z");
const ilYA = (jours: number) => new Date(MAINTENANT.getTime() - jours * 24 * 3600_000);

function profil(surcharges: Record<string, unknown> = {}) {
  return { statutValidation: "valide", validationDecision: "approuve", ordreVerifieLe: ilYA(30), ...surcharges };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  interrupteurMock.mockResolvedValue(true);
  prismaMock.professionnelSante.findUnique.mockResolvedValue(profil());
});

describe("interrupteur professionnels.exige_validation_ordre desactive (defaut)", () => {
  it("laisse passer tout le monde, sans meme lire le profil", async () => {
    interrupteurMock.mockResolvedValue(false);
    prismaMock.professionnelSante.findUnique.mockResolvedValue(profil({ ordreVerifieLe: null }));

    expect(await professionnelValide("user-1")).toBe(true);

    expect(interrupteurMock).toHaveBeenCalledWith("professionnels.exige_validation_ordre");
    expect(prismaMock.professionnelSante.findUnique).not.toHaveBeenCalled();
  });
});

describe("interrupteur active", () => {
  it("accepte un profil valide, approuve depuis moins d'un an", async () => {
    expect(await professionnelValide("user-1")).toBe(true);
    expect(prismaMock.professionnelSante.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { statutValidation: true, validationDecision: true, ordreVerifieLe: true },
    });
  });

  it("refuse un compte sans profil professionnel", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue(null);
    expect(await professionnelValide("user-1")).toBe(false);
  });

  it("refuse un numero jamais verifie", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue(profil({ ordreVerifieLe: null, validationDecision: null }));
    expect(await professionnelValide("user-1")).toBe(false);
  });

  it("refuse une verification de plus d'un an, accepte celle de 364 jours", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue(profil({ ordreVerifieLe: ilYA(366) }));
    expect(await professionnelValide("user-1")).toBe(false);

    prismaMock.professionnelSante.findUnique.mockResolvedValue(profil({ ordreVerifieLe: ilYA(364) }));
    expect(await professionnelValide("user-1")).toBe(true);
  });

  it("refuse un profil refuse par le ministere, meme avec une ancienne verification", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue(profil({ statutValidation: "rejete" }));
    expect(await professionnelValide("user-1")).toBe(false);
  });

  it("refuse tant qu'un complement est demande", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue(profil({ validationDecision: "complement" }));
    expect(await professionnelValide("user-1")).toBe(false);
  });

  it("refuse un profil encore en attente, meme avec une date de verification", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue(profil({ statutValidation: "en_attente" }));
    expect(await professionnelValide("user-1")).toBe(false);
  });
});

describe("message", () => {
  it("est clair pour le professionnel", () => {
    expect(MESSAGE_ORDRE_NON_VERIFIE).toBe("Votre numéro d'Ordre n'est pas encore vérifié par le ministère.");
  });
});
