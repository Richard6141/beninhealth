import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    consentement: { findUnique: vi.fn() },
    appelIa: { count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/administration/parametres", () => ({ estFonctionnaliteActive: vi.fn() }));
vi.mock("@/modules/ai/lecture-dossier", () => ({ lireDossierPourIa: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { genererResumeIaAction, noterResumeIaAction } from "@/modules/ai/actions";
import { JEU_EVALUATION } from "@/modules/ai/jeu-evaluation";
import { lireDossierPourIa } from "@/modules/ai/lecture-dossier";
import { LIMITE_RESUMES_PAR_HEURE, MESSAGE_RESUME_INDISPONIBLE } from "@/modules/ai/regles";

const p = prisma as unknown as {
  consentement: { findUnique: Mock };
  appelIa: { count: Mock; create: Mock; update: Mock; updateMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const fonctionnaliteMock = estFonctionnaliteActive as unknown as Mock;
const lireDossierMock = lireDossierPourIa as unknown as Mock;

const DOSSIER = JEU_EVALUATION[0];

function consentement(surcharges: Record<string, unknown> = {}) {
  return { statut: "actif", typeAcces: "dossier_complet", dateFin: null, ...surcharges };
}

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.IA_FOURNISSEUR;
  getSessionMock.mockResolvedValue({ userId: "u-med", roles: ["medecin"] });
  fonctionnaliteMock.mockResolvedValue(true);
  p.consentement.findUnique.mockResolvedValue(consentement());
  p.appelIa.count.mockResolvedValue(0);
  p.appelIa.create.mockResolvedValue({ id: "appel-1" });
  p.appelIa.update.mockResolvedValue({});
  lireDossierMock.mockResolvedValue({ donnees: DOSSIER.donnees, identite: DOSSIER.identite });
});

describe("genererResumeIaAction : controles d'acces (F-IA-01 etape 2)", () => {
  it("refuse sans session, sans rien lire", async () => {
    getSessionMock.mockResolvedValue(null);

    const resultat = await genererResumeIaAction("pat-1");

    expect(resultat.succes).toBe(false);
    expect(fonctionnaliteMock).not.toHaveBeenCalled();
    expect(p.appelIa.create).not.toHaveBeenCalled();
  });

  it.each(["patient", "infirmier", "pharmacien", "laboratoire", "admin_etablissement", "admin_national"] as const)(
    "refuse le role %s",
    async (role) => {
      getSessionMock.mockResolvedValue({ userId: "u-x", roles: [role] });

      const resultat = await genererResumeIaAction("pat-1");

      expect(resultat.succes).toBe(false);
      expect(lireDossierMock).not.toHaveBeenCalled();
    }
  );

  it("refuse quand la fonctionnalite ai.summary est desactivee (RG-IA-02), sans lire le dossier", async () => {
    fonctionnaliteMock.mockResolvedValue(false);

    const resultat = await genererResumeIaAction("pat-1");

    expect(fonctionnaliteMock).toHaveBeenCalledWith("ai.summary");
    expect(resultat).toMatchObject({ succes: false, erreur: "Le résumé par IA est désactivé." });
    expect(p.consentement.findUnique).not.toHaveBeenCalled();
    expect(lireDossierMock).not.toHaveBeenCalled();
  });

  it.each([
    ["aucun consentement", null],
    ["consentement limite aux consultations", consentement({ typeAcces: "consultations" })],
    ["acces d'urgence", consentement({ typeAcces: "urgence" })],
    ["consentement retire", consentement({ statut: "retire" })],
    ["consentement expire", consentement({ dateFin: new Date("2020-01-01T00:00:00Z") })],
  ])("refuse sans base d'acces complete : %s", async (_libelle, valeur) => {
    p.consentement.findUnique.mockResolvedValue(valeur);

    const resultat = await genererResumeIaAction("pat-1");

    expect(resultat.succes).toBe(false);
    expect(resultat.erreur).toContain("accès complet");
    expect(lireDossierMock).not.toHaveBeenCalled();
    expect(p.appelIa.create).not.toHaveBeenCalled();
  });

  it("refuse au-dela de 30 resumes par heure, avant toute lecture du dossier", async () => {
    p.appelIa.count.mockResolvedValue(LIMITE_RESUMES_PAR_HEURE);

    const resultat = await genererResumeIaAction("pat-1");

    expect(resultat.succes).toBe(false);
    expect(resultat.erreur).toContain("30");
    expect(lireDossierMock).not.toHaveBeenCalled();
    expect(p.appelIa.create).not.toHaveBeenCalled();
  });
});

describe("genererResumeIaAction : resultat et journal (RG-IA-08)", () => {
  it("renvoie des puces sourcees, journalise l'appel sans aucun texte du dossier", async () => {
    const resultat = await genererResumeIaAction("pat-1");

    expect(resultat.succes).toBe(true);
    expect(resultat.appelId).toBe("appel-1");
    expect(resultat.puces.length).toBeGreaterThanOrEqual(2);
    expect(resultat.puces.every((puce) => puce.sources.length > 0)).toBe(true);
    const etiquettes = new Set(resultat.sources.map((source) => source.etiquette));
    expect(resultat.puces.flatMap((puce) => puce.sources).every((etiquette) => etiquettes.has(etiquette))).toBe(true);

    expect(p.appelIa.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ utilisateurId: "u-med", patientId: "pat-1", fonctionnalite: "resume_dossier", statut: "erreur" }) })
    );
    const cloture = p.appelIa.update.mock.calls[0][0];
    expect(cloture.where).toEqual({ id: "appel-1" });
    expect(cloture.data).toMatchObject({ statut: "ok", modele: "regles-locales-v1" });
    expect(cloture.data.nombreSources).toBeGreaterThan(0);

    // Ni la ligne de journal IA ni le journal d'audit ne contiennent de texte du dossier.
    const texteJournalise = JSON.stringify([cloture.data, journaliserMock.mock.calls[0][0]]);
    for (const attendu of DOSSIER.attendus) expect(texteJournalise).not.toContain(attendu);
    expect(journaliserMock).toHaveBeenCalledWith(expect.objectContaining({ action: "resume_ia_genere", donneeConcernee: "patient:pat-1" }));
  });

  it("un fournisseur desactive par la configuration donne un resume indisponible, journalise", async () => {
    process.env.IA_FOURNISSEUR = "desactive";

    const resultat = await genererResumeIaAction("pat-1");

    expect(resultat).toMatchObject({ succes: true, puces: [], sources: [], message: MESSAGE_RESUME_INDISPONIBLE });
    expect(p.appelIa.update.mock.calls[0][0].data).toMatchObject({ statut: "indisponible" });
  });

  it("un fournisseur inconnu coupe l'IA (echec ferme) au lieu de retomber sur un autre", async () => {
    process.env.IA_FOURNISSEUR = "openai";

    const resultat = await genererResumeIaAction("pat-1");

    expect(resultat.message).toBe(MESSAGE_RESUME_INDISPONIBLE);
    expect(p.appelIa.update.mock.calls[0][0].data.modele).toBe("desactive");
  });

  it("patient introuvable : l'appel ouvert est cloture en erreur", async () => {
    lireDossierMock.mockResolvedValue(null);

    const resultat = await genererResumeIaAction("pat-1");

    expect(resultat.succes).toBe(false);
    expect(p.appelIa.update.mock.calls[0][0].data).toMatchObject({ statut: "erreur" });
  });

  it("une exception inattendue ne fuit aucun detail et laisse l'appel en erreur", async () => {
    lireDossierMock.mockRejectedValue(new Error("connexion base perdue"));
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultat = await genererResumeIaAction("pat-1");

    expect(resultat.succes).toBe(false);
    expect(resultat.erreur).not.toContain("base");
    expect(p.appelIa.update).not.toHaveBeenCalled();
    erreurConsole.mockRestore();
  });
});

