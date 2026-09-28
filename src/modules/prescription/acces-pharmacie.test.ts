import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    prescription: { findUnique: vi.fn(), findMany: vi.fn() },
    delivrance: { findMany: vi.fn() },
    medicament: { findMany: vi.fn() },
    journalAudit: { count: vi.fn() },
  };
  return { prisma };
});
vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test" })) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("bcryptjs", () => {
  const compare = vi.fn();
  return { default: { compare }, compare };
});
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import {
  getDetailPrescriptionPourDelivrance,
  getTableauDeBordPharmacie,
  rechercherOrdonnancePresenteeAction,
} from "@/modules/prescription/actions";
import { creerJetonPresentation, jetonPresentationValide } from "@/modules/prescription/presentation";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  prescription: { findUnique: Mock; findMany: Mock };
  delivrance: { findMany: Mock };
  medicament: { findMany: Mock };
  journalAudit: { count: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const MAINTENANT = new Date("2026-09-26T12:00:00.000Z");
const ilYaJours = (jours: number) => new Date(MAINTENANT.getTime() - jours * 24 * 60 * 60 * 1000);
const etatInitial = { error: null, success: false };

function ordonnanceEnBase(surcharge: Record<string, unknown> = {}) {
  return {
    id: "presc-1",
    numero: "RX-2026-0001",
    statut: "validee",
    date: ilYaJours(10),
    instructions: "Apres les repas",
    patient: {
      dateNaissance: new Date("1990-05-01"),
      sexe: "F",
      allergies: JSON.stringify(["Penicilline"]),
      identifiantSante: "BJ-SANTE-PAT-0001",
      user: { nom: "Agossou", prenom: "Beatrice" },
    },
    medecinPrescripteur: { user: { nom: "Ahouansou", prenom: "Julien" } },
    consultation: { etablissement: { nom: "Centre de Sante Akpakpa" } },
    lignes: [
      {
        id: "l1",
        medicamentId: "med-1",
        posologie: "1 comprime par jour",
        quantite: 10,
        dureeTraitementJours: 10,
        nonSubstituable: false,
        medicament: { nom: "Amoxicilline", principeActif: "amoxicilline", dosage: "500 mg", forme: "gelule" },
      },
    ],
    delivrances: [],
    ...surcharge,
  };
}

function delivranceEnBase(etablissementId: string) {
  return {
    id: "deliv-1",
    date: ilYaJours(1),
    annulee: false,
    motifAnnulation: null,
    dateAnnulation: null,
    etablissementId,
    pharmacien: { user: { nom: "Dossou", prenom: "Pascal" } },
    lignes: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);

  getSessionMock.mockResolvedValue({ userId: "user-ph", roles: ["pharmacien"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-ph", etablissementId: "etab-ph" });
  p.medicament.findMany.mockResolvedValue([]);
  p.journalAudit.count.mockResolvedValue(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rechercherOrdonnancePresenteeAction (F-PHA-02, RG-PHA-01)", () => {
  function recherche(numero: string, annee: string): FormData {
    const donnees = new FormData();
    donnees.set("numero", numero);
    donnees.set("anneeNaissance", annee);
    return donnees;
  }

  it("renvoie un jeton de presentation lie a ce pharmacien et a cette ordonnance", async () => {
    p.prescription.findUnique.mockResolvedValue(ordonnanceEnBase());

    const resultat = await rechercherOrdonnancePresenteeAction(etatInitial, recherche("RX-2026-0001", "1990"));

    expect(resultat.success).toBe(true);
    expect(resultat.prescriptionId).toBe("presc-1");
    expect(jetonPresentationValide(resultat.jeton, "user-ph", "presc-1")).toBe(true);
    expect(jetonPresentationValide(resultat.jeton, "user-autre", "presc-1")).toBe(false);
  });

  it("ne renvoie aucun jeton avec une mauvaise annee de naissance (meme message qu'un numero inconnu)", async () => {
    p.prescription.findUnique.mockResolvedValue(ordonnanceEnBase());

    const resultat = await rechercherOrdonnancePresenteeAction(etatInitial, recherche("RX-2026-0001", "1985"));

    expect(resultat.success).toBe(false);
    expect(resultat.jeton).toBeUndefined();
    expect(resultat.error).toContain("introuvable");
  });
});

describe("getDetailPrescriptionPourDelivrance (RG-PHA-02, F-PHA-02)", () => {
  it("refuse une ordonnance qui n'a pas ete presentee et sur laquelle la pharmacie n'a rien delivre", async () => {
    p.prescription.findUnique.mockResolvedValue(ordonnanceEnBase());

    expect(await getDetailPrescriptionPourDelivrance("presc-1")).toBeNull();
    expect(await getDetailPrescriptionPourDelivrance("presc-1", "jeton.invalide")).toBeNull();
  });

  it("refuse le jeton d'un autre pharmacien ou d'une autre ordonnance", async () => {
    p.prescription.findUnique.mockResolvedValue(ordonnanceEnBase());

    expect(await getDetailPrescriptionPourDelivrance("presc-1", creerJetonPresentation("user-autre", "presc-1"))).toBeNull();
    expect(await getDetailPrescriptionPourDelivrance("presc-1", creerJetonPresentation("user-ph", "presc-2"))).toBeNull();
  });

  it("refuse un jeton expire", async () => {
    p.prescription.findUnique.mockResolvedValue(ordonnanceEnBase());
    const jeton = creerJetonPresentation("user-ph", "presc-1", new Date(MAINTENANT.getTime() - 13 * 60 * 60 * 1000));

    expect(await getDetailPrescriptionPourDelivrance("presc-1", jeton)).toBeNull();
  });

  it("refuse un compte qui n'est pas pharmacien, jeton valide ou non", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
    p.prescription.findUnique.mockResolvedValue(ordonnanceEnBase());

    expect(await getDetailPrescriptionPourDelivrance("presc-1", creerJetonPresentation("user-med", "presc-1"))).toBeNull();
    expect(p.prescription.findUnique).not.toHaveBeenCalled();
  });

  it("ouvre l'ordonnance avec un jeton valide et n'expose que ce dont le comptoir a besoin", async () => {
    p.prescription.findUnique.mockResolvedValue(ordonnanceEnBase());

    const detail = await getDetailPrescriptionPourDelivrance("presc-1", creerJetonPresentation("user-ph", "presc-1"));

    expect(detail).not.toBeNull();
    expect(detail).toMatchObject({
      numero: "RX-2026-0001",
      patientNomComplet: "Beatrice Agossou",
      patientAgeAnnees: 36,
      patientSexe: "F",
      patientAllergies: ["Penicilline"],
      prescripteurNomComplet: "Dr. Julien Ahouansou",
      prescripteurEtablissementNom: "Centre de Sante Akpakpa",
      expiree: false,
    });
    expect(detail?.dateFinValiditeISO).toBe(new Date(ilYaJours(10).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString());
    // Ni identifiant de sante, ni motif de consultation.
    expect(detail).not.toHaveProperty("patientIdentifiantSante");
    expect(detail).not.toHaveProperty("consultationMotif");
    expect(JSON.stringify(detail)).not.toContain("BJ-SANTE-PAT-0001");
  });

  it("ne charge de la consultation que le nom de l'etablissement (jamais le motif ni le diagnostic)", async () => {
    p.prescription.findUnique.mockResolvedValue(ordonnanceEnBase());

    await getDetailPrescriptionPourDelivrance("presc-1", creerJetonPresentation("user-ph", "presc-1"));

    const requete = p.prescription.findUnique.mock.calls[0][0] as { include: { consultation: unknown } };
    expect(requete.include.consultation).toEqual({ select: { etablissement: { select: { nom: true } } } });
  });

  it("signale une ordonnance expiree", async () => {
    p.prescription.findUnique.mockResolvedValue(ordonnanceEnBase({ date: ilYaJours(91) }));

    const detail = await getDetailPrescriptionPourDelivrance("presc-1", creerJetonPresentation("user-ph", "presc-1"));

    expect(detail?.expiree).toBe(true);
  });

  it("rouvre sans jeton une ordonnance sur laquelle cette pharmacie a deja delivre", async () => {
    p.prescription.findUnique.mockResolvedValue(
      ordonnanceEnBase({ statut: "delivree_partiellement", delivrances: [delivranceEnBase("etab-ph")] })
    );

    expect(await getDetailPrescriptionPourDelivrance("presc-1")).not.toBeNull();
  });

  it("ne rouvre pas sans jeton une ordonnance servie par une AUTRE pharmacie", async () => {
    p.prescription.findUnique.mockResolvedValue(
      ordonnanceEnBase({ statut: "delivree_partiellement", delivrances: [delivranceEnBase("etab-autre")] })
    );

    expect(await getDetailPrescriptionPourDelivrance("presc-1")).toBeNull();
  });

  it("RG-AUD-01 : journalise l'ouverture du detail par jeton, sans reveler de donnee sensible dans la justification", async () => {
    p.prescription.findUnique.mockResolvedValue(ordonnanceEnBase());

    await getDetailPrescriptionPourDelivrance("presc-1", creerJetonPresentation("user-ph", "presc-1"));

    expect(journaliserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        utilisateurId: "user-ph",
        action: "ordonnance_presentee_consultee",
        donneeConcernee: "prescription:presc-1",
      })
    );
    const justification = journaliserMock.mock.calls[0][0].justification as string;
    expect(justification).not.toContain("Penicilline");
    expect(justification).not.toContain("BJ-SANTE-PAT-0001");
  });

  it("RG-AUD-01 : journalise aussi l'ouverture sans jeton (deja delivre par cet etablissement)", async () => {
    p.prescription.findUnique.mockResolvedValue(
      ordonnanceEnBase({ statut: "delivree_partiellement", delivrances: [delivranceEnBase("etab-ph")] })
    );

    await getDetailPrescriptionPourDelivrance("presc-1");

    expect(journaliserMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ordonnance_presentee_consultee", donneeConcernee: "prescription:presc-1" })
    );
  });

  it("ne journalise rien quand l'acces est refuse (aucun jeton valide, jamais delivre ici)", async () => {
    p.prescription.findUnique.mockResolvedValue(ordonnanceEnBase());

    await getDetailPrescriptionPourDelivrance("presc-1", "jeton.invalide");

    expect(journaliserMock).not.toHaveBeenCalled();
  });
});

describe("getTableauDeBordPharmacie (F-PHA-01)", () => {
  beforeEach(() => {
    p.prescription.findMany.mockResolvedValue([]);
    p.delivrance.findMany.mockResolvedValue([]);
  });

  it("refuse un compte qui n'est pas pharmacien", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });

    expect(await getTableauDeBordPharmacie()).toBeNull();
    expect(p.prescription.findMany).not.toHaveBeenCalled();
  });

  it("borne les deux requetes a l'etablissement de la fiche professionnelle et aux ordonnances valables", async () => {
    await getTableauDeBordPharmacie();

    const partielles = p.prescription.findMany.mock.calls[0][0] as {
      where: { statut: string; date: { gte: Date }; delivrances: { some: { etablissementId: string } } };
      select: Record<string, unknown>;
    };
    expect(partielles.where.statut).toBe("delivree_partiellement");
    expect(partielles.where.delivrances.some.etablissementId).toBe("etab-ph");
    expect(partielles.where.date.gte.toISOString()).toBe(ilYaJours(90).toISOString());
    // Aucune consultation ni instruction n'est chargee.
    expect(partielles.select).not.toHaveProperty("consultation");
    expect(partielles.select).not.toHaveProperty("instructions");

    const duJour = p.delivrance.findMany.mock.calls[0][0] as { where: { etablissementId: string; date: { gte: Date; lt: Date } } };
    expect(duJour.where.etablissementId).toBe("etab-ph");
    expect(duJour.where.date.gte.toISOString()).toBe("2026-09-25T23:00:00.000Z");
    expect(duJour.where.date.lt.toISOString()).toBe("2026-09-26T23:00:00.000Z");
  });

  it("calcule les lignes qui restent a delivrer, toutes pharmacies confondues", async () => {
    p.prescription.findMany.mockResolvedValue([
      {
        id: "presc-1",
        numero: "RX-2026-0001",
        date: ilYaJours(10),
        patient: { user: { nom: "Agossou", prenom: "Beatrice" } },
        lignes: [
          { quantite: 10, medicament: { nom: "Amoxicilline" }, lignesDelivrees: [{ quantiteDelivree: 4 }, { quantiteDelivree: 2 }] },
          { quantite: 5, medicament: { nom: "Paracetamol" }, lignesDelivrees: [{ quantiteDelivree: 5 }] },
        ],
        delivrances: [{ date: ilYaJours(2) }],
      },
    ]);

    const tableau = await getTableauDeBordPharmacie();

    expect(tableau?.partielles).toHaveLength(1);
    expect(tableau?.partielles[0]).toMatchObject({
      numero: "RX-2026-0001",
      patientNomComplet: "Beatrice Agossou",
      lignesManquantes: [{ medicamentNom: "Amoxicilline", quantiteRestante: 4 }],
      derniereDelivranceISO: ilYaJours(2).toISOString(),
    });
  });

  it("liste les delivrances du jour avec l'heure, le numero, le nombre de lignes et le statut", async () => {
    p.delivrance.findMany.mockResolvedValue([
      {
        id: "deliv-1",
        date: new Date("2026-09-26T09:15:00.000Z"),
        annulee: false,
        prescription: { numero: "RX-2026-0004", statut: "delivree" },
        _count: { lignes: 3 },
      },
    ]);

    const tableau = await getTableauDeBordPharmacie();

    expect(tableau?.delivrancesDuJour).toEqual([
      {
        id: "deliv-1",
        heureISO: "2026-09-26T09:15:00.000Z",
        numeroOrdonnance: "RX-2026-0004",
        nombreLignes: 3,
        statutOrdonnance: "delivree",
        annulee: false,
      },
    ]);
  });
});
