import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Destinataire reel d'une notification a un Patient (F-RDV-06/07, F-CIT-08) :
 * defaut trouve et corrige, une personne a charge (compte "sans_compte") ne
 * doit jamais recevoir directement une notification, jamais lue. Prend
 * volontairement le seul patientId (reutilisable depuis n'importe quel
 * module appelant, quelle que soit la forme de sa propre requete Patient).
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { patient: { findUnique: vi.fn() }, consentement: { findFirst: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { destinataireNotificationPatient } from "./destinataire-notification-patient";

const prismaMock = prisma as unknown as { patient: { findUnique: Mock }; consentement: { findFirst: Mock } };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("destinataireNotificationPatient", () => {
  it("un compte normal est notifie directement, sans lire Consentement", async () => {
    prismaMock.patient.findUnique.mockResolvedValue({ userId: "user-1", user: { statut: "actif" } });

    const destinataire = await destinataireNotificationPatient("pat-1");

    expect(destinataire).toBe("user-1");
    expect(prismaMock.consentement.findFirst).not.toHaveBeenCalled();
  });

  it("une personne a charge (sans_compte) est routee vers son tuteur (Consentement.acteurAutoriseId)", async () => {
    prismaMock.patient.findUnique.mockResolvedValue({ userId: "user-placeholder", user: { statut: "sans_compte" } });
    prismaMock.consentement.findFirst.mockResolvedValue({ acteurAutoriseId: "user-tuteur" });

    const destinataire = await destinataireNotificationPatient("proche-1");

    expect(destinataire).toBe("user-tuteur");
    expect(prismaMock.consentement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ patientId: "proche-1", statut: "actif" }) })
    );
  });

  it("aucun tuteur actif trouve (cas anormal) : retombe sur le compte placeholder plutot que d'echouer", async () => {
    prismaMock.patient.findUnique.mockResolvedValue({ userId: "user-placeholder", user: { statut: "sans_compte" } });
    prismaMock.consentement.findFirst.mockResolvedValue(null);

    const destinataire = await destinataireNotificationPatient("proche-1");

    expect(destinataire).toBe("user-placeholder");
  });

  it("patient introuvable (cas anormal) : retombe sur l'id tel quel plutot que d'echouer", async () => {
    prismaMock.patient.findUnique.mockResolvedValue(null);

    const destinataire = await destinataireNotificationPatient("pat-inconnu");

    expect(destinataire).toBe("pat-inconnu");
    expect(prismaMock.consentement.findFirst).not.toHaveBeenCalled();
  });
});
