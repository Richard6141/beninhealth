import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn(), findMany: vi.fn() },
    consentement: { findUnique: vi.fn() },
    etablissementSanitaire: { findUnique: vi.fn() },
    consultation: { findUnique: vi.fn() },
    examenMedical: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
vi.mock("@/modules/administration/parametres", () => ({ estFonctionnaliteActive: vi.fn(async () => true) }));
vi.mock("@/modules/facility/destinataire-notification-patient", () => ({
  destinataireNotificationPatient: vi.fn(async (patientId: string) => `destinataire-de-${patientId}`),
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { creerNotification } from "@/modules/notification/creer";
import { destinataireNotificationPatient } from "@/modules/facility/destinataire-notification-patient";
import { demanderExamenAction } from "@/modules/laboratoire/actions";
import { FORMAT_NUMERO_EXAMEN } from "@/modules/laboratoire/numero-examen";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { MESSAGE_MODULE_INACTIF } from "@/modules/administration/modules-actifs";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock; findMany: Mock };
  consentement: { findUnique: Mock };
  etablissementSanitaire: { findUnique: Mock };
  consultation: { findUnique: Mock };
  examenMedical: { create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;
const destinataireNotificationPatientMock = destinataireNotificationPatient as unknown as Mock;

const etatInitial = { error: null, success: false };

function formulaire(champs: Record<string, string> = {}): FormData {
  const donnees = new FormData();
  donnees.set("patientId", "patient-1");
  donnees.set("consultationId", "consult-1");
  donnees.set("laboratoireId", "labo-etab");
  donnees.set("typeExamen", "Glycemie a jeun");
  for (const [cle, valeur] of Object.entries(champs)) {
    donnees.set(cle, valeur);
  }
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-medecin", roles: ["medecin"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-medecin", etablissementId: "hopital" });
  p.professionnelSante.findMany.mockResolvedValue([{ userId: "labo-1" }, { userId: "labo-2" }]);
  p.consentement.findUnique.mockResolvedValue({ statut: "actif", dateFin: null, typeAcces: "dossier_complet" });
  p.etablissementSanitaire.findUnique.mockResolvedValue({ id: "labo-etab", type: "laboratoire" });
  p.consultation.findUnique.mockResolvedValue({
    id: "consult-1",
    patientId: "patient-1",
    professionnelId: "prof-medecin",
  });
  p.examenMedical.create.mockImplementation(async ({ data }: { data: { numero: string } }) => ({ id: "ex-1", numero: data.numero }));
});

describe("demanderExamenAction : numero LB et notification du laboratoire (F-LAB-01)", () => {
  it("attribue un numero LB-XXXX-XXXX a la demande", async () => {
    const resultat = await demanderExamenAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.examenMedical.create.mock.calls[0][0].data.numero).toMatch(FORMAT_NUMERO_EXAMEN);
  });

  it("previent chaque membre du laboratoire, sans nom de patient ni d'examen dans le message", async () => {
    await demanderExamenAction(etatInitial, formulaire());

    const appelsLaboratoire = creerNotificationMock.mock.calls.filter(
      (appel) => appel[0] === "labo-1" || appel[0] === "labo-2"
    );
    const destinataires = appelsLaboratoire.map((appel) => appel[0]);
    expect(destinataires).toEqual(["labo-1", "labo-2"]);
    const message = appelsLaboratoire[0][2] as string;
    expect(message).not.toContain("Glycemie");
    expect(message).not.toContain("patient-1");
  });

  it("rejoue la demande avec un nouveau numero apres une collision d'unicite (P2002)", async () => {
    p.examenMedical.create
      .mockRejectedValueOnce({ code: "P2002" })
      .mockImplementation(async ({ data }: { data: { numero: string } }) => ({ id: "ex-1", numero: data.numero }));

    const resultat = await demanderExamenAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.examenMedical.create).toHaveBeenCalledTimes(2);
  });

  it("abandonne avec une erreur claire si la collision persiste apres 5 essais", async () => {
    p.examenMedical.create.mockRejectedValue({ code: "P2002" });
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultat = await demanderExamenAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.examenMedical.create).toHaveBeenCalledTimes(5);
    expect(creerNotificationMock).not.toHaveBeenCalled();
    erreurConsole.mockRestore();
  });

  it("une erreur autre qu'une collision n'est pas rejouee", async () => {
    p.examenMedical.create.mockRejectedValue(new Error("base indisponible"));
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultat = await demanderExamenAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.examenMedical.create).toHaveBeenCalledTimes(1);
    erreurConsole.mockRestore();
  });
});

