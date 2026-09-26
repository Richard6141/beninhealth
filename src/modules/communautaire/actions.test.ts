import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    personneCommunautaire: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    suiviCommunautaire: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import {
  creerSuiviCommunautaireAction,
  enregistrerPersonneAction,
  getMesSuivisCommunautaires,
  getPersonnesEnregistrees,
} from "@/modules/communautaire/actions";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  personneCommunautaire: { findUnique: Mock; findMany: Mock; create: Mock };
  suiviCommunautaire: { findMany: Mock; create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const etatSuivi = { error: null, success: false };
const etatPersonne = { error: null, success: false };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-agent", roles: ["agent_communautaire"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "agent-1", etablissementId: "etab-1" });
  p.suiviCommunautaire.findMany.mockResolvedValue([]);
  p.suiviCommunautaire.create.mockResolvedValue({ id: "suivi-1" });
  p.personneCommunautaire.findMany.mockResolvedValue([]);
  p.personneCommunautaire.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "pers-1",
    chefMenage: null,
    dateNaissanceApproximative: false,
    ...data,
  }));
});

describe("creerSuiviCommunautaireAction : visite de terrain (F-COM)", () => {
  it("enregistre une visite pour un nom en texte libre et la journalise", async () => {
    const resultat = await creerSuiviCommunautaireAction(
      etatSuivi,
      formulaire({ beneficiaireNom: "Adjovi Kouassi", typeVisite: "depistage", localisation: "Village A", notes: "RAS" })
    );

    expect(resultat.success).toBe(true);
    expect(resultat.avertissementDoublonBeneficiaire).toBeNull();
    expect(p.suiviCommunautaire.create.mock.calls[0][0].data).toMatchObject({
      agentId: "agent-1",
      etablissementId: "etab-1",
      personneId: null,
      beneficiaireNom: "Adjovi Kouassi",
      typeVisite: "depistage",
    });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
  });

  it("refuse un role sans droit et une session absente", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-medecin", roles: ["medecin"] });
    expect((await creerSuiviCommunautaireAction(etatSuivi, formulaire({ beneficiaireNom: "X", typeVisite: "autre" }))).success).toBe(false);

    getSessionMock.mockResolvedValue(null);
    expect((await creerSuiviCommunautaireAction(etatSuivi, formulaire({ beneficiaireNom: "X", typeVisite: "autre" }))).error).toContain("Session");
    expect(p.suiviCommunautaire.create).not.toHaveBeenCalled();
  });

  it("exige un beneficiaire (nom ou personne) et un type de visite valide", async () => {
    expect((await creerSuiviCommunautaireAction(etatSuivi, formulaire({ typeVisite: "autre" }))).error).toContain("beneficiaire");
    expect((await creerSuiviCommunautaireAction(etatSuivi, formulaire({ beneficiaireNom: "X", typeVisite: "inconnu" }))).success).toBe(false);
    expect(p.suiviCommunautaire.create).not.toHaveBeenCalled();
  });

  it("avec une personne enregistree, le nom vient de la fiche et jamais du formulaire", async () => {
    p.personneCommunautaire.findUnique.mockResolvedValue({ id: "pers-1", etablissementId: "etab-1", prenom: "Koffi", nom: "Mensah" });

    const resultat = await creerSuiviCommunautaireAction(
      etatSuivi,
      formulaire({ personneId: "pers-1", beneficiaireNom: "Nom falsifie", typeVisite: "vaccination" })
    );

    expect(resultat.success).toBe(true);
    const donnees = p.suiviCommunautaire.create.mock.calls[0][0].data;
    expect(donnees.personneId).toBe("pers-1");
    expect(donnees.beneficiaireNom).toBe("Koffi Mensah");
  });

  it("refuse une personne d'un autre etablissement ou inexistante (jamais confiance dans l'id transmis)", async () => {
    p.personneCommunautaire.findUnique.mockResolvedValueOnce({ id: "pers-9", etablissementId: "autre-etab", prenom: "A", nom: "B" });
    expect((await creerSuiviCommunautaireAction(etatSuivi, formulaire({ personneId: "pers-9", typeVisite: "autre" }))).error).toBe("Personne introuvable.");

    p.personneCommunautaire.findUnique.mockResolvedValueOnce(null);
    expect((await creerSuiviCommunautaireAction(etatSuivi, formulaire({ personneId: "absente", typeVisite: "autre" }))).success).toBe(false);
    expect(p.suiviCommunautaire.create).not.toHaveBeenCalled();
  });

  it("avertit d'un nom deja visite par le meme agent (sans accents ni casse) mais enregistre quand meme", async () => {
    p.suiviCommunautaire.findMany.mockResolvedValue([{ beneficiaireNom: "ADJOVI kouassi" }, { beneficiaireNom: "Autre" }]);

    const resultat = await creerSuiviCommunautaireAction(etatSuivi, formulaire({ beneficiaireNom: "Adjovi Kouassi", typeVisite: "autre" }));

    expect(resultat.success).toBe(true);
    expect(resultat.avertissementDoublonBeneficiaire).toContain("Adjovi Kouassi");
    expect(p.suiviCommunautaire.create).toHaveBeenCalled();
  });

  it("le rapprochement de nom ignore les accents", async () => {
    p.suiviCommunautaire.findMany.mockResolvedValue([{ beneficiaireNom: "Élodie Hounkpè" }]);

    const resultat = await creerSuiviCommunautaireAction(etatSuivi, formulaire({ beneficiaireNom: "elodie hounkpe", typeVisite: "autre" }));

    expect(resultat.avertissementDoublonBeneficiaire).toBeTruthy();
  });
});

