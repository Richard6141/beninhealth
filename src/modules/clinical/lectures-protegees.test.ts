import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    professionnelSante: { findUnique: vi.fn() },
    consultation: { findMany: vi.fn(), findUnique: vi.fn() },
    prescription: { findUnique: vi.fn() },
    examenMedical: { findUnique: vi.fn() },
    suiviCommunautaire: { findUnique: vi.fn() },
    consentement: { findUnique: vi.fn() },
    referencePatient: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import {
  getConsultationsDeLEtablissement,
  journaliserOuvertureDetailHistoriqueAction,
} from "@/modules/clinical/actions";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  consultation: { findMany: Mock; findUnique: Mock };
  prescription: { findUnique: Mock };
  examenMedical: { findUnique: Mock };
  suiviCommunautaire: { findUnique: Mock };
  consentement: { findUnique: Mock };
  referencePatient: { findFirst: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

function consultation(surcharges: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    patientId: "pat-1",
    date: new Date("2026-09-26T10:00:00Z"),
    motif: "Fievre",
    symptomes: "[]",
    temperatureCelsius: 38.5,
    pouls: 90,
    tensionSystolique: 120,
    tensionDiastolique: 80,
    frequenceRespiratoire: 18,
    saturationOxygene: 98,
    poidsKg: 60,
    tailleCm: 165,
    glycemieGL: null,
    observations: "NOTE RESERVEE AU MEDECIN",
    conclusion: "Paludisme",
    statut: "terminee",
    saisieParErreur: false,
    motifRetrait: null,
    professionnel: { user: { prenom: "Awa", nom: "Sossou" } },
    patient: { identifiantSante: "BJ-SANTE-PAT-0001", user: { prenom: "Koffi", nom: "Adjovi" } },
    addenda: [],
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "inf-1", roles: ["infirmier"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-1", userId: "inf-1", etablissementId: "etab-1" });
  p.consultation.findMany.mockResolvedValue([consultation()]);
  p.consentement.findUnique.mockResolvedValue(null);
  p.referencePatient.findFirst.mockResolvedValue(null);
});

describe("getConsultationsDeLEtablissement", () => {
  it("ne renvoie jamais les notes reservees du medecin", async () => {
    const liste = await getConsultationsDeLEtablissement();
    expect(liste).toHaveLength(1);
    expect(liste[0].observations).toBe("");
    expect(JSON.stringify(liste)).not.toContain("NOTE RESERVEE");
  });

  it("laisse une trace d'audit de cette lecture sans consentement individuel", async () => {
    await getConsultationsDeLEtablissement();
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "inf-1",
      action: "consultation_liste_etablissement",
      donneeConcernee: "etablissement:etab-1",
    });
  });

  it.each([["admin_etablissement"], ["patient"], ["pharmacien"], ["laboratoire"], ["agent_communautaire"], ["admin_national"]])(
    "refuse le role %s sans interroger les consultations",
    async (role) => {
      getSessionMock.mockResolvedValue({ userId: "u", roles: [role] });
      expect(await getConsultationsDeLEtablissement()).toEqual([]);
      expect(p.consultation.findMany).not.toHaveBeenCalled();
    }
  );

  it("filtre sur l'etablissement du soignant et exclut les brouillons", async () => {
    await getConsultationsDeLEtablissement();
    expect(p.consultation.findMany.mock.calls[0][0].where).toMatchObject({
      professionnel: { etablissementId: "etab-1" },
      statut: { not: "brouillon" },
    });
  });

  it("sans session, ne renvoie rien", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getConsultationsDeLEtablissement()).toEqual([]);
  });
});

describe("journaliserOuvertureDetailHistoriqueAction : plus de fausses traces", () => {
  const consentementActif = { statut: "actif", typeAcces: "consultations", dateFin: null };

  it("trace l'ouverture d'un element auquel l'appelant a acces", async () => {
    p.consultation.findUnique.mockResolvedValue({ patientId: "pat-1" });
    p.consentement.findUnique.mockResolvedValue(consentementActif);

    await journaliserOuvertureDetailHistoriqueAction("consultation", "c-1");

    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "inf-1",
      action: "consultation_historique_detail",
      donneeConcernee: "consultation:c-1",
    });
  });

  it("ne trace rien pour un element d'un patient sans base d'acces (fausse ligne dans le dossier d'un tiers)", async () => {
    p.consultation.findUnique.mockResolvedValue({ patientId: "pat-tiers" });
    p.consentement.findUnique.mockResolvedValue(null);

    await journaliserOuvertureDetailHistoriqueAction("consultation", "c-9");
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("ne trace rien pour un identifiant inexistant, un type inconnu ou un identifiant demesure", async () => {
    p.consultation.findUnique.mockResolvedValue(null);
    await journaliserOuvertureDetailHistoriqueAction("consultation", "n-existe-pas");
    await journaliserOuvertureDetailHistoriqueAction("autre" as never, "x");
    await journaliserOuvertureDetailHistoriqueAction("consultation", "x".repeat(500));
    await journaliserOuvertureDetailHistoriqueAction("consultation", "");
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("ne trace rien sans session ni sans profil professionnel", async () => {
    getSessionMock.mockResolvedValue(null);
    await journaliserOuvertureDetailHistoriqueAction("consultation", "c-1");
    getSessionMock.mockResolvedValue({ userId: "u", roles: ["patient"] });
    p.professionnelSante.findUnique.mockResolvedValue(null);
    await journaliserOuvertureDetailHistoriqueAction("consultation", "c-1");
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("resout aussi les ordonnances, examens et visites communautaires", async () => {
    p.consentement.findUnique.mockResolvedValue(consentementActif);
    p.prescription.findUnique.mockResolvedValue({ patientId: "pat-1" });
    p.examenMedical.findUnique.mockResolvedValue({ patientId: "pat-1" });
    p.suiviCommunautaire.findUnique.mockResolvedValue({ patientId: "pat-1" });

    await journaliserOuvertureDetailHistoriqueAction("prescription", "rx-1");
    await journaliserOuvertureDetailHistoriqueAction("examen", "ex-1");
    await journaliserOuvertureDetailHistoriqueAction("suivi_communautaire", "sv-1");

    expect(journaliserMock.mock.calls.map((appel) => appel[0].donneeConcernee)).toEqual([
      "prescription:rx-1",
      "examen_medical:ex-1",
      "suivi_communautaire:sv-1",
    ]);
  });
});
