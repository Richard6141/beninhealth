import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { viderCompteursDebit } from "@/lib/limite-debit";
import {
  ECHECS_MAX_REAUTHENTIFICATION,
  enregistrerEchecReauthentification,
  enregistrerReauthentificationReussie,
  reauthentificationBloquee,
  reauthentificationRecente,
} from "@/modules/prescription/reauthentification";

const MAINTENANT = new Date("2026-09-27T12:00:00.000Z");

beforeEach(() => {
  viderCompteursDebit();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reauthentificationRecente / enregistrerReauthentificationReussie (RG-PRE-30, fenetre de 5 minutes)", () => {
  it("aucun succes enregistre : pas recente", () => {
    expect(reauthentificationRecente("user-1")).toBe(false);
  });

  it("juste apres un succes : recente", () => {
    enregistrerReauthentificationReussie("user-1");
    expect(reauthentificationRecente("user-1")).toBe(true);
  });

  it("moins de 5 minutes apres un succes : toujours recente", () => {
    enregistrerReauthentificationReussie("user-1");
    vi.setSystemTime(new Date(MAINTENANT.getTime() + 4 * 60 * 1000));
    expect(reauthentificationRecente("user-1")).toBe(true);
  });

  it("5 minutes ou plus apres un succes : plus recente", () => {
    enregistrerReauthentificationReussie("user-1");
    vi.setSystemTime(new Date(MAINTENANT.getTime() + 5 * 60 * 1000));
    expect(reauthentificationRecente("user-1")).toBe(false);
  });

  it("le succes d'un autre utilisateur ne compte pas pour celui-ci", () => {
    enregistrerReauthentificationReussie("user-1");
    expect(reauthentificationRecente("user-2")).toBe(false);
  });
});

describe("reauthentificationBloquee / enregistrerEchecReauthentification (RG-PRE-30, 3 echecs)", () => {
  it("jamais bloque avant tout echec", () => {
    expect(reauthentificationBloquee("user-1")).toBe(false);
  });

  it(`pas encore bloque avant le ${ECHECS_MAX_REAUTHENTIFICATION}e echec`, () => {
    for (let i = 0; i < ECHECS_MAX_REAUTHENTIFICATION - 1; i++) {
      const troisieme = enregistrerEchecReauthentification("user-1");
      expect(troisieme).toBe(false);
    }
    expect(reauthentificationBloquee("user-1")).toBe(false);
  });

  it(`le ${ECHECS_MAX_REAUTHENTIFICATION}e echec est signale et bloque les suivants`, () => {
    enregistrerEchecReauthentification("user-1");
    enregistrerEchecReauthentification("user-1");
    const troisieme = enregistrerEchecReauthentification("user-1");

    expect(troisieme).toBe(true);
    expect(reauthentificationBloquee("user-1")).toBe(true);
  });

  it("les echecs d'un utilisateur ne bloquent pas un autre", () => {
    enregistrerEchecReauthentification("user-1");
    enregistrerEchecReauthentification("user-1");
    enregistrerEchecReauthentification("user-1");

    expect(reauthentificationBloquee("user-2")).toBe(false);
  });
});
