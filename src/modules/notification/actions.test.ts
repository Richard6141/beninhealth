import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { notification: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getMesNotifications, getNombreNotificationsNonLues, marquerToutesLuesAction } from "@/modules/notification/actions";
import { conditionEspace, espaceDesRoles, espaceDuLien, TAILLE_PAGE_NOTIFICATIONS } from "@/modules/notification/espace-notification";

const p = prisma as unknown as { notification: { findMany: Mock; count: Mock; updateMany: Mock } };
const getSessionMock = getSession as unknown as Mock;

function ligne(index: number, surcharges: Record<string, unknown> = {}) {
  return { id: `n-${index}`, type: "rendez_vous_confirme", message: `Message ${index}`, lien: "/app/patient/rendez-vous", lu: false, date: new Date(Date.UTC(2026, 8, 27, 12, 0, 0) - index * 60000), ...surcharges };
}

beforeEach(() => {
  vi.resetAllMocks();
  getSessionMock.mockResolvedValue({ userId: "u-1", roles: ["patient"] });
  p.notification.findMany.mockResolvedValue([]);
  p.notification.count.mockResolvedValue(0);
  p.notification.updateMany.mockResolvedValue({ count: 0 });
});

describe("espace d'une notification (F-NOT-01)", () => {
  it("l'espace actif vient de la session : un seul role, sinon aucun filtre", () => {
    expect(espaceDesRoles(["patient"])).toBe("patient");
    expect(espaceDesRoles(["medecin"])).toBe("professionnel");
    expect(espaceDesRoles(["admin_national"])).toBe("professionnel");
    expect(espaceDesRoles(["patient", "medecin"])).toBeNull();
    expect(espaceDesRoles([])).toBeNull();
  });

  it("le lien dit l'espace : patient, professionnel, ou commun", () => {
    expect(espaceDuLien("/app/patient/rendez-vous")).toBe("patient");
    expect(espaceDuLien("/app/patient")).toBe("patient");
    expect(espaceDuLien("/app/medecin/laboratoire")).toBe("professionnel");
    expect(espaceDuLien("/app/etablissement/demandes")).toBe("professionnel");
    expect(espaceDuLien("/app/ministere/comptes")).toBe("professionnel");
    expect(espaceDuLien("/app/securite")).toBeNull();
    expect(espaceDuLien("/app/notifications")).toBeNull();
    expect(espaceDuLien(null)).toBeNull();
    // Un prefixe voisin n'est pas un espace : /app/patients n'est pas /app/patient.
    expect(espaceDuLien("/app/patientele")).toBeNull();
  });

  it("aucune condition sans espace choisi ; sinon les notifications sans lien restent visibles", () => {
    expect(conditionEspace(null)).toEqual({});
    expect(conditionEspace("patient")).toEqual({
      OR: [
        { lien: null },
        { AND: [{ NOT: { lien: { startsWith: "/app/medecin" } } }, { NOT: { lien: { startsWith: "/app/etablissement" } } }, { NOT: { lien: { startsWith: "/app/ministere" } } }] },
      ],
    });
    expect(conditionEspace("professionnel")).toEqual({ OR: [{ lien: null }, { AND: [{ NOT: { lien: { startsWith: "/app/patient" } } }] }] });
  });
});

describe("getMesNotifications : pages et curseur", () => {
  it("sans session : rien, sans requete", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getMesNotifications()).toEqual({ notifications: [], curseurSuivant: null });
    expect(p.notification.findMany).not.toHaveBeenCalled();
  });

  it("premiere page : demande une ligne de plus pour savoir s'il en reste, renvoie le curseur de la derniere affichee", async () => {
    p.notification.findMany.mockResolvedValue(Array.from({ length: TAILLE_PAGE_NOTIFICATIONS + 1 }, (_, index) => ligne(index)));

    const page = await getMesNotifications();

    expect(page.notifications).toHaveLength(TAILLE_PAGE_NOTIFICATIONS);
    expect(page.curseurSuivant).toBe(`n-${TAILLE_PAGE_NOTIFICATIONS - 1}`);
    const requete = p.notification.findMany.mock.calls[0][0];
    expect(requete.take).toBe(TAILLE_PAGE_NOTIFICATIONS + 1);
    expect(requete.orderBy).toEqual([{ date: "desc" }, { id: "desc" }]);
    expect(requete.cursor).toBeUndefined();
  });

  it("derniere page : pas de curseur", async () => {
    p.notification.findMany.mockResolvedValue([ligne(1), ligne(2)]);

    const page = await getMesNotifications();

    expect(page.notifications).toHaveLength(2);
    expect(page.curseurSuivant).toBeNull();
  });

  it("page suivante : repart apres le curseur, toujours borne aux notifications de l'utilisateur connecte", async () => {
    await getMesNotifications("n-29");

    const requete = p.notification.findMany.mock.calls[0][0];
    expect(requete.cursor).toEqual({ id: "n-29" });
    expect(requete.skip).toBe(1);
    expect(requete.where.utilisateurId).toBe("u-1");
  });

  it("dans l'espace patient, les liens professionnels sont exclus de la requete", async () => {
    await getMesNotifications();

    expect(p.notification.findMany.mock.calls[0][0].where).toMatchObject({ utilisateurId: "u-1", ...conditionEspace("patient") });
  });

  it("un compte a plusieurs espaces ouverts voit tout", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-1", roles: ["patient", "medecin"] });

    await getMesNotifications();

    expect(p.notification.findMany.mock.calls[0][0].where).toEqual({ utilisateurId: "u-1" });
  });
});

describe("compteur et lecture en masse dans l'espace actif", () => {
  it("le compteur de la cloche ne compte que l'espace actif", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-1", roles: ["medecin"] });
    p.notification.count.mockResolvedValue(3);

    expect(await getNombreNotificationsNonLues()).toBe(3);

    expect(p.notification.count).toHaveBeenCalledWith({ where: { utilisateurId: "u-1", lu: false, ...conditionEspace("professionnel") } });
  });

  it("'tout marquer comme lu' ne touche que l'espace actif et l'utilisateur connecte", async () => {
    await marquerToutesLuesAction();

    expect(p.notification.updateMany).toHaveBeenCalledWith({
      where: { utilisateurId: "u-1", lu: false, ...conditionEspace("patient") },
      data: { lu: true },
    });
  });

  it("sans session : aucune ecriture", async () => {
    getSessionMock.mockResolvedValue(null);

    await marquerToutesLuesAction();

    expect(p.notification.updateMany).not.toHaveBeenCalled();
    expect(await getNombreNotificationsNonLues()).toBe(0);
  });
});
