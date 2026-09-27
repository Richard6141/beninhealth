import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/** Garde d'espace (F-AUTH-07, RG-AUTH-60) : barriere de navigation lue dans la session serveur. */

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((cible: string) => {
    throw new Error(`REDIRECT:${cible}`);
  }),
}));

import { getSession } from "@/lib/session";
import { ROLES_ESPACE_ETABLISSEMENT, ROLES_ESPACE_PROFESSIONNEL, garderEspace } from "./garde-espace";

const getSessionMock = getSession as unknown as Mock;

async function cible(roles: string[] | null, autorises: readonly string[]): Promise<string | null> {
  getSessionMock.mockResolvedValue(roles === null ? null : { userId: "u-1", roles, sessionId: "s-1" });
  try {
    await garderEspace(autorises as never);
    return null;
  } catch (erreur) {
    return (erreur as Error).message.replace("REDIRECT:", "");
  }
}

beforeEach(() => vi.clearAllMocks());

describe("garderEspace", () => {
  it("renvoie vers la connexion sans session", async () => {
    expect(await cible(null, ["patient"])).toBe("/connexion");
  });

  it("laisse passer un role de l'espace", async () => {
    expect(await cible(["patient"], ["patient"])).toBeNull();
    expect(await cible(["medecin"], ROLES_ESPACE_PROFESSIONNEL)).toBeNull();
    expect(await cible(["admin_national"], ["admin_national"])).toBeNull();
  });

  it("renvoie un compte qui a choisi l'espace personnel vers son accueil quand il ouvre une page du medecin", async () => {
    expect(await cible(["patient"], ROLES_ESPACE_PROFESSIONNEL)).toBe("/app/patient");
  });

  it("renvoie un medecin qui a choisi son espace professionnel vers cet espace quand il ouvre une page patient", async () => {
    expect(await cible(["medecin"], ["patient"])).toBe("/app/medecin");
  });

  it("chaque role est renvoye vers son propre accueil hors de son espace", async () => {
    expect(await cible(["admin_etablissement"], ["admin_national"])).toBe("/app/etablissement");
    expect(await cible(["admin_national"], ROLES_ESPACE_PROFESSIONNEL)).toBe("/app/ministere");
    expect(await cible(["pharmacien"], ["patient"])).toBe("/app/medecin");
  });

  it("un compte qui n'a pas encore choisi (tous ses roles) traverse les deux espaces", async () => {
    expect(await cible(["patient", "medecin"], ["patient"])).toBeNull();
    expect(await cible(["patient", "medecin"], ROLES_ESPACE_PROFESSIONNEL)).toBeNull();
  });

  it("l'espace etablissement admet l'administrateur d'etablissement et l'infirmier (file du jour), pas le medecin", async () => {
    expect(await cible(["admin_etablissement"], ROLES_ESPACE_ETABLISSEMENT)).toBeNull();
    expect(await cible(["infirmier"], ROLES_ESPACE_ETABLISSEMENT)).toBeNull();
    expect(await cible(["medecin"], ROLES_ESPACE_ETABLISSEMENT)).toBe("/app/medecin");
  });
});
