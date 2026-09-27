import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { appelIa: { count: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/administration/parametres", () => ({ estFonctionnaliteActive: vi.fn() }));
vi.mock("@/modules/administration/parametres-lecture", () => ({ lireParametre: vi.fn() }));
vi.mock("@/modules/facility/annuaire-public", () => ({ getAnnuairePublicEtablissements: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { lireParametre } from "@/modules/administration/parametres-lecture";
import { getAnnuairePublicEtablissements } from "@/modules/facility/annuaire-public";
import { poserQuestionAssistantAction } from "@/modules/ai/assistant-actions";
import { LIMITE_QUESTIONS_PAR_HEURE } from "@/modules/ai/assistant";

const p = prisma as unknown as { appelIa: { count: Mock; create: Mock } };
const getSessionMock = getSession as unknown as Mock;
const fonctionnaliteMock = estFonctionnaliteActive as unknown as Mock;
const parametreMock = lireParametre as unknown as Mock;
const annuaireMock = getAnnuairePublicEtablissements as unknown as Mock;

beforeEach(() => {
  vi.resetAllMocks();
  getSessionMock.mockResolvedValue({ userId: "u-patient", roles: ["patient"] });
  fonctionnaliteMock.mockResolvedValue(true);
  parametreMock.mockResolvedValue(0);
  annuaireMock.mockResolvedValue([]);
  p.appelIa.count.mockResolvedValue(0);
  p.appelIa.create.mockResolvedValue({});
});

describe("poserQuestionAssistantAction : controles (F-IA-02)", () => {
  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);

    const resultat = await poserQuestionAssistantAction("Comment prendre rendez-vous ?");

    expect(resultat).toMatchObject({ succes: false, reponse: null });
    expect(fonctionnaliteMock).not.toHaveBeenCalled();
  });

  it.each(["medecin", "infirmier", "pharmacien", "laboratoire", "admin_etablissement", "admin_national"] as const)("refuse le role %s", async (role) => {
    getSessionMock.mockResolvedValue({ userId: "u-x", roles: [role] });

    const resultat = await poserQuestionAssistantAction("Comment prendre rendez-vous ?");

    expect(resultat.succes).toBe(false);
    expect(p.appelIa.create).not.toHaveBeenCalled();
  });

  it("refuse quand ai.citizen_assistant est desactivee (RG-IA-02)", async () => {
    fonctionnaliteMock.mockResolvedValue(false);

    const resultat = await poserQuestionAssistantAction("Comment prendre rendez-vous ?");

    expect(fonctionnaliteMock).toHaveBeenCalledWith("ai.citizen_assistant");
    expect(resultat).toMatchObject({ succes: false, erreur: "L'assistant est désactivé." });
    expect(p.appelIa.create).not.toHaveBeenCalled();
  });

  it("refuse au-dela de 60 questions par heure", async () => {
    p.appelIa.count.mockResolvedValue(LIMITE_QUESTIONS_PAR_HEURE);

    const resultat = await poserQuestionAssistantAction("Comment prendre rendez-vous ?");

    expect(resultat.succes).toBe(false);
    expect(resultat.erreur).toContain("60");
    expect(p.appelIa.create).not.toHaveBeenCalled();
  });

  it("refuse une question qui n'est pas du texte", async () => {
    const resultat = await poserQuestionAssistantAction({ injecte: true } as unknown as string);

    expect(resultat.succes).toBe(false);
  });
});

describe("poserQuestionAssistantAction : reponse et journal (RG-IA-08)", () => {
  it("repond depuis la FAQ et journalise un compteur sans le texte de la question", async () => {
    const resultat = await poserQuestionAssistantAction("Comment annuler mon rendez-vous ?");

    expect(resultat.succes).toBe(true);
    expect(resultat.reponse).toMatchObject({ type: "faq", sujet: "rdv_annuler" });
    const ecrit = p.appelIa.create.mock.calls[0][0].data;
    expect(ecrit).toMatchObject({ utilisateurId: "u-patient", patientId: null, fonctionnalite: "assistant_citoyen", statut: "ok", nombreSources: 1 });
    expect(JSON.stringify(ecrit)).not.toContain("annuler");
    expect(annuaireMock).not.toHaveBeenCalled();
  });

  it("une question de sante donne la reponse fixe avec le numero d'urgence du parametre, statut symptome", async () => {
    parametreMock.mockResolvedValue(117);

    const resultat = await poserQuestionAssistantAction("J'ai de la fièvre depuis deux jours");

    expect(parametreMock).toHaveBeenCalledWith("urgence.numero_appel");
    expect(resultat.reponse?.type).toBe("symptome");
    expect(resultat.reponse?.texte).toContain("117");
    expect(p.appelIa.create.mock.calls[0][0].data.statut).toBe("symptome");
  });

  it("une recherche d'etablissement interroge l'annuaire public et n'expose que nom, type et lieu", async () => {
    annuaireMock.mockResolvedValue([
      { id: "e-1", identifiant: "ETAB-1", nom: "Centre de santé de Bohicon", sigle: null, type: "centre_sante", communeNom: "Bohicon", departementNom: "Zou", localisation: "Zou, Bohicon" },
    ]);

    const resultat = await poserQuestionAssistantAction("Où se faire vacciner à Bohicon ?");

    expect(annuaireMock).toHaveBeenCalledWith("Bohicon");
    expect(resultat.reponse?.etablissements).toEqual([{ id: "e-1", nom: "Centre de santé de Bohicon", type: "centre_sante", localisation: "Bohicon" }]);
    expect(p.appelIa.create.mock.calls[0][0].data).toMatchObject({ statut: "ok", nombreSources: 1 });
  });

  it("une question sans reponse est journalisee en 'inconnu'", async () => {
    const resultat = await poserQuestionAssistantAction("Quelle est la capitale du Bénin ?");

    expect(resultat.reponse?.type).toBe("inconnu");
    expect(p.appelIa.create.mock.calls[0][0].data.statut).toBe("inconnu");
  });

  it("une question vide n'est ni journalisee ni comptee dans la limite", async () => {
    const resultat = await poserQuestionAssistantAction("   ");

    expect(resultat.reponse?.type).toBe("vide");
    expect(p.appelIa.create).not.toHaveBeenCalled();
  });

  it("une panne de l'annuaire ne fuit aucun detail", async () => {
    annuaireMock.mockRejectedValue(new Error("base indisponible"));
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultat = await poserQuestionAssistantAction("Où trouver une clinique à Ouidah ?");

    expect(resultat.succes).toBe(false);
    expect(resultat.erreur).not.toContain("base");
    erreurConsole.mockRestore();
  });
});