describe("demanderExamenAction : consultation obligatoire (RG-LAB-01)", () => {
  it("refuse une demande sans consultationId", async () => {
    const resultat = await demanderExamenAction(etatInitial, formulaire({ consultationId: "" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("consultation");
    expect(p.examenMedical.create).not.toHaveBeenCalled();
  });

  it("refuse une consultation introuvable", async () => {
    p.consultation.findUnique.mockResolvedValue(null);

    const resultat = await demanderExamenAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: "Cette consultation est introuvable.", success: false });
    expect(p.examenMedical.create).not.toHaveBeenCalled();
  });

  it("refuse une consultation d'un autre patient", async () => {
    p.consultation.findUnique.mockResolvedValue({
      id: "consult-1",
      patientId: "autre-patient",
      professionnelId: "prof-medecin",
    });

    const resultat = await demanderExamenAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.examenMedical.create).not.toHaveBeenCalled();
  });

  it("refuse une consultation d'un autre professionnel", async () => {
    p.consultation.findUnique.mockResolvedValue({
      id: "consult-1",
      patientId: "patient-1",
      professionnelId: "autre-professionnel",
    });

    const resultat = await demanderExamenAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.examenMedical.create).not.toHaveBeenCalled();
  });

  it("enregistre le consultationId valide sur l'examen cree", async () => {
    await demanderExamenAction(etatInitial, formulaire());

    expect(p.examenMedical.create.mock.calls[0][0].data.consultationId).toBe("consult-1");
  });
});

describe("demanderExamenAction : renseignements cliniques (F-LAB-01)", () => {
  it("enregistre les renseignements cliniques fournis", async () => {
    await demanderExamenAction(etatInitial, formulaire({ renseignementsCliniques: "Douleur abdominale depuis 3 jours" }));

    expect(p.examenMedical.create.mock.calls[0][0].data.renseignementsCliniques).toBe(
      "Douleur abdominale depuis 3 jours"
    );
  });

  it("enregistre null si le champ est laisse vide", async () => {
    await demanderExamenAction(etatInitial, formulaire());

    expect(p.examenMedical.create.mock.calls[0][0].data.renseignementsCliniques).toBeNull();
  });

  it("refuse plus de 200 caracteres", async () => {
    const resultat = await demanderExamenAction(
      etatInitial,
      formulaire({ renseignementsCliniques: "a".repeat(201) })
    );

    expect(resultat.success).toBe(false);
    expect(p.examenMedical.create).not.toHaveBeenCalled();
  });

  it("accepte exactement 200 caracteres", async () => {
    const resultat = await demanderExamenAction(
      etatInitial,
      formulaire({ renseignementsCliniques: "a".repeat(200) })
    );

    expect(resultat).toEqual({ error: null, success: true });
  });
});

describe("demanderExamenAction : notification du patient a la creation (F-LAB-01)", () => {
  it("notifie le patient (routee via destinataireNotificationPatient)", async () => {
    await demanderExamenAction(etatInitial, formulaire());

    expect(destinataireNotificationPatientMock).toHaveBeenCalledWith("patient-1");
    const appelPatient = creerNotificationMock.mock.calls.find(
      (appel) => appel[0] === "destinataire-de-patient-1"
    );
    expect(appelPatient).toBeDefined();
    expect(appelPatient?.[1]).toBe("examen_demande");
    expect(appelPatient?.[3]).toBe("/app/patient/examens");
  });

  it("ne nomme jamais le type d'examen dans le message adresse au patient", async () => {
    await demanderExamenAction(etatInitial, formulaire());

    const appelPatient = creerNotificationMock.mock.calls.find(
      (appel) => appel[0] === "destinataire-de-patient-1"
    );
    expect(appelPatient?.[2] as string).not.toContain("Glycemie");
  });
});

describe("module laboratoire desactive (F-ADM-07)", () => {
  it("refuse la demande d'examen sans rien ecrire quand lab.module est inactif", async () => {
    (estFonctionnaliteActive as unknown as Mock).mockResolvedValueOnce(false);

    const resultat = await demanderExamenAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: MESSAGE_MODULE_INACTIF, success: false });
    expect(estFonctionnaliteActive).toHaveBeenCalledWith("lab.module");
    expect(p.examenMedical.create).not.toHaveBeenCalled();
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });
});
