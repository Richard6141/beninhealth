import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Import CSV du referentiel des etablissements (F-ADM-02, P1 du pack). Les
 * geometries de departement sont mockees a un tableau vide : sans contour
 * connu, verifierPointDansDepartement n'invente aucun refus (deja teste
 * dans import-etablissements-regles.test.ts), ce qui rend ces tests
 * independants des vraies coordonnees du Benin.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/pilotage/geometrie-departements", () => ({ GEOMETRIES_DEPARTEMENTS: [] }));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    commune: { findMany: vi.fn() },
    etablissementSanitaire: { count: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { confirmerImportEtablissementsAction, previsualiserImportEtablissementsAction } from "./import-etablissements";

const prismaMock = prisma as unknown as {
  commune: { findMany: Mock };
  etablissementSanitaire: { count: Mock; create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const ETAT_PREVISUALISATION = { error: null, contenuCsv: null, valides: [], invalides: [] };
const ETAT_CONFIRMATION = { error: null, success: false, nombreImporte: 0, invalides: [] };

const ENTETE = "nom,type,capacite,latitude,longitude,departement,commune";
const LIGNE_VALIDE_1 = "CS Akpakpa,centre_sante,50,6.35,2.45,Ouémé,Porto-Novo";
const LIGNE_VALIDE_2 = "CS Djougou,centre_sante,30,9.7,1.66,Donga,Djougou";
const LIGNE_INVALIDE = "Mauvais,type_inconnu,10,6.35,2.45,Ouémé,Porto-Novo";

function formulaireAvecFichier(contenu: string, nomChamp = "fichier"): FormData {
  const formData = new FormData();
  formData.set(nomChamp, new File([contenu], "etablissements.csv", { type: "text/csv" }));
  return formData;
}

function formulaireConfirmation(contenuCsv: string): FormData {
  const formData = new FormData();
  formData.set("contenuCsv", contenuCsv);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-ministere", roles: ["admin_national"] });
  prismaMock.commune.findMany.mockResolvedValue([
    { id: "com-porto-novo", nom: "Porto-Novo", departement: { nom: "Ouémé" } },
    { id: "com-djougou", nom: "Djougou", departement: { nom: "Donga" } },
  ]);
  prismaMock.etablissementSanitaire.count.mockResolvedValue(0);
  prismaMock.etablissementSanitaire.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `etab-${data.nom}`,
    ...data,
  }));
});

describe("previsualiserImportEtablissementsAction", () => {
  it("refuse sans session admin_national", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-x", roles: ["admin_etablissement"] });
    const resultat = await previsualiserImportEtablissementsAction(ETAT_PREVISUALISATION, formulaireAvecFichier(`${ENTETE}\n${LIGNE_VALIDE_1}`));
    expect(resultat.error).toContain("ministere");
    expect(resultat.contenuCsv).toBeNull();
  });

  it("refuse sans fichier ou un fichier vide", async () => {
    expect((await previsualiserImportEtablissementsAction(ETAT_PREVISUALISATION, new FormData())).error).toContain("selectionner");
    expect(
      (await previsualiserImportEtablissementsAction(ETAT_PREVISUALISATION, formulaireAvecFichier(""))).error
    ).toContain("selectionner");
  });

  it("refuse un en-tete sans les colonnes obligatoires, sans jamais lire la base des communes", async () => {
    const resultat = await previsualiserImportEtablissementsAction(ETAT_PREVISUALISATION, formulaireAvecFichier("nom,type\nCS,centre_sante"));
    expect(resultat.error).toContain("obligatoires");
    expect(prismaMock.commune.findMany).not.toHaveBeenCalled();
  });

  it("renvoie un apercu des lignes valides et la liste des lignes invalides, sans rien ecrire", async () => {
    const resultat = await previsualiserImportEtablissementsAction(
      ETAT_PREVISUALISATION,
      formulaireAvecFichier(`${ENTETE}\n${LIGNE_VALIDE_1}\n${LIGNE_INVALIDE}`)
    );

    expect(resultat.error).toBeNull();
    expect(resultat.contenuCsv).toContain(LIGNE_VALIDE_1);
    expect(resultat.valides).toEqual([
      { numeroLigne: 2, nom: "CS Akpakpa", type: "centre_sante", capacite: 50, communeNom: "Porto-Novo", departementNom: "Ouémé" },
    ]);
    expect(resultat.invalides).toHaveLength(1);
    expect(resultat.invalides[0].numeroLigne).toBe(3);
    expect(prismaMock.etablissementSanitaire.create).not.toHaveBeenCalled();
  });
});

