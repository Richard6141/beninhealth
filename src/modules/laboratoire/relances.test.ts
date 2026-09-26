import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: { findMany: vi.fn(), updateMany: vi.fn() },
    professionnelSante: { findUnique: vi.fn(), findMany: vi.fn() },
    examenMedical: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { creerNotification } from "@/modules/notification/creer";
import { escaladerResultatsCritiquesNonLus, relancerAnnoncesEnRetard } from "@/modules/laboratoire/relances";

const p = prisma as unknown as {
  notification: { findMany: Mock; updateMany: Mock };
  professionnelSante: { findUnique: Mock; findMany: Mock };
  examenMedical: { findMany: Mock; updateMany: Mock };
};
const creerNotificationMock = creerNotification as unknown as Mock;

const maintenant = new Date("2026-09-27T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  p.notification.findMany.mockResolvedValue([{ id: "notif-1", utilisateurId: "user-medecin" }]);
  p.notification.updateMany.mockResolvedValue({ count: 1 });
  p.professionnelSante.findUnique.mockResolvedValue({ etablissementId: "hopital" });
  p.professionnelSante.findMany.mockResolvedValue([{ userId: "resp-1" }, { userId: "resp-2" }]);
  p.examenMedical.findMany.mockResolvedValue([{ id: "ex-1", demandeur: { userId: "user-medecin" } }]);
  p.examenMedical.updateMany.mockResolvedValue({ count: 1 });
});

describe("escaladerResultatsCritiquesNonLus (RG-LAB-21, N-LAB-CRITICAL-ESCALATION)", () => {
  it("ne cherche que les notifications critiques non lues, pas encore escaladees, de plus de 2 h", async () => {
    p.notification.findMany.mockResolvedValue([]);

    await escaladerResultatsCritiquesNonLus(maintenant);

    expect(p.notification.findMany).toHaveBeenCalledWith({
      where: {
        type: "resultat_examen_critique",
        lu: false,
        escaladeLe: null,
        date: { lte: new Date("2026-09-27T10:00:00.000Z") },
      },
      select: { id: true, utilisateurId: true },
    });
  });

  it("escalade a chaque responsable d'etablissement du prescripteur, sans detail clinique", async () => {
    const escalades = await escaladerResultatsCritiquesNonLus(maintenant);

    expect(escalades).toBe(1);
    expect(p.professionnelSante.findMany.mock.calls[0][0].where).toMatchObject({
      etablissementId: "hopital",
      user: { roles: { some: { nom: "admin_etablissement" } } },
    });
    const destinataires = creerNotificationMock.mock.calls.map((appel) => appel[0]);
    expect(destinataires).toEqual(["resp-1", "resp-2"]);
    const [, type, message, , options] = creerNotificationMock.mock.calls[0];
    expect(type).toBe("resultat_critique_escalade");
    expect(options).toEqual({ codeCatalogue: "N-LAB-CRITICAL-ESCALATION" });
    expect(message).not.toMatch(/patient|glyc|creatinine|hemoglobine|valeur/i);
  });

  it("reclame la notification de facon conditionnelle (jamais deux escalades)", async () => {
    await escaladerResultatsCritiquesNonLus(maintenant);

    expect(p.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "notif-1", lu: false, escaladeLe: null },
      data: { escaladeLe: maintenant },
    });
  });

  it("n'escalade pas si la notification a ete lue ou reclamee entre-temps", async () => {
    p.notification.updateMany.mockResolvedValue({ count: 0 });

    expect(await escaladerResultatsCritiquesNonLus(maintenant)).toBe(0);
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("sans responsable d'etablissement, ne reclame rien : la relance repart au prochain tour", async () => {
    p.professionnelSante.findMany.mockResolvedValue([]);

    expect(await escaladerResultatsCritiquesNonLus(maintenant)).toBe(0);
    expect(p.notification.updateMany).not.toHaveBeenCalled();
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("ignore un prescripteur sans profil professionnel", async () => {
    p.professionnelSante.findUnique.mockResolvedValue(null);

    expect(await escaladerResultatsCritiquesNonLus(maintenant)).toBe(0);
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });
});

describe("relancerAnnoncesEnRetard (N-LAB-ANNOUNCE-OVERDUE)", () => {
  it("ne cherche que les examens sensibles valides depuis plus de 30 jours, non annonces, sans rappel deja envoye", async () => {
    p.examenMedical.findMany.mockResolvedValue([]);

    await relancerAnnoncesEnRetard(maintenant);

    expect(p.examenMedical.findMany).toHaveBeenCalledWith({
      where: {
        sensible: true,
        statut: "termine",
        resultatAnnonceAuPatient: false,
        relanceAnnonceLe: null,
        dateValidation: { lte: new Date("2026-08-28T12:00:00.000Z") },
      },
      select: { id: true, demandeur: { select: { userId: true } } },
    });
  });

  it("rappelle au prescripteur, sans nom de patient ni d'examen, et reclame l'examen", async () => {
    const rappels = await relancerAnnoncesEnRetard(maintenant);

    expect(rappels).toBe(1);
    expect(p.examenMedical.updateMany).toHaveBeenCalledWith({
      where: { id: "ex-1", statut: "termine", resultatAnnonceAuPatient: false, relanceAnnonceLe: null },
      data: { relanceAnnonceLe: maintenant },
    });
    const [destinataire, type, message, , options] = creerNotificationMock.mock.calls[0];
    expect(destinataire).toBe("user-medecin");
    expect(type).toBe("resultat_annonce_en_retard");
    expect(options).toEqual({ codeCatalogue: "N-LAB-ANNOUNCE-OVERDUE" });
    expect(message).not.toMatch(/vih|serologie|glyc/i);
  });

  it("n'envoie pas de second rappel si l'examen a ete annonce ou rappele entre-temps", async () => {
    p.examenMedical.updateMany.mockResolvedValue({ count: 0 });

    expect(await relancerAnnoncesEnRetard(maintenant)).toBe(0);
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });
});
