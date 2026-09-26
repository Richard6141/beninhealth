import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    examenMedical: { findUnique: vi.fn(), update: vi.fn() },
    versionResultatExamen: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn(async (saisi: string) => saisi === "bon-mot-de-passe") } }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { corrigerResultatValideAction, validerResultatExamenAction } from "@/modules/laboratoire/actions";

const p = prisma as unknown as {
  user: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
  examenMedical: { findUnique: Mock; update: Mock };
  versionResultatExamen: { create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const etatInitial = { error: null, success: false };
const dateValidation = new Date("2026-09-20T10:00:00Z");

function formulaire(surcharges: Record<string, string> = {}): FormData {
  const champs: Record<string, string> = {
    examenId: "ex-1",
    motif: "Erreur de transcription du resultat",
    motDePasse: "bon-mot-de-passe",
    ...surcharges,
  };
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function examenValide(surcharges: Record<string, unknown> = {}) {
  return {
    id: "ex-1",
    laboratoireId: "labo-etab",
    statut: "termine",
    sensible: false,
    versionResultat: 1,
    resultat: "Glycemie a jeun : 0.9 g/L (N)",
    resultatsParametres: [{ code: "GLYCEMIE_JEUN", valeur: 0.9, indicateur: "N" }],
    empreinteResultat: "empreinte-v1",
    saisiParId: "prof-saisie",
    valideParId: "prof-validation",
    dateValidation,
    patient: { userId: "user-patient" },
    demandeur: { userId: "user-medecin" },
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "labo-3", roles: ["laboratoire"] });
  p.user.findUnique.mockResolvedValue({ id: "labo-3", motDePasseHash: "hash" });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-correction", etablissementId: "labo-etab" });
  p.examenMedical.findUnique.mockResolvedValue(examenValide());
});

describe("corrigerResultatValideAction : correction par nouvelle version (RG-ROL-31)", () => {
  it("archive la version validee telle quelle, rouvre la saisie et incremente la version", async () => {
    const resultat = await corrigerResultatValideAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true });

    const archive = p.versionResultatExamen.create.mock.calls[0][0].data;
    expect(archive).toMatchObject({
      examenId: "ex-1",
      numero: 1,
      resultat: "Glycemie a jeun : 0.9 g/L (N)",
      empreinteResultat: "empreinte-v1",
      saisiParId: "prof-saisie",
      valideParId: "prof-validation",
      dateValidation,
      motifCorrection: "Erreur de transcription du resultat",
      corrigeParId: "prof-correction",
    });

    const misAJour = p.examenMedical.update.mock.calls[0][0].data;
    expect(misAJour).toMatchObject({
      statut: "correction_demandee",
      versionResultat: 2,
      valideParId: null,
      dateValidation: null,
      empreinteResultat: null,
    });
    expect(misAJour.commentaireValidation).toContain("Erreur de transcription");
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "correction_resultat_valide" });
  });

  it("previent le prescripteur sans nommer l'examen ni sa valeur", async () => {
    await corrigerResultatValideAction(etatInitial, formulaire());

    expect(creerNotificationMock).toHaveBeenCalledTimes(1);
    const [destinataire, type, message] = creerNotificationMock.mock.calls[0];
    expect(destinataire).toBe("user-medecin");
    expect(type).toBe("resultat_examen_corrige");
    expect(message).not.toContain("Glycemie");
    expect(message).not.toContain("0.9");
  });

  it("un examen sensible perd son statut annonce : le medecin doit annoncer de nouveau", async () => {
    p.examenMedical.findUnique.mockResolvedValue(examenValide({ sensible: true, resultatAnnonceAuPatient: true }));

    await corrigerResultatValideAction(etatInitial, formulaire());

    expect(p.examenMedical.update.mock.calls[0][0].data.resultatAnnonceAuPatient).toBe(false);
  });

  it("un examen non sensible ne touche pas au drapeau d'annonce", async () => {
    await corrigerResultatValideAction(etatInitial, formulaire());

    expect(p.examenMedical.update.mock.calls[0][0].data).not.toHaveProperty("resultatAnnonceAuPatient");
  });

  it("numerote l'archive avec la version courante (une 2e correction archive la version 2)", async () => {
    p.examenMedical.findUnique.mockResolvedValue(examenValide({ versionResultat: 2 }));

    await corrigerResultatValideAction(etatInitial, formulaire());

    expect(p.versionResultatExamen.create.mock.calls[0][0].data.numero).toBe(2);
    expect(p.examenMedical.update.mock.calls[0][0].data.versionResultat).toBe(3);
  });

  it("refuse un motif trop court, un mot de passe incorrect, un role sans droit", async () => {
    expect((await corrigerResultatValideAction(etatInitial, formulaire({ motif: "court" }))).success).toBe(false);
    expect((await corrigerResultatValideAction(etatInitial, formulaire({ motDePasse: "mauvais" }))).error).toContain("Mot de passe");

    getSessionMock.mockResolvedValue({ userId: "user-medecin", roles: ["medecin"] });
    expect((await corrigerResultatValideAction(etatInitial, formulaire())).success).toBe(false);

    expect(p.versionResultatExamen.create).not.toHaveBeenCalled();
    expect(p.examenMedical.update).not.toHaveBeenCalled();
  });

  it("ne corrige que les resultats deja valides (statut termine)", async () => {
    for (const statut of ["demande", "en_cours", "resultat_saisi", "correction_demandee", "annule"]) {
      p.examenMedical.findUnique.mockResolvedValue(examenValide({ statut }));

      const resultat = await corrigerResultatValideAction(etatInitial, formulaire());

      expect(resultat.success).toBe(false);
    }
    expect(p.versionResultatExamen.create).not.toHaveBeenCalled();
  });

  it("refuse l'examen d'un autre laboratoire", async () => {
    p.examenMedical.findUnique.mockResolvedValue(examenValide({ laboratoireId: "autre-labo" }));

    const resultat = await corrigerResultatValideAction(etatInitial, formulaire());

    expect(resultat.error).toContain("introuvable");
    expect(p.examenMedical.update).not.toHaveBeenCalled();
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });
});

describe("validerResultatExamenAction : version corrigee", () => {
  it("previent le prescripteur qu'il s'agit de la version corrigee", async () => {
    p.examenMedical.findUnique.mockResolvedValue(
      examenValide({ statut: "resultat_saisi", versionResultat: 2, saisiParId: "prof-saisie-2" })
    );
    p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-validation-2", etablissementId: "labo-etab" });

    const resultat = await validerResultatExamenAction(etatInitial, formulaire());

    expect(resultat.success).toBe(true);
    const messageMedecin = creerNotificationMock.mock.calls.find((appel) => appel[0] === "user-medecin")![2] as string;
    expect(messageMedecin).toContain("version 2");
  });
});
