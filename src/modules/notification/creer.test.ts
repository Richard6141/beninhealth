import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: { create: vi.fn() },
    preferenceNotification: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/modules/notification/sms/envoyer", () => ({ envoyerSms: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { envoyerSms } from "@/modules/notification/sms/envoyer";
import { creerNotification } from "@/modules/notification/creer";
import { categorieDuType } from "@/modules/notification/types-notification";

const p = prisma as unknown as {
  notification: { create: Mock };
  preferenceNotification: { findUnique: Mock };
  user: { findUnique: Mock };
};
const envoyerSmsMock = envoyerSms as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  p.preferenceNotification.findUnique.mockResolvedValue(null);
  p.user.findUnique.mockResolvedValue({ telephone: "+2290100000000" });
});

describe("categorieDuType (F-NOT-03)", () => {
  it("associe les types patient a leur categorie modifiable", () => {
    expect(categorieDuType("rendez_vous_rappel")).toBe("rendez_vous");
    expect(categorieDuType("resultat_examen_disponible")).toBe("resultats_documents");
    expect(categorieDuType("prescription")).toBe("traitements");
    expect(categorieDuType("demande_acces_dossier")).toBe("acces_dossier");
  });

  it("ne devine jamais : type inconnu, professionnel ou categorie verrouillee donnent null", () => {
    expect(categorieDuType("type_inexistant")).toBeNull();
    expect(categorieDuType("acces_urgence")).toBeNull();
    expect(categorieDuType("reference_patient_recue")).toBeNull();
    expect(categorieDuType("resultat_examen_critique")).toBeNull();
  });
});

describe("creerNotification : lecture des preferences a l'emission (F-NOT-03)", () => {
  it("ecrit toujours la notification interne, sans SMS quand aucune preference n'existe", async () => {
    await creerNotification("user-1", "rendez_vous_confirme", "RDV confirme", "/app/patient/rendez-vous");

    expect(p.notification.create).toHaveBeenCalledWith({
      data: { utilisateurId: "user-1", type: "rendez_vous_confirme", message: "RDV confirme", lien: "/app/patient/rendez-vous" },
    });
    expect(envoyerSmsMock).not.toHaveBeenCalled();
  });

  it("depose un SMS quand l'utilisateur a active le SMS pour la categorie du type", async () => {
    p.preferenceNotification.findUnique.mockResolvedValue({ sms: true, email: false });

    await creerNotification("user-1", "rendez_vous_rappel", "Rappel de votre rendez-vous demain");

    expect(p.preferenceNotification.findUnique).toHaveBeenCalledWith({
      where: { utilisateurId_categorie: { utilisateurId: "user-1", categorie: "rendez_vous" } },
    });
    expect(envoyerSmsMock).toHaveBeenCalledWith({
      destinataire: "+2290100000000",
      texte: "Rappel de votre rendez-vous demain",
      categorie: "rendez_vous",
    });
  });

  it("n'envoie pas de SMS quand la preference SMS est desactivee", async () => {
    p.preferenceNotification.findUnique.mockResolvedValue({ sms: false, email: true });

    await creerNotification("user-1", "prescription", "Ordonnance disponible");

    expect(envoyerSmsMock).not.toHaveBeenCalled();
  });

  it("n'ouvre aucun canal externe pour un type sans categorie (categorie verrouillee ou professionnel)", async () => {
    p.preferenceNotification.findUnique.mockResolvedValue({ sms: true, email: true });

    await creerNotification("user-1", "acces_urgence", "Acces d'urgence a votre dossier");

    expect(p.notification.create).toHaveBeenCalled();
    expect(p.preferenceNotification.findUnique).not.toHaveBeenCalled();
    expect(envoyerSmsMock).not.toHaveBeenCalled();
  });

  it("un echec du canal SMS ne fait jamais echouer la notification interne", async () => {
    p.preferenceNotification.findUnique.mockResolvedValue({ sms: true, email: false });
    envoyerSmsMock.mockRejectedValue(new Error("boite d'envoi indisponible"));
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(creerNotification("user-1", "delivrance", "Medicaments delivres")).resolves.toBeUndefined();

    expect(p.notification.create).toHaveBeenCalled();
    erreurConsole.mockRestore();
  });

  it("ne cree pas de SMS pour un utilisateur sans numero de telephone", async () => {
    p.preferenceNotification.findUnique.mockResolvedValue({ sms: true, email: false });
    p.user.findUnique.mockResolvedValue({ telephone: "" });

    await creerNotification("user-1", "delivrance", "Medicaments delivres");

    expect(envoyerSmsMock).not.toHaveBeenCalled();
  });
});
