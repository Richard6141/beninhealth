import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { executionTache: { create: vi.fn(), deleteMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import {
  LIBELLES_TACHES,
  LONGUEUR_MAX_MESSAGE,
  messageErreurTronque,
  purgerExecutionsAnciennes,
  suivreExecution,
} from "@/modules/administration/executions-taches";

const p = prisma as unknown as { executionTache: { create: Mock; deleteMany: Mock } };

beforeEach(() => {
  vi.clearAllMocks();
  p.executionTache.create.mockResolvedValue({});
});

describe("suivreExecution (F-ADM-01)", () => {
  it("enregistre une execution reussie avec le nombre traite", async () => {
    await suivreExecution("purge_notifications", async () => 12);

    expect(p.executionTache.create).toHaveBeenCalledWith({
      data: { tache: "purge_notifications", statut: "ok", nombreTraite: 12, message: null },
    });
  });

  it("un travail sans nombre renvoye est enregistre avec nombreTraite null", async () => {
    await suivreExecution("marquage_absences", async () => undefined);

    expect(p.executionTache.create.mock.calls[0][0].data).toMatchObject({ statut: "ok", nombreTraite: null });
  });

  it("enregistre une erreur (message tronque, sans pile) puis relance l'erreur a l'appelant", async () => {
    const erreur = new Error("x".repeat(1000));

    await expect(suivreExecution("relances_laboratoire", async () => Promise.reject(erreur))).rejects.toBe(erreur);

    const donnees = p.executionTache.create.mock.calls[0][0].data;
    expect(donnees).toMatchObject({ tache: "relances_laboratoire", statut: "erreur", nombreTraite: null });
    expect(donnees.message.length).toBe(LONGUEUR_MAX_MESSAGE);
    expect(donnees.message).not.toContain("at ");
  });

  it("un echec d'ecriture du suivi ne fait jamais echouer la tache", async () => {
    p.executionTache.create.mockRejectedValue(new Error("base indisponible"));
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(suivreExecution("purge_notifications", async () => 3)).resolves.toBeUndefined();

    erreurConsole.mockRestore();
  });

  it("un echec d'ecriture du suivi n'empeche pas de relancer l'erreur d'origine", async () => {
    p.executionTache.create.mockRejectedValue(new Error("base indisponible"));
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const erreur = new Error("travail en echec");

    await expect(suivreExecution("purge_notifications", async () => Promise.reject(erreur))).rejects.toBe(erreur);

    erreurConsole.mockRestore();
  });
});

describe("messageErreurTronque", () => {
  it("garde le nom et le message d'une erreur, sans la pile", () => {
    const message = messageErreurTronque(new TypeError("valeur invalide"));

    expect(message).toBe("TypeError: valeur invalide");
  });

  it("accepte une valeur qui n'est pas une erreur", () => {
    expect(messageErreurTronque("texte brut")).toBe("texte brut");
  });
});

describe("purgerExecutionsAnciennes", () => {
  it("supprime les executions de plus de 30 jours et renvoie leur nombre", async () => {
    p.executionTache.deleteMany.mockResolvedValue({ count: 7 });

    const supprimees = await purgerExecutionsAnciennes(new Date("2026-09-27T12:00:00.000Z"));

    expect(supprimees).toBe(7);
    expect(p.executionTache.deleteMany).toHaveBeenCalledWith({ where: { date: { lt: new Date("2026-08-28T12:00:00.000Z") } } });
  });
});

describe("LIBELLES_TACHES", () => {
  it("nomme les 5 taches planifiees suivies", () => {
    expect(Object.keys(LIBELLES_TACHES).sort()).toEqual([
      "marquage_absences",
      "purge_notifications",
      "rappels_rendez_vous",
      "relances_laboratoire",
      "remise_sms_differes",
    ]);
  });
});
