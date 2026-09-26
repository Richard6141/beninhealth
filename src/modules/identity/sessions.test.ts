import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Tests de src/modules/identity/sessions.ts (F-AUTH-09). Prisma et session
 * mockes, meme approche que src/modules/audit/integrite.test.ts.
 */

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sessionActive: { findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { deconnecterAutresAppareilsAction, fermerSessionAction, listerMesSessions } from "./sessions";

const prismaMock = prisma as unknown as {
  sessionActive: { findMany: Mock; findUnique: Mock; delete: Mock; deleteMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;

function creerFormData(champs: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

describe("listerMesSessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renvoie null si personne n'est connecte", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await listerMesSessions()).toBeNull();
  });

  it("marque estCourante uniquement pour la session correspondant au sessionId du JWT", async () => {
    getSessionMock.mockResolvedValue({ userId: "u1", roles: ["patient"], sessionId: "s-actuelle" });
    prismaMock.sessionActive.findMany.mockResolvedValue([
      { id: "s-actuelle", appareil: "Mobile", navigateur: "Chrome", adresseIp: "1.2.3.4", dateCreation: new Date(), derniereActivite: new Date() },
      { id: "s-autre", appareil: "Ordinateur", navigateur: "Firefox", adresseIp: "5.6.7.8", dateCreation: new Date(), derniereActivite: new Date() },
    ]);

    const resultat = await listerMesSessions();

    expect(resultat).toHaveLength(2);
    expect(resultat!.find((s) => s.id === "s-actuelle")!.estCourante).toBe(true);
    expect(resultat!.find((s) => s.id === "s-autre")!.estCourante).toBe(false);
  });
});

describe("fermerSessionAction (Zero Trust)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuse de fermer une session appartenant a un autre utilisateur", async () => {
    getSessionMock.mockResolvedValue({ userId: "u1", roles: ["patient"], sessionId: "s-moi" });
    prismaMock.sessionActive.findUnique.mockResolvedValue({ id: "s-victime", userId: "u2-AUTRE", appareil: "Mobile", navigateur: "Chrome" });

    const resultat = await fermerSessionAction(
      { error: null, success: false },
      creerFormData({ sessionId: "s-victime" })
    );

    expect(resultat.success).toBe(false);
    expect(prismaMock.sessionActive.delete).not.toHaveBeenCalled();
  });

  it("ferme une session appartenant bien a l'utilisateur connecte", async () => {
    getSessionMock.mockResolvedValue({ userId: "u1", roles: ["patient"], sessionId: "s-moi" });
    prismaMock.sessionActive.findUnique.mockResolvedValue({ id: "s-autre-appareil", userId: "u1", appareil: "Ordinateur", navigateur: "Firefox" });

    const resultat = await fermerSessionAction(
      { error: null, success: false },
      creerFormData({ sessionId: "s-autre-appareil" })
    );

    expect(resultat.success).toBe(true);
    expect(prismaMock.sessionActive.delete).toHaveBeenCalledWith({ where: { id: "s-autre-appareil" } });
  });
});

describe("deconnecterAutresAppareilsAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exclut la session courante de la suppression", async () => {
    getSessionMock.mockResolvedValue({ userId: "u1", roles: ["patient"], sessionId: "s-moi" });
    prismaMock.sessionActive.deleteMany.mockResolvedValue({ count: 3 });

    const resultat = await deconnecterAutresAppareilsAction({ error: null, success: false }, creerFormData({}));

    expect(resultat.success).toBe(true);
    expect(prismaMock.sessionActive.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", id: { not: "s-moi" } },
    });
  });
});
