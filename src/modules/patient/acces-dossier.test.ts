import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const modele = () => ({ findMany: vi.fn() });
  return {
    prisma: {
      patient: { findUnique: vi.fn() },
      consultation: modele(),
      prescription: modele(),
      examenMedical: modele(),
      suiviCommunautaire: modele(),
      documentMedical: modele(),
      vaccination: modele(),
      priseEnChargeInfirmiere: modele(),
      referencePatient: modele(),
      delivrance: modele(),
      journalAudit: modele(),
    },
  };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getMesAccesDossier } from "@/modules/patient/actions";
import { clesAuditDuPatient } from "@/modules/patient/cles-audit-patient";

const p = prisma as unknown as Record<string, { findMany: Mock; findUnique?: Mock }>;
const getSessionMock = getSession as unknown as Mock;

const MODELES_DU_PATIENT = [
  "consultation",
  "prescription",
  "examenMedical",
  "suiviCommunautaire",
  "documentMedical",
  "vaccination",
  "priseEnChargeInfirmiere",
  "referencePatient",
];

beforeEach(() => {
  vi.clearAllMocks();
  for (const modele of [...MODELES_DU_PATIENT, "delivrance", "journalAudit"]) {
    p[modele].findMany.mockResolvedValue([]);
  }
  p.patient.findUnique!.mockResolvedValue({ id: "pat-1", userId: "user-pat" });
  getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
});

describe("clesAuditDuPatient (RG-CIT-100 : aucun acces invisible pour le patient)", () => {
  it("resout les neuf familles de cles du journal, pas seulement consultations et prescriptions", async () => {
    p.consultation.findMany.mockResolvedValue([{ id: "c1" }]);
    p.prescription.findMany.mockResolvedValue([{ id: "p1" }]);
    p.examenMedical.findMany.mockResolvedValue([{ id: "e1" }]);
    p.suiviCommunautaire.findMany.mockResolvedValue([{ id: "s1" }]);
    p.documentMedical.findMany.mockResolvedValue([{ id: "d1" }]);
    p.vaccination.findMany.mockResolvedValue([{ id: "v1" }]);
    p.priseEnChargeInfirmiere.findMany.mockResolvedValue([{ id: "i1" }]);
    p.referencePatient.findMany.mockResolvedValue([{ id: "r1" }]);
    p.delivrance.findMany.mockResolvedValue([{ id: "l1" }]);

    const cles = await clesAuditDuPatient("pat-1");

    expect(cles).toEqual([
      "patient:pat-1",
      "consultation:c1",
      "prescription:p1",
      "examen_medical:e1",
      "suivi_communautaire:s1",
      "document_medical:d1",
      "vaccination:v1",
      "prise_en_charge_infirmiere:i1",
      "reference_patient:r1",
      "delivrance:l1",
    ]);
  });

  it("ne cherche les objets que du patient demande, et les delivrances par l'ordonnance du patient", async () => {
    await clesAuditDuPatient("pat-1");

    for (const modele of MODELES_DU_PATIENT) {
      expect(p[modele].findMany).toHaveBeenCalledWith({ where: { patientId: "pat-1" }, select: { id: true } });
    }
    expect(p.delivrance.findMany).toHaveBeenCalledWith({
      where: { prescription: { patientId: "pat-1" } },
      select: { id: true },
    });
  });
});

describe("getMesAccesDossier", () => {
  it("interroge le journal avec toutes ces cles et exclut les actions du patient lui-meme", async () => {
    p.documentMedical.findMany.mockResolvedValue([{ id: "d1" }]);

    await getMesAccesDossier();

    const appel = p.journalAudit.findMany.mock.calls[0][0];
    expect(appel.where.donneeConcernee.in).toContain("document_medical:d1");
    expect(appel.where.donneeConcernee.in).toContain("patient:pat-1");
    expect(appel.where.utilisateurId).toEqual({ not: "user-pat" });
  });

  it("restitue l'ouverture d'un document par un medecin avec sa cible et son action", async () => {
    p.documentMedical.findMany.mockResolvedValue([{ id: "d1" }]);
    p.journalAudit.findMany.mockResolvedValue([
      {
        id: "j1",
        date: new Date("2026-09-20T10:00:00Z"),
        action: "consultation_document_medical",
        donneeConcernee: "document_medical:d1",
        justification: "",
        utilisateur: {
          nom: "Adjovi",
          prenom: "Koffi",
          roles: [{ nom: "medecin" }],
          professionnel: { etablissement: { nom: "CHU Cotonou" } },
        },
      },
    ]);

    const acces = await getMesAccesDossier();

    expect(acces).toHaveLength(1);
    expect(acces[0]).toMatchObject({
      cible: "document_medical",
      action: "consultation_document_medical",
      acteurNomComplet: "Dr. Koffi Adjovi",
      etablissementNom: "CHU Cotonou",
    });
  });

  it("renvoie une liste vide sans session, sans interroger le journal", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getMesAccesDossier()).toEqual([]);
    expect(p.journalAudit.findMany).not.toHaveBeenCalled();
  });
});
