import { describe, expect, it } from "vitest";
import {
  MESSAGE_MOTIF_NON_SUBSTITUABLE_REQUIS,
  MESSAGE_MOTIF_NON_SUBSTITUABLE_TROP_LONG,
  MOTIF_NON_SUBSTITUABLE_MAX,
  MOTIF_NON_SUBSTITUABLE_MIN,
  validerNonSubstituable,
} from "./non-substituable";

describe("validerNonSubstituable (F-PRE-01)", () => {
  it("ne garde aucun motif quand la case n'est pas cochee", () => {
    expect(validerNonSubstituable(false, "un motif oublie dans le champ")).toEqual({ ok: true, motif: null });
    expect(validerNonSubstituable(false, "")).toEqual({ ok: true, motif: null });
  });

  it("exige un motif d'au moins 10 caracteres utiles quand la case est cochee", () => {
    expect(MOTIF_NON_SUBSTITUABLE_MIN).toBe(10);
    expect(validerNonSubstituable(true, "")).toEqual({ ok: false, error: MESSAGE_MOTIF_NON_SUBSTITUABLE_REQUIS });
    expect(validerNonSubstituable(true, "         x         ")).toEqual({ ok: false, error: MESSAGE_MOTIF_NON_SUBSTITUABLE_REQUIS });
    expect(validerNonSubstituable(true, "123456789")).toEqual({ ok: false, error: MESSAGE_MOTIF_NON_SUBSTITUABLE_REQUIS });
    expect(validerNonSubstituable(true, "1234567890")).toEqual({ ok: true, motif: "1234567890" });
  });

  it("retire les espaces de bord et compacte les espaces internes", () => {
    expect(validerNonSubstituable(true, "  Index   therapeutique \n etroit  ")).toEqual({
      ok: true,
      motif: "Index therapeutique etroit",
    });
  });

  it("refuse plus de 200 caracteres", () => {
    expect(MOTIF_NON_SUBSTITUABLE_MAX).toBe(200);
    expect(validerNonSubstituable(true, "x".repeat(200)).ok).toBe(true);
    expect(validerNonSubstituable(true, "x".repeat(201))).toEqual({ ok: false, error: MESSAGE_MOTIF_NON_SUBSTITUABLE_TROP_LONG });
  });
});
