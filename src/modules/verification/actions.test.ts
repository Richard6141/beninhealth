import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() }, consentement: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { getFicheVerification } from "@/modules/verification/actions";

const p = prisma as unknown as { user: { findUnique: Mock }; consentement: { findUnique: Mock } };
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const cibleAdmin = {
  id: "admin-1",
  nom: "Houngbo",
  prenom: "Serge",
  email: "admin@example.test",
  roles: [{ nom: "admin_national" }],
  patient: null,
  professionnel: null,
};

const ciblePatient = {
  id: "user-pat",
  nom: "Adjovi",
  prenom: "Koffi",
  email: "koffi@example.test",
  roles: [{ nom: "patient" }],
  patient: {
    id: "pat-1",
    identifiantSante: "BJ-SANTE-PAT-0001",
    dateNaissance: new Date("1990-01-01"),
    sexe: "M",
    groupeSanguin: "O+",
    allergies: '["Penicilline"]',
    antecedents: "[]",
    maladiesChroniques: "[]",
    contactsUrgence: "[]",
  },
  professionnel: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "med-1", roles: ["medecin"] });
});

describe("getFicheVerification : donnees medicales", () => {
  it.each([["dossier_complet"], ["consultations"], ["urgence"]])("un consentement '%s' actif ouvre la fiche et laisse une trace", async (typeAcces) => {
    p.user.findUnique.mockResolvedValue(ciblePatient);
    p.consentement.findUnique.mockResolvedValue({ statut: "actif", typeAcces, dateFin: null });

    const fiche = await getFicheVerification("user-pat");

    expect(fiche).toMatchObject({ type: "patient", groupeSanguin: "O+", allergies: ["Penicilline"] });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
  });

  it.each([["documents"], ["examens"], ["prescriptions"], ["autre"]])(
    "un consentement limite a '%s' n'ouvre PAS la fiche (groupe sanguin, allergies, contacts)",
    async (typeAcces) => {
      p.user.findUnique.mockResolvedValue(ciblePatient);
      p.consentement.findUnique.mockResolvedValue({ statut: "actif", typeAcces, dateFin: null });
      expect(await getFicheVerification("user-pat")).toBeNull();
      expect(journaliserMock).not.toHaveBeenCalled();
    }
  );

  it("refuse sans consentement, avec un consentement retire ou expire", async () => {
    p.user.findUnique.mockResolvedValue(ciblePatient);
    p.consentement.findUnique.mockResolvedValue(null);
    expect(await getFicheVerification("user-pat")).toBeNull();
    p.consentement.findUnique.mockResolvedValue({ statut: "retire", typeAcces: "dossier_complet", dateFin: null });
    expect(await getFicheVerification("user-pat")).toBeNull();
    p.consentement.findUnique.mockResolvedValue({ statut: "actif", typeAcces: "dossier_complet", dateFin: new Date(Date.now() - 1000) });
    expect(await getFicheVerification("user-pat")).toBeNull();
  });

  it("le patient voit sa propre fiche sans consentement ni trace", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
    p.user.findUnique.mockResolvedValue(ciblePatient);
    expect(await getFicheVerification("user-pat")).toMatchObject({ type: "patient" });
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("sans session, rien", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getFicheVerification("user-pat")).toBeNull();
  });
});

describe("getFicheVerification : compte administratif", () => {
  it("ne donne pas l'adresse e-mail d'un compte administratif a un utilisateur quelconque", async () => {
    p.user.findUnique.mockResolvedValue(cibleAdmin);
    expect(await getFicheVerification("admin-1")).toMatchObject({ type: "compte", email: "" });
  });

  it("la donne a l'administration nationale et au titulaire", async () => {
    p.user.findUnique.mockResolvedValue(cibleAdmin);
    getSessionMock.mockResolvedValue({ userId: "autre-admin", roles: ["admin_national"] });
    expect(await getFicheVerification("admin-1")).toMatchObject({ email: "admin@example.test" });
    getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_national"] });
    expect(await getFicheVerification("admin-1")).toMatchObject({ email: "admin@example.test" });
  });
});
