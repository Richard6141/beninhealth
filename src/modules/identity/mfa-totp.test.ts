import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import * as OTPAuth from "otpauth";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    codeSecoursMfa: { updateMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { creerTotp, lireSecretMfa, protegerSecretMfa, verifierSecondFacteur } from "@/modules/identity/mfa-totp";

const p = prisma as unknown as {
  user: { findUnique: Mock; update: Mock };
  codeSecoursMfa: { updateMany: Mock };
};

const SECRET = new OTPAuth.Secret({ size: 20 }).base32;

function codeCourant(secret = SECRET): string {
  return creerTotp("a@b.bj", secret).generate();
}

function utilisateur(surcharges: Record<string, unknown> = {}) {
  return {
    id: "u-1",
    email: "a@b.bj",
    mfaActif: true,
    mfaSecret: protegerSecretMfa("u-1", SECRET),
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  p.user.update.mockResolvedValue({});
  p.codeSecoursMfa.updateMany.mockResolvedValue({ count: 0 });
});

describe("secret TOTP chiffre au repos (RG-AUTH-51)", () => {
  it("le secret stocke n'est pas le secret en clair et se relit pour le bon compte seulement", () => {
    const stocke = protegerSecretMfa("u-1", SECRET);

    expect(stocke).not.toContain(SECRET);
    expect(lireSecretMfa("u-1", stocke)).toEqual({ secretBase32: SECRET, aMigrer: false });
    expect(() => lireSecretMfa("u-2", stocke)).toThrow();
  });

  it("un secret historique en clair est lisible et signale qu'il doit etre chiffre", () => {
    expect(lireSecretMfa("u-1", SECRET)).toEqual({ secretBase32: SECRET, aMigrer: true });
  });
});

describe("verifierSecondFacteur", () => {
  it("accepte le code TOTP courant", async () => {
    p.user.findUnique.mockResolvedValue(utilisateur());

    expect(await verifierSecondFacteur("u-1", codeCourant())).toBe("totp");
    expect(p.user.update).not.toHaveBeenCalled();
  });

  it("chiffre a la volee un secret historique en clair apres une verification reussie", async () => {
    p.user.findUnique.mockResolvedValue(utilisateur({ mfaSecret: SECRET }));

    expect(await verifierSecondFacteur("u-1", codeCourant())).toBe("totp");

    const ecrit = p.user.update.mock.calls[0][0].data.mfaSecret as string;
    expect(ecrit).not.toContain(SECRET);
    expect(lireSecretMfa("u-1", ecrit).secretBase32).toBe(SECRET);
  });

  it("refuse un mauvais code TOTP, sans chiffrer ni consommer de code de secours", async () => {
    p.user.findUnique.mockResolvedValue(utilisateur({ mfaSecret: SECRET }));
    const courant = codeCourant();
    const faux = courant === "000000" ? "000001" : "000000";

    expect(await verifierSecondFacteur("u-1", faux)).toBeNull();
    expect(p.user.update).not.toHaveBeenCalled();
    expect(p.codeSecoursMfa.updateMany).not.toHaveBeenCalled();
  });

  it("accepte un code de secours valide, une seule fois", async () => {
    p.user.findUnique.mockResolvedValue(utilisateur());
    p.codeSecoursMfa.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    expect(await verifierSecondFacteur("u-1", "ABCDE-FGHJK")).toBe("secours");
    expect(await verifierSecondFacteur("u-1", "ABCDE-FGHJK")).toBeNull();
  });

  it("refuse tout code si la double authentification n'est pas active", async () => {
    p.user.findUnique.mockResolvedValue(utilisateur({ mfaActif: false }));

    expect(await verifierSecondFacteur("u-1", codeCourant())).toBeNull();
    expect(await verifierSecondFacteur("u-1", "ABCDE-FGHJK")).toBeNull();
    expect(p.codeSecoursMfa.updateMany).not.toHaveBeenCalled();
  });

  it("refuse un secret copie depuis un autre compte (contexte de chiffrement different)", async () => {
    p.user.findUnique.mockResolvedValue(utilisateur({ mfaSecret: protegerSecretMfa("autre-compte", SECRET) }));

    expect(await verifierSecondFacteur("u-1", codeCourant())).toBeNull();
  });

  it("refuse une saisie qui n'est ni un code a 6 chiffres ni un code de secours", async () => {
    p.user.findUnique.mockResolvedValue(utilisateur());

    expect(await verifierSecondFacteur("u-1", "abc")).toBeNull();
    expect(await verifierSecondFacteur("u-1", "")).toBeNull();
    expect(p.codeSecoursMfa.updateMany).not.toHaveBeenCalled();
  });
});