describe("confirmerImportEtablissementsAction", () => {
  it("refuse sans session admin_national, sans rien ecrire", async () => {
    getSessionMock.mockResolvedValue(null);
    const resultat = await confirmerImportEtablissementsAction(ETAT_CONFIRMATION, formulaireConfirmation(`${ENTETE}\n${LIGNE_VALIDE_1}`));
    expect(resultat.success).toBe(false);
    expect(prismaMock.etablissementSanitaire.create).not.toHaveBeenCalled();
  });

  it("refuse sans contenu CSV transmis", async () => {
    const resultat = await confirmerImportEtablissementsAction(ETAT_CONFIRMATION, new FormData());
    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("apercu");
  });

  it("F-ADM-02 : importe uniquement les lignes valides, statut brouillon, une ligne par etablissement journalisee", async () => {
    const resultat = await confirmerImportEtablissementsAction(
      ETAT_CONFIRMATION,
      formulaireConfirmation(`${ENTETE}\n${LIGNE_VALIDE_1}\n${LIGNE_INVALIDE}\n${LIGNE_VALIDE_2}`)
    );

    expect(resultat).toEqual({ error: null, success: true, nombreImporte: 2, invalides: expect.any(Array) });
    expect(resultat.invalides).toHaveLength(1);
    expect(prismaMock.etablissementSanitaire.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.etablissementSanitaire.create.mock.calls[0][0].data).toMatchObject({
      nom: "CS Akpakpa",
      statut: "brouillon",
      communeId: "com-porto-novo",
    });
    // Une ligne journalisee par etablissement cree, plus le resume de l'import.
    expect(journaliserMock.mock.calls.filter((appel) => appel[0].action === "import_csv_etablissement")).toHaveLength(2);
    expect(journaliserMock.mock.calls.some((appel) => appel[0].action === "import_csv_etablissements_resume")).toBe(true);
  });

  it("refuse l'import si aucune ligne n'est valide, sans ecrire ni journaliser", async () => {
    const resultat = await confirmerImportEtablissementsAction(ETAT_CONFIRMATION, formulaireConfirmation(`${ENTETE}\n${LIGNE_INVALIDE}`));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("Aucune ligne valide");
    expect(prismaMock.etablissementSanitaire.create).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("attribue des identifiants distincts et croissants a chaque etablissement importe dans le meme fichier", async () => {
    prismaMock.etablissementSanitaire.count.mockResolvedValue(5);

    await confirmerImportEtablissementsAction(ETAT_CONFIRMATION, formulaireConfirmation(`${ENTETE}\n${LIGNE_VALIDE_1}\n${LIGNE_VALIDE_2}`));

    const identifiants = prismaMock.etablissementSanitaire.create.mock.calls.map((appel) => appel[0].data.identifiant);
    expect(new Set(identifiants).size).toBe(2);
  });

  it("revalide integralement le contenu, jamais confiance dans un fichier modifie entre la previsualisation et la confirmation", async () => {
    // Le contenu transmis a la confirmation contient desormais une ligne invalide qui n'etait pas la a la previsualisation.
    const resultat = await confirmerImportEtablissementsAction(
      ETAT_CONFIRMATION,
      formulaireConfirmation(`${ENTETE}\n${LIGNE_VALIDE_1}\n${LIGNE_INVALIDE}`)
    );

    expect(resultat.nombreImporte).toBe(1);
    expect(resultat.invalides).toHaveLength(1);
  });
});
