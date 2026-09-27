import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appareilConnu: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/modules/identity/alertes-securite", () => ({ alerterSecurite: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { alerterSecurite } from "@/modules/identity/alertes-securite";
import { empreinteAppareil, enregistrerAppareilEtAlerter } from "@/modules/identity/appareils";

const p = prisma as unknown as { appareilConnu: { findUnique: Mock; update: Mock; count: Mock; create: Mock } };
const alerterMock = alerterSecurite as unknown as Mock;
const CHROME = { appareil: "Ordinateur", navigateur: "Chrome" };

beforeEach(() => {
  vi.clearAllMocks();
  p.appareilConnu.findUnique.mockResolvedValue(null);
  p.appareilConnu.count.mockResolvedValue(0);
});

describe("enregistrerAppareilEtAlerter (F-AUTH-02)", () => {
  it("la toute premiere connexion enregistre l'appareil sans alerter (aucun appareil de reference)", async () => {
    await enregistrerAppareilEtAlerter("u-1", ["medecin"], CHROME);

    expect(p.appareilConnu.create).toHaveBeenCalledTimes(1);
    expect(alerterMock).not.toHaveBeenCalled();
  });

  it("un professionnel qui se connecte depuis un nouvel appareil est alerte (notification et SMS, sans lien)", async () => {
    p.appareilConnu.count.mockResolvedValue(1);

    await enregistrerAppareilEtAlerter("u-1", ["medecin"], { appareil: "Mobile", navigateur: "Safari" });

    expect(alerterMock).toHaveBeenCalledTimes(1);
    const [userId, alerte] = alerterMock.mock.calls[0];
    expect(userId).toBe("u-1");
    expect(alerte.type).toBe("connexion_nouvel_appareil");
    expect(alerte.message).toMatch(/Mobile, Safari/);
    expect(alerte.messageSms).toMatch(/Nouvelle connexion a votre compte/);
    expect(alerte.messageSms).not.toMatch(/https?:/);
  });

  it("un appareil deja connu n'alerte pas et met a jour sa derniere utilisation", async () => {
    p.appareilConnu.findUnique.mockResolvedValue({ id: "a-1" });

    await enregistrerAppareilEtAlerter("u-1", ["medecin"], CHROME);

    expect(p.appareilConnu.update).toHaveBeenCalledWith({ where: { id: "a-1" }, data: { derniereFoisLe: expect.any(Date) } });
    expect(p.appareilConnu.create).not.toHaveBeenCalled();
    expect(alerterMock).not.toHaveBeenCalled();
  });

  it("un patient n'est pas alerte (l'appareil est tout de meme enregistre)", async () => {
    p.appareilConnu.count.mockResolvedValue(2);

    await enregistrerAppareilEtAlerter("u-1", ["patient"], CHROME);

    expect(p.appareilConnu.create).toHaveBeenCalledTimes(1);
    expect(alerterMock).not.toHaveBeenCalled();
  });

  it("un compte patient et professionnel est alerte", async () => {
    p.appareilConnu.count.mockResolvedValue(1);

    await enregistrerAppareilEtAlerter("u-1", ["patient", "medecin"], CHROME);

    expect(alerterMock).toHaveBeenCalledTimes(1);
  });

  it("ne stocke que l'empreinte : elle depend du compte, de l'appareil et du navigateur", async () => {
    await enregistrerAppareilEtAlerter("u-1", ["medecin"], CHROME);

    const donnees = p.appareilConnu.create.mock.calls[0][0].data;
    expect(donnees.empreinte).toBe(empreinteAppareil("u-1", "Ordinateur", "Chrome"));
    expect(donnees.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinteAppareil("u-1", "Ordinateur", "Chrome")).not.toBe(empreinteAppareil("u-2", "Ordinateur", "Chrome"));
    expect(empreinteAppareil("u-1", "Ordinateur", "Chrome")).not.toBe(empreinteAppareil("u-1", "Mobile", "Chrome"));
  });

  it("un echec de la base ne fait jamais echouer la connexion", async () => {
    p.appareilConnu.findUnique.mockRejectedValue(new Error("base indisponible"));

    await expect(enregistrerAppareilEtAlerter("u-1", ["medecin"], CHROME)).resolves.toBeUndefined();
    expect(alerterMock).not.toHaveBeenCalled();
  });
});
