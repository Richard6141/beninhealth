import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    patient: { findUnique: vi.fn(), update: vi.fn() },
    informationDeclaree: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[])
  );
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import {
  ajouterContactUrgenceAction,
  ajouterInformationDeclareeAction,
  getMesInformationsDeclarees,
  retirerInformationDeclareeAction,
} from "./informations-declarees";

const p = prisma as unknown as {
  patient: { findUnique: Mock; update: Mock };
  informationDeclaree: {
    count: Mock;
    createMany: Mock;
    findMany: Mock;
    create: Mock;
    findUnique: Mock;
    update: Mock;
  };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const etatInitial = { error: null, success: false };

function patient(surcharge: Record<string, unknown> = {}) {
  return {
    id: "pat-1",
    userId: "user-1",
    allergies: "[]",
    antecedents: "[]",
    maladiesChroniques: "[]",
    contactsUrgence: "[]",
    ...surcharge,
  };
}

function ligne(surcharge: Record<string, unknown> = {}) {
  return {
    id: "info-1",
    patientId: "pat-1",
    categorie: "allergie",
    valeur: "Penicilline",
    statut: "declare",
    confirmeParId: null,
    dateConfirmation: null,
    dateRetrait: null,
    motifRetrait: null,
    dateCreation: new Date("2026-09-01T08:00:00Z"),
    ...surcharge,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-1", roles: ["patient"] });
  p.patient.findUnique.mockResolvedValue(patient());
  p.informationDeclaree.count.mockResolvedValue(0);
  p.informationDeclaree.findMany.mockResolvedValue([]);
  p.informationDeclaree.create.mockResolvedValue(ligne());
  p.patient.update.mockResolvedValue({});
});

describe("getMesInformationsDeclarees (F-CIT-04)", () => {
  it("renvoie des listes vides sans session ou sans dossier patient", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getMesInformationsDeclarees()).toEqual({
      allergie: [],
      antecedent: [],
      maladie_chronique: [],
      contact_urgence: [],
    });
    expect(p.informationDeclaree.findMany).not.toHaveBeenCalled();
  });

  it("regroupe par categorie, les plus recentes d'abord", async () => {
    p.informationDeclaree.findMany.mockResolvedValue([
      ligne({ id: "a", categorie: "allergie", valeur: "Penicilline" }),
      ligne({ id: "b", categorie: "antecedent", valeur: "Appendicite" }),
    ]);

    const resultat = await getMesInformationsDeclarees();

    expect(resultat.allergie.map((i) => i.id)).toEqual(["a"]);
    expect(resultat.antecedent.map((i) => i.id)).toEqual(["b"]);
    expect(resultat.maladie_chronique).toEqual([]);
  });

  it("compose le libelle d'un contact d'urgence a partir du JSON stocke", async () => {
    p.informationDeclaree.findMany.mockResolvedValue([
      ligne({
        id: "c1",
        categorie: "contact_urgence",
        valeur: JSON.stringify({ nom: "Awa Toure", telephone: "+229 90 00 00 01", lienParente: "Soeur" }),
      }),
    ]);

    const resultat = await getMesInformationsDeclarees();

    expect(resultat.contact_urgence[0].libelle).toBe("Awa Toure (Soeur) : +229 90 00 00 01");
    expect(resultat.contact_urgence[0].contact).toEqual({
      nom: "Awa Toure",
      telephone: "+229 90 00 00 01",
      lienParente: "Soeur",
    });
  });

  describe("semis paresseux (donnees saisies avant ce module)", () => {
    it("copie une seule fois les valeurs deja presentes dans les champs plats", async () => {
      p.patient.findUnique.mockResolvedValue(
        patient({ allergies: JSON.stringify(["Penicilline", "Iode"]), antecedents: JSON.stringify(["Appendicite"]) })
      );
      p.informationDeclaree.count.mockImplementation(async ({ where }: { where: { categorie: string } }) =>
        where.categorie === "allergie" ? 0 : 0
      );

      await getMesInformationsDeclarees();

      const appelsCreateMany = p.informationDeclaree.createMany.mock.calls;
      const appelAllergie = appelsCreateMany.find((appel) => appel[0].data[0]?.categorie === "allergie");
      expect(appelAllergie?.[0].data).toEqual([
        { patientId: "pat-1", categorie: "allergie", valeur: "Penicilline", statut: "declare" },
        { patientId: "pat-1", categorie: "allergie", valeur: "Iode", statut: "declare" },
      ]);
    });

    it("ne seme jamais une categorie qui a deja au moins une ligne", async () => {
      p.patient.findUnique.mockResolvedValue(patient({ allergies: JSON.stringify(["Penicilline"]) }));
      p.informationDeclaree.count.mockResolvedValue(1);

      await getMesInformationsDeclarees();

      expect(p.informationDeclaree.createMany).not.toHaveBeenCalled();
    });
  });
});

