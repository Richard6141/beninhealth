import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Lecture du resume et de l'historique d'un patient par un professionnel
 * (F-CLI-04, F-CLI-09, RG-CLI-30, RG-CLI-91, RG-LAB-30). Le point central est
 * accesPatientAutorise : quelle base d'acces, pour quel type de donnee.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    professionnelSante: { findUnique: vi.fn() },
    consentement: { findUnique: vi.fn() },
    referencePatient: { findFirst: vi.fn() },
    patient: { findUnique: vi.fn() },
    prescription: { findMany: vi.fn() },
    consultation: { findMany: vi.fn() },
    examenMedical: { findMany: vi.fn() },
    suiviCommunautaire: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { getHistoriquePatient, getResumePatient } from "./actions";

const prismaMock = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  consentement: { findUnique: Mock };
  referencePatient: { findFirst: Mock };
  patient: { findUnique: Mock };
  prescription: { findMany: Mock };
  consultation: { findMany: Mock };
  examenMedical: { findMany: Mock };
  suiviCommunautaire: { findMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const MAINTENANT = new Date("2026-09-26T10:00:00.000Z");
const dans = (ms: number) => new Date(MAINTENANT.getTime() + ms);
const HEURE = 60 * 60 * 1000;

const PATIENT = {
  id: "pat-1",
  identifiantSante: "BJ-SANTE-PAT-0001",
  dateNaissance: new Date("1990-01-01"),
  sexe: "F",
  groupeSanguin: "O+",
  allergies: '["Penicilline"]',
  antecedents: "[]",
  maladiesChroniques: "[]",
  contactsUrgence: "[]",
  user: { nom: "Adjovi", prenom: "Rose", telephone: "+22997000000", avatarUrl: null },
};

const medecin = { user: { nom: "Ahouansou", prenom: "Koffi" } };

function consentement(typeAcces: string, surcharges: Record<string, unknown> = {}) {
  return { id: "cons-1", statut: "actif", typeAcces, dateFin: dans(HEURE), ...surcharges };
}

function examen(id: string, surcharges: Record<string, unknown> = {}) {
  return {
    id,
    date: new Date("2026-09-01T09:00:00Z"),
    typeExamen: "Glycemie",
    resultat: "1,1 g/L",
    statut: "termine",
    sensible: false,
    laboratoireId: "lab-1",
    laboratoire: { nom: "Labo Central" },
    demandeur: medecin,
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  getSessionMock.mockResolvedValue({ userId: "user-pro", roles: ["medecin"] });
  prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", userId: "user-pro", etablissementId: "etab-1" });
  prismaMock.consentement.findUnique.mockResolvedValue(consentement("dossier_complet"));
  prismaMock.referencePatient.findFirst.mockResolvedValue(null);
  prismaMock.patient.findUnique.mockResolvedValue(PATIENT);
  prismaMock.prescription.findMany.mockResolvedValue([]);
  prismaMock.consultation.findMany.mockResolvedValue([]);
  prismaMock.examenMedical.findMany.mockResolvedValue([]);
  prismaMock.suiviCommunautaire.findMany.mockResolvedValue([]);
});

describe("base d'acces : session, profil, consentement", () => {
  it("renvoie null sans session ou sans profil professionnel, sans rien lire", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getResumePatient("pat-1")).toBeNull();
    expect(await getHistoriquePatient("pat-1")).toBeNull();

    getSessionMock.mockResolvedValue({ userId: "user-pro", roles: ["medecin"] });
    prismaMock.professionnelSante.findUnique.mockResolvedValue(null);
    expect(await getResumePatient("pat-1")).toBeNull();

    expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("cherche le consentement au nom du professionnel de la session pour le patient demande", async () => {
    await getResumePatient("pat-1");
    expect(prismaMock.consentement.findUnique).toHaveBeenCalledWith({
      where: { patientId_acteurAutoriseId: { patientId: "pat-1", acteurAutoriseId: "user-pro" } },
    });
  });

  it("refuse sans consentement ni reference : aucune donnee lue, aucun journal", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(null);

    expect(await getResumePatient("pat-1")).toBeNull();
    expect(await getHistoriquePatient("pat-1")).toBeNull();

    expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.consultation.findMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse un consentement retire, expire, ou d'un autre statut", async () => {
    for (const surcharge of [{ statut: "retire" }, { statut: "revoque" }, { dateFin: dans(-1000) }]) {
      prismaMock.consentement.findUnique.mockResolvedValue(consentement("dossier_complet", surcharge));
      expect(await getResumePatient("pat-1")).toBeNull();
      expect(await getHistoriquePatient("pat-1")).toBeNull();
    }
  });
});

