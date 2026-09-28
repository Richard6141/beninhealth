import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  listerJoursEtablissementsATraiter,
  marquerTachesTraitees,
  publierEvenementPilotage,
} from "@/modules/pilotage/file-taches";

/**
 * File de taches de pilotage (F-PIL-07) : publication d'un evenement,
 * regroupement par (jour, etablissement) pour le recalcul, marquage comme
 * traitees. Prisma simule (pas de "use server" ici, module pur cote logique).
 */

function clientSimule() {
  const create: Mock = vi.fn().mockResolvedValue({});
  const findMany: Mock = vi.fn().mockResolvedValue([]);
  const updateMany: Mock = vi.fn().mockResolvedValue({ count: 0 });
  return { client: { tachePilotage: { create, findMany, updateMany } } as never, create, findMany, updateMany };
}

describe("publierEvenementPilotage", () => {
  it("cree une tache avec le type, la date et l'etablissement fournis", async () => {
    const { client, create } = clientSimule();
    const date = new Date("2026-09-28T09:00:00.000Z");

    await publierEvenementPilotage(client, { type: "vaccination", date, etablissementId: "etab-1" });

    expect(create).toHaveBeenCalledWith({ data: { type: "vaccination", date, etablissementId: "etab-1" } });
  });

  it("ecrit etablissementId a null quand absent (evenement systeme, ex. compte_cree)", async () => {
    const { client, create } = clientSimule();
    const date = new Date("2026-09-28T09:00:00.000Z");

    await publierEvenementPilotage(client, { type: "compte_cree", date });

    expect(create).toHaveBeenCalledWith({ data: { type: "compte_cree", date, etablissementId: null } });
  });

  it("accepte les 7 types declares par le pack", async () => {
    const { client, create } = clientSimule();
    const types = [
      "consultation_validee",
      "consultation_retiree",
      "rendez_vous_change",
      "prescription_signee",
      "delivrance",
      "vaccination",
      "compte_cree",
    ] as const;

    for (const type of types) {
      await publierEvenementPilotage(client, { type, date: new Date() });
    }

    expect(create).toHaveBeenCalledTimes(types.length);
  });
});

describe("listerJoursEtablissementsATraiter (RG-PIL-60)", () => {
  it("regroupe par jour civil (UTC) et etablissement, sans doublon", async () => {
    const { client, findMany } = clientSimule();
    findMany.mockResolvedValue([
      { date: new Date("2026-09-28T08:00:00.000Z"), etablissementId: "etab-1" },
      { date: new Date("2026-09-28T20:00:00.000Z"), etablissementId: "etab-1" },
      { date: new Date("2026-09-28T08:00:00.000Z"), etablissementId: "etab-2" },
      { date: new Date("2026-09-29T08:00:00.000Z"), etablissementId: "etab-1" },
    ]);

    const jours = await listerJoursEtablissementsATraiter(client);

    expect(jours).toHaveLength(3);
    expect(jours).toContainEqual({ date: new Date("2026-09-28T00:00:00.000Z"), etablissementId: "etab-1" });
    expect(jours).toContainEqual({ date: new Date("2026-09-28T00:00:00.000Z"), etablissementId: "etab-2" });
    expect(jours).toContainEqual({ date: new Date("2026-09-29T00:00:00.000Z"), etablissementId: "etab-1" });
  });

  it("un etablissement null (evenement systeme) forme son propre groupe, distinct d'une chaine vide accidentelle", async () => {
    const { client, findMany } = clientSimule();
    findMany.mockResolvedValue([{ date: new Date("2026-09-28T08:00:00.000Z"), etablissementId: null }]);

    const jours = await listerJoursEtablissementsATraiter(client);

    expect(jours).toEqual([{ date: new Date("2026-09-28T00:00:00.000Z"), etablissementId: null }]);
  });

  it("ne lit que les taches non traitees", async () => {
    const { client, findMany } = clientSimule();

    await listerJoursEtablissementsATraiter(client);

    expect(findMany).toHaveBeenCalledWith({ where: { traitee: false }, select: { date: true, etablissementId: true } });
  });
});

describe("marquerTachesTraitees", () => {
  it("marque seulement les taches non traitees creees avant la borne donnee", async () => {
    const { client, updateMany } = clientSimule();
    const borne = new Date("2026-09-28T10:00:00.000Z");

    await marquerTachesTraitees(client, borne);

    const appel = updateMany.mock.calls[0][0];
    expect(appel.where).toEqual({ traitee: false, dateCreation: { lte: borne } });
    expect(appel.data.traitee).toBe(true);
    expect(appel.data.dateTraitement).toBeInstanceOf(Date);
  });
});