describe("noterResumeIaAction (F-IA-01 etape 7)", () => {
  it("refuse sans session ou pour un autre role", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-p", roles: ["patient"] });

    expect((await noterResumeIaAction("appel-1", "utile", "")).succes).toBe(false);
    expect(p.appelIa.updateMany).not.toHaveBeenCalled();
  });

  it("refuse un retour autre que utile ou inexact", async () => {
    const resultat = await noterResumeIaAction("appel-1", "excellent", "");

    expect(resultat.succes).toBe(false);
    expect(p.appelIa.updateMany).not.toHaveBeenCalled();
  });

  it("refuse un commentaire de plus de 300 caracteres", async () => {
    const resultat = await noterResumeIaAction("appel-1", "inexact", "x".repeat(301));

    expect(resultat.succes).toBe(false);
    expect(resultat.erreur).toContain("300");
  });

  it("ne note que les resumes du medecin connecte (et termines en ok)", async () => {
    p.appelIa.updateMany.mockResolvedValue({ count: 1 });

    const resultat = await noterResumeIaAction("appel-1", "inexact", "  mention erronee  ");

    expect(resultat.succes).toBe(true);
    expect(p.appelIa.updateMany).toHaveBeenCalledWith({
      where: { id: "appel-1", utilisateurId: "u-med", fonctionnalite: "resume_dossier", statut: "ok" },
      data: { retour: "inexact", commentaireRetour: "mention erronee" },
    });
    // Le commentaire libre n'est jamais recopie dans le journal d'audit.
    expect(JSON.stringify(journaliserMock.mock.calls[0][0])).not.toContain("mention erronee");
  });

  it("un resume d'un autre medecin est introuvable", async () => {
    p.appelIa.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await noterResumeIaAction("appel-autre", "utile", "");

    expect(resultat).toEqual({ succes: false, erreur: "Résumé introuvable." });
    expect(journaliserMock).not.toHaveBeenCalled();
  });
});
