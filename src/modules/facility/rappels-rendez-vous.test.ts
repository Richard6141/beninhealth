import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Rappels automatiques de rendez-vous (F-RDV-07, RG-RDV-50). Cible
 * principale de ce fichier : le routage du destinataire pour une personne a
 * charge (defaut trouve et corrige, voir destinataire-notification-patient.ts) -
 * le reste des regles de declenchement (veille 18h, 2h avant, fuseau) est
 * deja verifie en usage reel, non reteste exhaustivement ici.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rendezVous: { findMany: vi.fn(), update: vi.fn() },
    patient: { findUnique: vi.fn() },
    consentement: { findFirst: vi.fn() },
  },
}));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn(async () => undefined) }));
vi.mock("@/modules/administration/executions-taches", () => ({ suivreExecution: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { creerNotification } from "@/modules/notification/creer";
import { envoyerRappelsDus } from "./rappels-rendez-vous";

const prismaMock = prisma as unknown as {
  rendezVous: { findMany: Mock; update: Mock };
  patient: { findUnique: Mock };
  consentement: { findFirst: Mock };
};
const creerNotificationMock = creerNotification as unknown as Mock;

const MAINTENANT = new Date("2026-09-27T17:00:00.000Z"); // 18h00 heure Benin (UTC+1)

function rendezVousDemain(surcharges: Record<string, unknown> = {}) {
  return {
    id: "rdv-1",
    patientId: "pat-1",
    date: new Date("2026-09-28T09:00:00.000Z"),
    dateCreation: new Date("2026-09-20T09:00:00.000Z"),
    rappelVeilleEnvoyeLe: null,
    rappelDeuxHeuresEnvoyeLe: new Date("2026-09-20T09:00:00.000Z"), // deja envoye, pour isoler le rappel de la veille
    etablissement: { nom: "CS Akpakpa" },
    ...surcharges,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  prismaMock.rendezVous.update.mockResolvedValue({});
  prismaMock.patient.findUnique.mockResolvedValue({ userId: "user-pat", user: { statut: "actif" } });
});

describe("envoyerRappelsDus : destinataire (defaut corrige pour une personne a charge)", () => {
  it("un patient normal est prevenu directement", async () => {
    prismaMock.rendezVous.findMany.mockResolvedValue([rendezVousDemain()]);

    const resultat = await envoyerRappelsDus(MAINTENANT);

    expect(resultat.veille).toBe(1);
    expect(creerNotificationMock).toHaveBeenCalledWith(
      "user-pat",
      "rendez_vous_rappel",
      expect.stringContaining("demain"),
      "/app/patient/rendez-vous"
    );
    expect(prismaMock.consentement.findFirst).not.toHaveBeenCalled();
  });

  it("une personne a charge (sans_compte) : le rappel va a son tuteur, jamais au compte placeholder", async () => {
    prismaMock.rendezVous.findMany.mockResolvedValue([rendezVousDemain()]);
    prismaMock.patient.findUnique.mockResolvedValue({ userId: "user-placeholder", user: { statut: "sans_compte" } });
    prismaMock.consentement.findFirst.mockResolvedValue({ acteurAutoriseId: "user-tuteur" });

    const resultat = await envoyerRappelsDus(MAINTENANT);

    expect(resultat.veille).toBe(1);
    expect(creerNotificationMock).toHaveBeenCalledWith(
      "user-tuteur",
      "rendez_vous_rappel",
      expect.anything(),
      "/app/patient/rendez-vous"
    );
    expect(creerNotificationMock).not.toHaveBeenCalledWith("user-placeholder", expect.anything(), expect.anything(), expect.anything());
  });

  it("sans tuteur actif retrouve (cas anormal) : retombe sur le compte placeholder plutot que d'echouer", async () => {
    prismaMock.rendezVous.findMany.mockResolvedValue([rendezVousDemain()]);
    prismaMock.patient.findUnique.mockResolvedValue({ userId: "user-placeholder", user: { statut: "sans_compte" } });
    prismaMock.consentement.findFirst.mockResolvedValue(null);

    const resultat = await envoyerRappelsDus(MAINTENANT);

    expect(resultat.veille).toBe(1);
    expect(creerNotificationMock).toHaveBeenCalledWith("user-placeholder", expect.anything(), expect.anything(), expect.anything());
  });
});