describe("ajouterInformationDeclareeAction (F-CIT-04)", () => {
  function formulaire(surcharges: Record<string, string> = {}) {
    const donnees = new FormData();
    donnees.set("categorie", "allergie");
    donnees.set("valeur", "Penicilline");
    for (const [cle, valeur] of Object.entries(surcharges)) donnees.set(cle, valeur);
    return donnees;
  }

  it("cree une ligne declaree, resynchronise le champ plat et journalise", async () => {
    const resultat = await ajouterInformationDeclareeAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.informationDeclaree.create).toHaveBeenCalledWith({
      data: { patientId: "pat-1", categorie: "allergie", valeur: "Penicilline", statut: "declare" },
    });
    expect(journaliserMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ajout_information_declaree" }),
      expect.anything()
    );
  });

  it("resynchronise le champ plat a partir des lignes actives (declare et confirme), jamais retirees", async () => {
    // Simule ce que renvoie reellement la requete (where: statut IN [declare, confirme]) :
    // un mock ne filtre pas lui-meme, la ligne retiree n'apparait donc jamais dans ce tableau.
    p.informationDeclaree.findMany.mockResolvedValue([
      ligne({ id: "a", valeur: "Penicilline", statut: "declare" }),
      ligne({ id: "b", valeur: "Iode", statut: "confirme" }),
    ]);

    await ajouterInformationDeclareeAction(etatInitial, formulaire());

    expect(p.patient.update).toHaveBeenCalledWith({
      where: { id: "pat-1" },
      data: { allergies: JSON.stringify(["Penicilline", "Iode"]) },
    });
  });

  it("refuse sans session, une valeur vide ou une categorie invalide", async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await ajouterInformationDeclareeAction(etatInitial, formulaire())).success).toBe(false);
    expect(p.informationDeclaree.create).not.toHaveBeenCalled();

    getSessionMock.mockResolvedValue({ userId: "user-1", roles: ["patient"] });
    expect((await ajouterInformationDeclareeAction(etatInitial, formulaire({ valeur: "" }))).success).toBe(false);
    expect((await ajouterInformationDeclareeAction(etatInitial, formulaire({ categorie: "contact_urgence" }))).success).toBe(
      false
    );
    expect(p.informationDeclaree.create).not.toHaveBeenCalled();
  });

  it("refuse une valeur de plus de 200 caracteres", async () => {
    const resultat = await ajouterInformationDeclareeAction(etatInitial, formulaire({ valeur: "x".repeat(201) }));

    expect(resultat.success).toBe(false);
    expect(p.informationDeclaree.create).not.toHaveBeenCalled();
  });
});

describe("ajouterContactUrgenceAction (F-CIT-04)", () => {
  function formulaire(surcharges: Record<string, string> = {}) {
    const donnees = new FormData();
    donnees.set("nom", "Awa Toure");
    donnees.set("telephone", "+229 90 00 00 01");
    donnees.set("lienParente", "Soeur");
    for (const [cle, valeur] of Object.entries(surcharges)) donnees.set(cle, valeur);
    return donnees;
  }

  it("cree un contact declare a partir des trois champs", async () => {
    const resultat = await ajouterContactUrgenceAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.informationDeclaree.create).toHaveBeenCalledWith({
      data: {
        patientId: "pat-1",
        categorie: "contact_urgence",
        valeur: JSON.stringify({ nom: "Awa Toure", telephone: "+229 90 00 00 01", lienParente: "Soeur" }),
        statut: "declare",
      },
    });
  });

  it("permet desormais plusieurs contacts (contrairement a l'ancien champ unique)", async () => {
    // Simule l'etat relu APRES la creation (meme transaction) : le contact existant et le nouveau.
    p.informationDeclaree.findMany.mockResolvedValue([
      ligne({
        id: "c1",
        categorie: "contact_urgence",
        valeur: JSON.stringify({ nom: "Existant", telephone: "1", lienParente: "" }),
        statut: "declare",
      }),
      ligne({
        id: "c2",
        categorie: "contact_urgence",
        valeur: JSON.stringify({ nom: "Awa Toure", telephone: "+229 90 00 00 01", lienParente: "Soeur" }),
        statut: "declare",
      }),
    ]);

    await ajouterContactUrgenceAction(etatInitial, formulaire());

    const appel = p.patient.update.mock.calls[0][0];
    const contacts = JSON.parse(appel.data.contactsUrgence);
    expect(contacts).toHaveLength(2);
  });

  it("refuse un nom ou un telephone absent", async () => {
    expect((await ajouterContactUrgenceAction(etatInitial, formulaire({ nom: "" }))).success).toBe(false);
    expect((await ajouterContactUrgenceAction(etatInitial, formulaire({ telephone: "" }))).success).toBe(false);
    expect(p.informationDeclaree.create).not.toHaveBeenCalled();
  });
});

