import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    patient: { findUnique: vi.fn() },
    consentement: { findUnique: vi.fn() },
    rendezVous: { findUnique: vi.fn() },
    priseEnChargeInfirmiere: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
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
import { enregistrerPriseEnChargeAction, getPriseEnChargeNonRecuperee } from "@/modules/soins/actions";
import { PRIORITES_TRI } from "@/modules/soins/priorites";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  patient: { findUnique: Mock };
  consentement: { findUnique: Mock };
  rendezVous: { findUnique: Mock };
  priseEnChargeInfirmiere: { create: Mock; findFirst: Mock };
};
const getSessionMock = getSession as unknown as Mock;

const etatInitial = { error: null, success: false };

function formulaire(surcharges: Record<string, string> = {}): FormData {
  const champs: Record<string, string> = {
    patientId: "patient-1",
    prioriteTri: "standard",
    temperatureCelsius: "37",
    pouls: "80",
    noteSoins: "Patient calme, constantes normales.",
    ...surcharges,
  };
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function consentement(surcharges: Record<string, unknown> = {}) {
  return { statut: "actif", dateFin: null, typeAcces: "dossier_complet", ...surcharges };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-infirmier", roles: ["infirmier"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "inf-1", etablissementId: "etab-1" });
  p.patient.findUnique.mockResolvedValue({ id: "patient-1", dateNaissance: new Date("1990-05-05T12:00:00Z") });
  p.consentement.findUnique.mockResolvedValue(consentement());
  p.priseEnChargeInfirmiere.create.mockResolvedValue({ id: "pec-1" });
});

describe("PRIORITES_TRI", () => {
  it("propose exactement les trois niveaux de tri du pack", () => {
    expect([...PRIORITES_TRI]).toEqual(["urgent", "prioritaire", "standard"]);
  });
});

describe("enregistrerPriseEnChargeAction : constantes et droits (F-CLI-12)", () => {
  it("enregistre une prise en charge normale et renvoie son identifiant", async () => {
    const resultat = await enregistrerPriseEnChargeAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true, priseEnChargeId: "pec-1" });
    const donnees = p.priseEnChargeInfirmiere.create.mock.calls[0][0].data;
    expect(donnees).toMatchObject({ patientId: "patient-1", infirmierId: "inf-1", etablissementId: "etab-1", prioriteTri: "standard", temperatureCelsius: 37, pouls: 80 });
  });

  it("refuse une constante hors de toute plage acceptable, sans rien enregistrer", async () => {
    const resultat = await enregistrerPriseEnChargeAction(etatInitial, formulaire({ temperatureCelsius: "50" }));

    expect(resultat.success).toBe(false);
    expect(p.priseEnChargeInfirmiere.create).not.toHaveBeenCalled();
  });

  it("une constante inhabituelle exige la confirmation, puis s'enregistre une fois confirmee", async () => {
    const avertissement = await enregistrerPriseEnChargeAction(etatInitial, formulaire({ temperatureCelsius: "39.5" }));
    expect(avertissement.success).toBe(false);
    expect(avertissement.error).toContain("Confirmez");
    expect(p.priseEnChargeInfirmiere.create).not.toHaveBeenCalled();

    const confirme = await enregistrerPriseEnChargeAction(etatInitial, formulaire({ temperatureCelsius: "39.5", confirmerAlerteConstantes: "true" }));
    expect(confirme.success).toBe(true);
  });

  it("exige une note de soins et une priorite valide", async () => {
    expect((await enregistrerPriseEnChargeAction(etatInitial, formulaire({ noteSoins: "  " }))).success).toBe(false);
    expect((await enregistrerPriseEnChargeAction(etatInitial, formulaire({ prioriteTri: "critique" }))).success).toBe(false);
    expect(p.priseEnChargeInfirmiere.create).not.toHaveBeenCalled();
  });

  it("refuse un role sans droit (un medecin ne cree pas de prise en charge infirmiere)", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-medecin", roles: ["medecin"] });

    const resultat = await enregistrerPriseEnChargeAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.priseEnChargeInfirmiere.create).not.toHaveBeenCalled();
  });

  it("regression : refuse un consentement d'urgence ou limite a un autre domaine (ecriture interdite)", async () => {
    for (const typeAcces of ["urgence", "reference", "examens", "documents", "prescriptions"]) {
      p.consentement.findUnique.mockResolvedValue(consentement({ typeAcces }));

      const resultat = await enregistrerPriseEnChargeAction(etatInitial, formulaire());

      expect(resultat.success).toBe(false);
      expect(resultat.error).toContain("consentement");
    }
    expect(p.priseEnChargeInfirmiere.create).not.toHaveBeenCalled();
  });

  it("accepte un consentement limite aux consultations, refuse un consentement expire", async () => {
    p.consentement.findUnique.mockResolvedValueOnce(consentement({ typeAcces: "consultations" }));
    expect((await enregistrerPriseEnChargeAction(etatInitial, formulaire())).success).toBe(true);

    p.consentement.findUnique.mockResolvedValueOnce(consentement({ dateFin: new Date("2020-01-01") }));
    expect((await enregistrerPriseEnChargeAction(etatInitial, formulaire())).success).toBe(false);
  });

  it("refuse un rendez-vous d'un autre etablissement ou d'un autre patient", async () => {
    p.rendezVous.findUnique.mockResolvedValueOnce({ id: "rdv-1", patientId: "patient-1", etablissementId: "autre-etab" });
    expect((await enregistrerPriseEnChargeAction(etatInitial, formulaire({ rendezVousId: "rdv-1" }))).error).toContain("rendez-vous");

    p.rendezVous.findUnique.mockResolvedValueOnce({ id: "rdv-1", patientId: "autre-patient", etablissementId: "etab-1" });
    expect((await enregistrerPriseEnChargeAction(etatInitial, formulaire({ rendezVousId: "rdv-1" }))).success).toBe(false);
    expect(p.priseEnChargeInfirmiere.create).not.toHaveBeenCalled();
  });

  it("accepte un rendez-vous du meme patient dans le meme etablissement", async () => {
    p.rendezVous.findUnique.mockResolvedValue({ id: "rdv-1", patientId: "patient-1", etablissementId: "etab-1" });

    expect((await enregistrerPriseEnChargeAction(etatInitial, formulaire({ rendezVousId: "rdv-1" }))).success).toBe(true);
  });
});