describe("portee du consentement (moindre privilege)", () => {
  for (const type of ["dossier_complet", "consultations", "urgence"]) {
    it(`le type "${type}" ouvre le resume et l'historique`, async () => {
      prismaMock.consentement.findUnique.mockResolvedValue(consentement(type));
      expect(await getResumePatient("pat-1")).not.toBeNull();
      expect(await getHistoriquePatient("pat-1")).not.toBeNull();
    });
  }

  for (const type of ["prescriptions", "examens", "documents", "type_inconnu"]) {
    it(`le type etroit "${type}" n'ouvre ni le resume ni l'historique (chaque module garde son propre controle)`, async () => {
      prismaMock.consentement.findUnique.mockResolvedValue(consentement(type));

      expect(await getResumePatient("pat-1")).toBeNull();
      expect(await getHistoriquePatient("pat-1")).toBeNull();

      expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.examenMedical.findMany).not.toHaveBeenCalled();
      expect(journaliserMock).not.toHaveBeenCalled();
    });
  }

  it("un consentement etroit n'empeche pas une reference valide adressee a l'etablissement du professionnel", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("documents"));
    prismaMock.referencePatient.findFirst.mockResolvedValue({ id: "ref-1", dateFinAcces: dans(24 * HEURE) });

    const resume = await getResumePatient("pat-1");

    expect(resume?.accesReferenceExpirationLe).toBe(dans(24 * HEURE).toISOString());
  });
});

describe("reference (F-CLI-14) comme base d'acces", () => {
  it("n'est cherchee que pour l'etablissement du professionnel et tant qu'elle n'a pas expire", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(null);

    await getResumePatient("pat-1");

    expect(prismaMock.referencePatient.findFirst).toHaveBeenCalledWith({
      where: { patientId: "pat-1", etablissementDestinationId: "etab-1", dateFinAcces: { gt: MAINTENANT } },
      orderBy: { dateFinAcces: "desc" },
    });
  });

  it("ouvre le resume avec sa date d'expiration, et journalise la reference utilisee", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(null);
    prismaMock.referencePatient.findFirst.mockResolvedValue({ id: "ref-1", dateFinAcces: dans(24 * HEURE) });

    const resume = await getResumePatient("pat-1");

    expect(resume?.accesReferenceExpirationLe).toBe(dans(24 * HEURE).toISOString());
    expect(resume?.accesUrgenceExpirationLe).toBeNull();
    expect(journaliserMock.mock.calls[0][0].justification).toContain("reference ref-1");
  });
});

describe("resume du patient", () => {
  it("renvoie l'identite, les allergies et l'age, et journalise la consultation du resume (RG-CLI-31)", async () => {
    const resume = await getResumePatient("pat-1");

    expect(resume).toMatchObject({ id: "pat-1", nomComplet: "Rose Adjovi", identifiantSante: "BJ-SANTE-PAT-0001", allergies: ["Penicilline"], age: 36, accesUrgenceExpirationLe: null });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "user-pro",
      action: "consultation_resume_patient",
      donneeConcernee: "patient:pat-1",
      justification: "Resume patient consulte (consentement dossier_complet)",
    });
  });

  it("signale l'expiration d'un acces d'urgence (bandeau rouge, CA-3)", async () => {
    const fin = dans(4 * HEURE);
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("urgence", { dateFin: fin }));

    const resume = await getResumePatient("pat-1");

    expect(resume?.accesUrgenceExpirationLe).toBe(fin.toISOString());
  });

  it("ne lit que les traitements actifs et les consultations terminees", async () => {
    await getResumePatient("pat-1");

    expect(prismaMock.prescription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: "pat-1", statut: { in: ["validee", "delivree_partiellement"] } } })
    );
    expect(prismaMock.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: "pat-1", statut: "terminee" } })
    );
  });
});

