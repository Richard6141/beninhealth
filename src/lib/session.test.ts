import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { SignJWT } from "jose";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

const magasinCookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => magasinCookies),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sessionActive: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const p = prisma as unknown as {
  sessionActive: { findUnique: Mock; update: Mock };
  user: { findUnique: Mock };
};

async function jeton(charge: Record<string, unknown>): Promise<string> {
  return new SignJWT(charge)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.NEXTAUTH_SECRET));
}

function sessionEnBase(statut: string, surcharges: Record<string, unknown> = {}) {
  return {
    id: "sess-1",
    userId: "u-1",
    derniereActivite: new Date(),
    user: { statut },
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  p.sessionActive.update.mockResolvedValue({});
});

describe("getSession : le JWT ne suffit jamais, l'etat du compte compte", () => {
  it("accepte une session valide d'un compte actif", async () => {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" }) });
    p.sessionActive.findUnique.mockResolvedValue(sessionEnBase("actif"));

    expect(await getSession()).toEqual({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" });
  });

  it.each(["suspendu", "termine", "ferme", "fusionne", "sans_compte"])(
    "refuse immediatement une session dont le compte est %s, meme avec un JWT valide",
    async (statut) => {
      magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" }) });
      p.sessionActive.findUnique.mockResolvedValue(sessionEnBase(statut));

      expect(await getSession()).toBeNull();
    }
  );

  it("refuse une session fermee (ligne supprimee)", async () => {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" }) });
    p.sessionActive.findUnique.mockResolvedValue(null);
    expect(await getSession()).toBeNull();
  });

  it("refuse une session dont la ligne appartient a un autre utilisateur que celui du JWT", async () => {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["admin_national"], sessionId: "sess-1" }) });
    p.sessionActive.findUnique.mockResolvedValue(sessionEnBase("actif", { userId: "autre" }));
    expect(await getSession()).toBeNull();
  });

  it("un ancien JWT sans sessionId est aussi soumis a l'etat du compte", async () => {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["patient"] }) });

    p.user.findUnique.mockResolvedValue({ statut: "actif" });
    expect(await getSession()).toEqual({ userId: "u-1", roles: ["patient"], sessionId: "" });

    p.user.findUnique.mockResolvedValue({ statut: "suspendu" });
    expect(await getSession()).toBeNull();

    p.user.findUnique.mockResolvedValue(null);
    expect(await getSession()).toBeNull();
  });

  it("refuse un cookie absent, un JWT mal signe, ou sans role valide", async () => {
    magasinCookies.get.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();

    magasinCookies.get.mockReturnValue({ value: "pas-un-jwt" });
    expect(await getSession()).toBeNull();

    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["pirate"], sessionId: "sess-1" }) });
    expect(await getSession()).toBeNull();
  });

  it("met a jour la derniere activite au plus toutes les 5 minutes", async () => {
    magasinCookies.get.mockReturnValue({ value: await jeton({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" }) });

    p.sessionActive.findUnique.mockResolvedValue(sessionEnBase("actif"));
    await getSession();
    expect(p.sessionActive.update).not.toHaveBeenCalled();

    p.sessionActive.findUnique.mockResolvedValue(sessionEnBase("actif", { derniereActivite: new Date(Date.now() - 10 * 60 * 1000) }));
    await getSession();
    expect(p.sessionActive.update).toHaveBeenCalledTimes(1);
  });
});