describe("getPriseEnChargeNonRecuperee (F-CLI-12 : pre-remplissage de la consultation)", () => {
  function priseEnCharge(surcharges: Record<string, unknown> = {}) {
    return {
      id: "pec-1",
      patientId: "patient-1",
      prioriteTri: "standard",
      temperatureCelsius: 37,
      pouls: 80,
      tensionSystolique: null,
      tensionDiastolique: null,
      frequenceRespiratoire: null,
      saturationOxygene: null,
      poidsKg: null,
      tailleCm: null,
      glycemieGL: null,
      noteSoins: "RAS",
      statut: "en_attente",
      date: new Date(),
      ...surcharges,
    };
  }

  beforeEach(() => {
    p.priseEnChargeInfirmiere.findFirst.mockResolvedValue(priseEnCharge());
  });

  it("filtre desormais sur l'etablissement et le jour courant du medecin connecte (defaut corrige)", async () => {
    const resultat = await getPriseEnChargeNonRecuperee("patient-1");

    expect(resultat?.id).toBe("pec-1");
    const filtre = p.priseEnChargeInfirmiere.findFirst.mock.calls[0][0].where;
    expect(filtre).toMatchObject({ patientId: "patient-1", statut: "en_attente", etablissementId: "etab-1" });
    expect(filtre.date).toHaveProperty("gte");
    expect(filtre.date).toHaveProperty("lt");
  });

  it("un infirmier d'un autre etablissement ne recupere jamais une prise en charge (le filtre etablissement l'exclut deja de la requete)", async () => {
    p.professionnelSante.findUnique.mockResolvedValue({ id: "inf-2", etablissementId: "autre-etab" });

    await getPriseEnChargeNonRecuperee("patient-1");

    expect(p.priseEnChargeInfirmiere.findFirst.mock.calls[0][0].where.etablissementId).toBe("autre-etab");
  });

  it("sans profil professionnel associe au compte : null, sans lire la prise en charge", async () => {
    p.professionnelSante.findUnique.mockResolvedValue(null);

    expect(await getPriseEnChargeNonRecuperee("patient-1")).toBeNull();
    expect(p.priseEnChargeInfirmiere.findFirst).not.toHaveBeenCalled();
  });

  it("sans consentement actif : null", async () => {
    p.consentement.findUnique.mockResolvedValue(null);

    expect(await getPriseEnChargeNonRecuperee("patient-1")).toBeNull();
    expect(p.priseEnChargeInfirmiere.findFirst).not.toHaveBeenCalled();
  });
});
