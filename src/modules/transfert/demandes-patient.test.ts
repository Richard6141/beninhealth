import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    patient: { findUnique: vi.fn() },
    demandeAccesDossier: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    consentement: { findUnique: vi.fn(), upsert: vi.fn() },
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
import { getDemandesAccesRecues, repondreDemandeAccesAction } from "@/modules/transfert/demandes-patient";

const p = prisma as unknown as {
  patient: { findUnique: Mock };
  demandeAccesDossier: { findMany: Mock; findFirst: Mock; updateMany: Mock };
  consentement: { findUnique: Mock; upsert: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

const demandeEnAttente = {
  id: "dem-1",
  demandeurId: "pro-1",
  patientId: "pat-1",
  modeRecherche: "telephone",
  motif: "consultation",
  dureeAccesHeures: 24,
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
  p.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-pat" });
  p.demandeAccesDossier.findFirst.mockResolvedValue({ ...demandeEnAttente });
  p.demandeAccesDossier.updateMany.mockResolvedValue({ count: 1 });
  p.consentement.findUnique.mockResolvedValue(null);
});

describe("getDemandesAccesRecues", () => {
  it("ne liste que les demandes en attente, non expirees, du patient connecte", async () => {
    p.demandeAccesDossier.findMany.mockResolvedValue([
      {
        id: "dem-1",
        motif: "avis_specialise",
        dureeAccesHeures: 72,
        dateCreation: new Date("2026-09-26T10:00:00Z"),
        expireLe: new Date("2026-09-26T10:10:00Z"),
        demandeur: { prenom: "Awa", nom: "Sossou", roles: [{ nom: "medecin" }] },
        etablissement: { nom: "CNHU-HKM" },
      },
    ]);

    const demandes = await getDemandesAccesRecues();

    const filtre = p.demandeAccesDossier.findMany.mock.calls[0][0].where;
    expect(filtre).toMatchObject({ patientId: "pat-1", statut: "en_attente" });
    expect(filtre.expireLe.gt).toBeInstanceOf(Date);
    expect(demandes).toEqual([
      expect.objectContaining({
        demandeurNomComplet: "Awa Sossou",
        titre: "Médecin",
        etablissementNom: "CNHU-HKM",
        motif: "un avis spécialisé",
        duree: "3 jours",
      }),
    ]);
  });

  it("ne renvoie rien a un role sans la permission", async () => {
    getSessionMock.mockResolvedValue({ userId: "u", roles: ["medecin"] });
    expect(await getDemandesAccesRecues()).toEqual([]);
    expect(p.demandeAccesDossier.findMany).not.toHaveBeenCalled();
  });
});

describe("repondreDemandeAccesAction", () => {
  const etatInitial = { error: null, success: false };

  it("autoriser cree un consentement 'consultations' pour le professionnel demandeur, journalise", async () => {
    const resultat = await repondreDemandeAccesAction(etatInitial, formulaire({ demandeId: "dem-1", decision: "accepter" }));

    expect(resultat).toEqual({ error: null, success: true, decision: "accepter" });
    expect(p.consentement.upsert.mock.calls[0][0].create).toMatchObject({
      patientId: "pat-1",
      acteurAutoriseId: "pro-1",
      typeAcces: "consultations",
    });
    expect(journaliserMock.mock.calls.at(-1)?.[0]).toMatchObject({
      utilisateurId: "pro-1",
      action: "acces_dossier_confirme_par_patient",
      donneeConcernee: "patient:pat-1",
    });
  });

  it("refuser n'accorde rien et journalise le refus au nom du patient", async () => {
    const resultat = await repondreDemandeAccesAction(etatInitial, formulaire({ demandeId: "dem-1", decision: "refuser" }));

    expect(resultat).toEqual({ error: null, success: true, decision: "refuser" });
    expect(p.consentement.upsert).not.toHaveBeenCalled();
    expect(p.demandeAccesDossier.updateMany).toHaveBeenCalledWith({
      where: { id: "dem-1", statut: "en_attente" },
      data: { statut: "refusee" },
    });
    expect(journaliserMock.mock.calls.at(-1)?.[0]).toMatchObject({ utilisateurId: "user-pat", action: "acces_dossier_refuse" });
  });

  it("une demande adressee a un autre patient est introuvable", async () => {
    p.demandeAccesDossier.findFirst.mockResolvedValue(null);
    const resultat = await repondreDemandeAccesAction(etatInitial, formulaire({ demandeId: "dem-1", decision: "accepter" }));
    expect(resultat.success).toBe(false);
    expect(p.demandeAccesDossier.findFirst.mock.calls[0][0].where).toMatchObject({ id: "dem-1", patientId: "pat-1", statut: "en_attente" });
    expect(p.consentement.upsert).not.toHaveBeenCalled();
  });

  it("une demande deja traitee (autre voie) ne cree pas de second acces", async () => {
    p.demandeAccesDossier.updateMany.mockResolvedValue({ count: 0 });
    const resultat = await repondreDemandeAccesAction(etatInitial, formulaire({ demandeId: "dem-1", decision: "accepter" }));
    expect(resultat.success).toBe(false);
    expect(p.consentement.upsert).not.toHaveBeenCalled();
  });

  it("refuse une decision inconnue ou absente", async () => {
    expect((await repondreDemandeAccesAction(etatInitial, formulaire({ demandeId: "dem-1", decision: "peut-etre" }))).success).toBe(false);
    expect((await repondreDemandeAccesAction(etatInitial, formulaire({ demandeId: "dem-1" }))).success).toBe(false);
    expect(p.demandeAccesDossier.findFirst).not.toHaveBeenCalled();
  });

  it("refuse un professionnel qui tente de repondre a la place du patient", async () => {
    getSessionMock.mockResolvedValue({ userId: "pro-1", roles: ["medecin"] });
    const resultat = await repondreDemandeAccesAction(etatInitial, formulaire({ demandeId: "dem-1", decision: "accepter" }));
    expect(resultat.success).toBe(false);
    expect(p.consentement.upsert).not.toHaveBeenCalled();
  });

  it("ne retrograde pas un acces 'dossier_complet' deja accorde", async () => {
    const dansUnMois = new Date(Date.now() + 30 * 24 * 3600_000);
    p.consentement.findUnique.mockResolvedValue({ statut: "actif", typeAcces: "dossier_complet", dateFin: dansUnMois });
    await repondreDemandeAccesAction(etatInitial, formulaire({ demandeId: "dem-1", decision: "accepter" }));
    expect(p.consentement.upsert.mock.calls[0][0].update).toMatchObject({ typeAcces: "dossier_complet", dateFin: dansUnMois });
  });
});