describe("historique du patient", () => {
  it("n'inclut que les consultations terminees (RG-CLI-41 : jamais un brouillon d'un autre)", async () => {
    await getHistoriquePatient("pat-1");
    expect(prismaMock.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: "pat-1", statut: "terminee" } })
    );
  });

  it("RG-CLI-91 : un acces d'urgence n'expose aucun examen sensible", async () => {
    prismaMock.examenMedical.findMany.mockResolvedValue([examen("ex-normal"), examen("ex-vih", { sensible: true, typeExamen: "Serologie VIH" })]);
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("urgence"));

    const historique = await getHistoriquePatient("pat-1");

    expect(historique?.evenements.map((e) => e.id)).toEqual(["ex-normal"]);
  });

  it("un acces par reference n'expose pas non plus les examens sensibles", async () => {
    prismaMock.examenMedical.findMany.mockResolvedValue([examen("ex-normal"), examen("ex-vih", { sensible: true })]);
    prismaMock.consentement.findUnique.mockResolvedValue(null);
    prismaMock.referencePatient.findFirst.mockResolvedValue({ id: "ref-1", dateFinAcces: dans(HEURE) });

    const historique = await getHistoriquePatient("pat-1");

    expect(historique?.evenements.map((e) => e.id)).toEqual(["ex-normal"]);
  });

  it("un consentement dossier_complet voit les examens sensibles", async () => {
    prismaMock.examenMedical.findMany.mockResolvedValue([examen("ex-normal"), examen("ex-vih", { sensible: true })]);

    const historique = await getHistoriquePatient("pat-1");

    expect(historique?.evenements.map((e) => e.id).sort()).toEqual(["ex-normal", "ex-vih"]);
  });

  it("RG-LAB-30 : un resultat non valide par un second professionnel n'est jamais montre", async () => {
    prismaMock.examenMedical.findMany.mockResolvedValue([examen("ex-en-cours", { statut: "en_cours", resultat: "RESULTAT NON VALIDE" })]);

    const historique = await getHistoriquePatient("pat-1");

    const evenement = historique!.evenements[0];
    expect(evenement.description).toBe("");
    expect(evenement.detailLignes.join(" ")).not.toContain("RESULTAT NON VALIDE");
  });

  it("journalise l'affichage de la liste une seule fois (RG-CLI-80), avec la page", async () => {
    await getHistoriquePatient("pat-1");

    expect(journaliserMock).toHaveBeenCalledTimes(1);
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      action: "consultation_historique_patient",
      donneeConcernee: "patient:pat-1",
      justification: "Historique consulte (page 1/1)",
    });
  });

  it("trie du plus recent au plus ancien, filtre par type, etablissement et dates, et pagine par 25", async () => {
    const consultations = Array.from({ length: 26 }, (_, i) => ({
      id: `c-${i}`,
      date: new Date(Date.UTC(2026, 0, 1 + i, 9)),
      motif: `Motif ${i}`,
      conclusion: "",
      saisieParErreur: false,
      motifRetrait: null,
      etablissementId: i % 2 === 0 ? "etab-1" : "etab-2",
      etablissement: { nom: i % 2 === 0 ? "CS Akpakpa" : "CHU Parakou" },
      professionnel: medecin,
    }));
    prismaMock.consultation.findMany.mockResolvedValue(consultations);
    prismaMock.examenMedical.findMany.mockResolvedValue([examen("ex-1")]);

    const page1 = await getHistoriquePatient("pat-1");
    expect(page1?.total).toBe(27);
    expect(page1?.nombreDePages).toBe(2);
    expect(page1?.evenements).toHaveLength(25);
    // L'examen (septembre) est plus recent que toutes les consultations (janvier).
    expect(page1?.evenements.slice(0, 2).map((e) => e.id)).toEqual(["ex-1", "c-25"]);

    const page2 = await getHistoriquePatient("pat-1", { page: 2 });
    expect(page2?.evenements).toHaveLength(2);

    expect((await getHistoriquePatient("pat-1", { page: 99 }))?.page).toBe(2);
    expect((await getHistoriquePatient("pat-1", { page: -3 }))?.page).toBe(1);

    const examens = await getHistoriquePatient("pat-1", { type: "examen" });
    expect(examens?.evenements.map((e) => e.id)).toEqual(["ex-1"]);

    const etab2 = await getHistoriquePatient("pat-1", { etablissementId: "etab-2" });
    expect(etab2?.total).toBe(13);

    const janvier = await getHistoriquePatient("pat-1", { type: "consultation", dateDebut: "2026-01-10", dateFin: "2026-01-12" });
    expect(janvier?.evenements.map((e) => e.id)).toEqual(["c-11", "c-10", "c-9"]);

    expect(page1?.etablissementsDisponibles.map((e) => e.nom)).toEqual(["CHU Parakou", "CS Akpakpa", "Labo Central"]);
  });
});