describe("retirerInformationDeclareeAction : RG-CIT-31 (retrait sans suppression)", () => {
  function formulaire(surcharges: Record<string, string> = {}) {
    const donnees = new FormData();
    donnees.set("id", "info-1");
    for (const [cle, valeur] of Object.entries(surcharges)) donnees.set(cle, valeur);
    return donnees;
  }

  it("marque retire avec date et motif, jamais une suppression", async () => {
    p.informationDeclaree.findUnique.mockResolvedValue(ligne({ statut: "declare" }));

    const resultat = await retirerInformationDeclareeAction(etatInitial, formulaire({ motif: "Erreur de saisie" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.informationDeclaree.update).toHaveBeenCalledWith({
      where: { id: "info-1" },
      data: expect.objectContaining({ statut: "retire", motifRetrait: "Erreur de saisie" }),
    });
    expect(p.informationDeclaree.update.mock.calls[0][0].data.dateRetrait).toBeInstanceOf(Date);
  });

  it("accepte un retrait sans motif (motif reste null)", async () => {
    p.informationDeclaree.findUnique.mockResolvedValue(ligne({ statut: "declare" }));

    await retirerInformationDeclareeAction(etatInitial, formulaire());

    expect(p.informationDeclaree.update.mock.calls[0][0].data.motifRetrait).toBeNull();
  });

  it("resynchronise le champ plat apres retrait", async () => {
    p.informationDeclaree.findUnique.mockResolvedValue(ligne({ statut: "declare", categorie: "antecedent" }));
    p.informationDeclaree.findMany.mockResolvedValue([]);

    await retirerInformationDeclareeAction(etatInitial, formulaire());

    expect(p.patient.update).toHaveBeenCalledWith({ where: { id: "pat-1" }, data: { antecedents: "[]" } });
  });

  it("refuse une information introuvable ou n'appartenant pas au patient connecte", async () => {
    p.informationDeclaree.findUnique.mockResolvedValue(null);
    expect((await retirerInformationDeclareeAction(etatInitial, formulaire())).success).toBe(false);

    p.informationDeclaree.findUnique.mockResolvedValue(ligne({ patientId: "pat-autre" }));
    const resultat = await retirerInformationDeclareeAction(etatInitial, formulaire());
    expect(resultat.success).toBe(false);
    expect(p.informationDeclaree.update).not.toHaveBeenCalled();
  });

  it("refuse un element deja retire", async () => {
    p.informationDeclaree.findUnique.mockResolvedValue(ligne({ statut: "retire" }));

    const resultat = await retirerInformationDeclareeAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.informationDeclaree.update).not.toHaveBeenCalled();
  });

  describe("RG-CIT-30 / CA-1 : une information confirmee ne peut pas etre retiree", () => {
    it("refuse le retrait d'une ligne confirmee, avec un message orientant vers Signaler une erreur", async () => {
      p.informationDeclaree.findUnique.mockResolvedValue(ligne({ statut: "confirme", confirmeParId: "medecin-1" }));

      const resultat = await retirerInformationDeclareeAction(etatInitial, formulaire());

      expect(resultat.success).toBe(false);
      expect(resultat.error).toContain("confirmee");
      expect(resultat.error).toContain("Signaler une erreur");
      expect(p.informationDeclaree.update).not.toHaveBeenCalled();
      expect(p.patient.update).not.toHaveBeenCalled();
    });
  });
});