describe("enregistrerPersonneAction : registre de personnes (F-COM-02)", () => {
  const personneValide = {
    nom: "Mensah",
    prenom: "Koffi",
    sexe: "M",
    dateNaissance: "1990-05-05",
    villageQuartier: "Quartier Nord",
  };

  it("enregistre une personne dans l'etablissement et pour l'agent de la session", async () => {
    const resultat = await enregistrerPersonneAction(etatPersonne, formulaire(personneValide));

    expect(resultat.success).toBe(true);
    expect(resultat.personneCreee).toMatchObject({ nomComplet: "Koffi Mensah", villageQuartier: "Quartier Nord" });
    expect(p.personneCommunautaire.create.mock.calls[0][0].data).toMatchObject({ etablissementId: "etab-1", agentId: "agent-1", chefMenage: null });
    expect(journaliserMock.mock.calls[0][0].justification).toContain("aucun doublon");
  });

  it("refuse un role sans droit", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-patient", roles: ["patient"] });

    expect((await enregistrerPersonneAction(etatPersonne, formulaire(personneValide))).success).toBe(false);
    expect(p.personneCommunautaire.create).not.toHaveBeenCalled();
  });

  it("refuse une date de naissance future ou illisible, et un sexe hors M/F", async () => {
    expect((await enregistrerPersonneAction(etatPersonne, formulaire({ ...personneValide, dateNaissance: "2999-01-01" }))).error).toContain("naissance");
    expect((await enregistrerPersonneAction(etatPersonne, formulaire({ ...personneValide, dateNaissance: "pas-une-date" }))).error).toContain("naissance");
    expect((await enregistrerPersonneAction(etatPersonne, formulaire({ ...personneValide, sexe: "X" }))).success).toBe(false);
    expect(p.personneCommunautaire.create).not.toHaveBeenCalled();
  });

  it("exige nom, prenom et village ou quartier", async () => {
    for (const champ of ["nom", "prenom", "villageQuartier"]) {
      expect((await enregistrerPersonneAction(etatPersonne, formulaire({ ...personneValide, [champ]: "  " }))).success).toBe(false);
    }
    expect(p.personneCommunautaire.create).not.toHaveBeenCalled();
  });

  it("un doublon (meme nom, prenom, naissance, sans accents ni casse) bloque et ne renvoie que des informations minimales", async () => {
    p.personneCommunautaire.findMany.mockResolvedValue([
      { nom: "MENSAH", prenom: "koffi", sexe: "M", dateNaissance: new Date("1990-05-05"), villageQuartier: "Quartier Sud", telephone: "secret" },
    ]);

    const resultat = await enregistrerPersonneAction(etatPersonne, formulaire(personneValide));

    expect(resultat.success).toBe(false);
    expect(resultat.candidatDoublon).toEqual({ initiales: "KM", anneeNaissance: 1990, sexe: "M", villageQuartier: "Quartier Sud" });
    expect(JSON.stringify(resultat)).not.toContain("secret");
    expect(p.personneCommunautaire.create).not.toHaveBeenCalled();
  });

  it("le controle de doublon est limite a l'etablissement de l'agent", async () => {
    await enregistrerPersonneAction(etatPersonne, formulaire(personneValide));

    expect(p.personneCommunautaire.findMany.mock.calls[0][0].where).toMatchObject({ etablissementId: "etab-1" });
  });

  it("forcer malgre un doublon exige une justification d'au moins 10 caracteres, tracee au journal", async () => {
    p.personneCommunautaire.findMany.mockResolvedValue([
      { nom: "Mensah", prenom: "Koffi", sexe: "M", dateNaissance: new Date("1990-05-05"), villageQuartier: "Quartier Sud" },
    ]);

    const trop = await enregistrerPersonneAction(etatPersonne, formulaire({ ...personneValide, confirmerMalgreDoublon: "on", justificationDoublon: "court" }));
    expect(trop.success).toBe(false);
    expect(trop.error).toContain("justification");

    const ok = await enregistrerPersonneAction(
      etatPersonne,
      formulaire({ ...personneValide, confirmerMalgreDoublon: "on", justificationDoublon: "Homonyme d'un autre village" })
    );
    expect(ok.success).toBe(true);
    expect(journaliserMock.mock.calls[0][0].justification).toContain("Homonyme d'un autre village");
  });
});

describe("lectures limitees a l'agent et a son etablissement", () => {
  it("getPersonnesEnregistrees ne lit que l'etablissement de l'agent connecte", async () => {
    p.personneCommunautaire.findMany.mockResolvedValue([
      { id: "p1", prenom: "Koffi", nom: "Mensah", dateNaissance: new Date("1990-05-05"), dateNaissanceApproximative: false, sexe: "M", villageQuartier: "Nord", chefMenage: null },
    ]);

    const personnes = await getPersonnesEnregistrees();

    expect(p.personneCommunautaire.findMany.mock.calls[0][0].where).toEqual({ etablissementId: "etab-1" });
    expect(personnes).toEqual([expect.objectContaining({ id: "p1", nomComplet: "Koffi Mensah" })]);
  });

  it("getMesSuivisCommunautaires ne lit que les visites de l'agent connecte", async () => {
    await getMesSuivisCommunautaires();

    expect(p.suiviCommunautaire.findMany.mock.calls[0][0].where).toEqual({ agentId: "agent-1" });
  });

  it("sans session, aucune lecture et une liste vide", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getPersonnesEnregistrees()).toEqual([]);
    expect(await getMesSuivisCommunautaires()).toEqual([]);
    expect(p.personneCommunautaire.findMany).not.toHaveBeenCalled();
    expect(p.suiviCommunautaire.findMany).not.toHaveBeenCalled();
  });
});
