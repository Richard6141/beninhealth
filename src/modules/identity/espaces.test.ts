import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/** Choix de l'espace actif (F-AUTH-07). Prisma est simule. */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const prisma = {
    userRole: { findMany: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    affiliationProfessionnelle: { findMany: vi.fn() },
    sessionActive: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (rappel: (tx: unknown) => unknown) => rappel(prisma));
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { changerEspaceAction, getMesEspaces } from "./espaces";

const prismaMock = prisma as unknown as {
  userRole: { findMany: Mock };
  professionnelSante: { findUnique: Mock };
  affiliationProfessionnelle: { findMany: Mock };
  sessionActive: { updateMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const ETAT = { error: null, success: false };
const formulaire = (espace: string) => {
  const donnees = new FormData();
  donnees.set("espace", espace);
  return donnees;
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "u-1", roles: ["patient", "medecin"], sessionId: "sess-1" });
  prismaMock.userRole.findMany.mockResolvedValue([{ nom: "medecin" }, { nom: "patient" }]);
  prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", statutValidation: "valide", etablissement: { nom: "CS Akpakpa" } });
  prismaMock.affiliationProfessionnelle.findMany.mockResolvedValue([{ statut: "active" }]);
  prismaMock.sessionActive.updateMany.mockResolvedValue({ count: 1 });
});

describe("getMesEspaces", () => {
  it("renvoie [] sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getMesEspaces()).toEqual([]);
  });

  it("liste les espaces du compte lus en base, dans un ordre stable, avec l'etablissement pour l'espace professionnel et l'espace actif marque", async () => {
    const espaces = await getMesEspaces();

    expect(espaces.map((e) => e.role)).toEqual(["patient", "medecin"]);
    expect(espaces[0]).toMatchObject({ libelle: "Mon espace santé (personnel)", etablissementNom: null, accueil: "/app/patient", actif: true });
    expect(espaces[1]).toMatchObject({ libelle: "Médecin", etablissementNom: "CS Akpakpa", accueil: "/app/medecin", actif: false });
  });

  it("apres un choix, l'espace actif est le seul role de la session", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" });

    const espaces = await getMesEspaces();

    expect(espaces.find((e) => e.actif)?.role).toBe("medecin");
    expect(espaces).toHaveLength(2);
  });

  it("ne lit pas le profil professionnel pour un compte purement patient", async () => {
    prismaMock.userRole.findMany.mockResolvedValue([{ nom: "patient" }]);
    getSessionMock.mockResolvedValue({ userId: "u-1", roles: ["patient"], sessionId: "sess-1" });

    await getMesEspaces();

    expect(prismaMock.professionnelSante.findUnique).not.toHaveBeenCalled();
  });
});

describe("changerEspaceAction", () => {
  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await changerEspaceAction(ETAT, formulaire("medecin"))).success).toBe(false);
  });

  it("refuse un espace qui n'est pas un role du compte (CA-2 : une valeur forgee est sans effet)", async () => {
    for (const espace of ["admin_national", "pirate", ""]) {
      const resultat = await changerEspaceAction(ETAT, formulaire(espace));
      expect(resultat.success).toBe(false);
    }
    expect(prismaMock.sessionActive.updateMany).not.toHaveBeenCalled();
  });

  it("refuse une session sans identifiant (ancien jeton) : rien ne peut etre enregistre cote serveur", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-1", roles: ["patient", "medecin"], sessionId: "" });
    const resultat = await changerEspaceAction(ETAT, formulaire("medecin"));
    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("reconnectez");
  });

  it("enregistre l'espace dans LA session du compte (pas dans une autre), journalise et renvoie l'accueil", async () => {
    const resultat = await changerEspaceAction(ETAT, formulaire("medecin"));

    expect(resultat).toEqual({ error: null, success: true, redirection: "/app/medecin" });
    expect(prismaMock.sessionActive.updateMany).toHaveBeenCalledWith({
      where: { id: "sess-1", userId: "u-1" },
      data: { espaceActif: "medecin" },
    });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "u-1",
      action: "changement_espace",
      justification: "Espace actif : Mon espace santé (personnel) vers Médecin",
    });
  });

  it("choisir l'espace deja actif ne change rien et ne journalise pas", async () => {
    const resultat = await changerEspaceAction(ETAT, formulaire("patient"));

    expect(resultat).toEqual({ error: null, success: true, redirection: "/app/patient" });
    expect(prismaMock.sessionActive.updateMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse un espace professionnel dont le profil est refuse ou absent", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", statutValidation: "rejete" });
    expect((await changerEspaceAction(ETAT, formulaire("medecin"))).error).toContain("pas validé");

    prismaMock.professionnelSante.findUnique.mockResolvedValue(null);
    expect((await changerEspaceAction(ETAT, formulaire("medecin"))).success).toBe(false);

    expect(prismaMock.sessionActive.updateMany).not.toHaveBeenCalled();
  });

  it("refuse un espace dont toutes les affiliations sont suspendues ou terminees, accepte un compte sans ligne d'affiliation (ancien compte)", async () => {
    prismaMock.affiliationProfessionnelle.findMany.mockResolvedValue([{ statut: "suspendue" }, { statut: "terminee" }]);
    expect((await changerEspaceAction(ETAT, formulaire("medecin"))).error).toContain("affiliation");

    prismaMock.affiliationProfessionnelle.findMany.mockResolvedValue([]);
    expect((await changerEspaceAction(ETAT, formulaire("medecin"))).success).toBe(true);
  });

  it("refuse quand la session a disparu entre-temps (aucune ligne modifiee) sans journaliser", async () => {
    prismaMock.sessionActive.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await changerEspaceAction(ETAT, formulaire("medecin"));

    expect(resultat.success).toBe(false);
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("passer a l'espace personnel n'exige aucun profil professionnel", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-1", roles: ["medecin"], sessionId: "sess-1" });

    const resultat = await changerEspaceAction(ETAT, formulaire("patient"));

    expect(resultat.success).toBe(true);
    expect(prismaMock.professionnelSante.findUnique).not.toHaveBeenCalled();
  });
});
