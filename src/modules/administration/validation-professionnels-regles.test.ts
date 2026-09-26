import { describe, expect, it } from "vitest";
import {
  DELAI_CIBLE_HEURES_OUVREES,
  attendUneAction,
  delaiCibleDepasse,
  etatVerification,
  heuresOuvreesEcoulees,
} from "./validation-professionnels-regles";

describe("heuresOuvreesEcoulees (RG-ADM-10, week-ends exclus, heure de Porto-Novo)", () => {
  it("compte toutes les heures entre deux instants d'un meme jour de semaine", () => {
    // Lundi 2026-09-28, 08:00 a 20:00 UTC = 12 heures.
    expect(heuresOuvreesEcoulees(new Date("2026-09-28T08:00:00Z"), new Date("2026-09-28T20:00:00Z"))).toBe(12);
  });

  it("n'ajoute rien pour un samedi et un dimanche entiers", () => {
    // Vendredi 2026-09-25 12:00 UTC (13:00 local) au lundi 2026-09-28 12:00 UTC (13:00 local).
    // Vendredi : de 13:00 local a minuit = 11 h ; samedi et dimanche : 0 ; lundi : de minuit a 13:00 = 13 h.
    expect(heuresOuvreesEcoulees(new Date("2026-09-25T12:00:00Z"), new Date("2026-09-28T12:00:00Z"))).toBe(24);
  });

  it("renvoie 0 pour une periode qui tient dans un week-end", () => {
    expect(heuresOuvreesEcoulees(new Date("2026-09-26T08:00:00Z"), new Date("2026-09-27T20:00:00Z"))).toBe(0);
  });

  it("renvoie 0 quand la fin n'est pas apres le debut", () => {
    const instant = new Date("2026-09-28T08:00:00Z");
    expect(heuresOuvreesEcoulees(instant, instant)).toBe(0);
    expect(heuresOuvreesEcoulees(instant, new Date("2026-09-27T08:00:00Z"))).toBe(0);
  });

  it("utilise le jour LOCAL (UTC+1) : 23:30 UTC du vendredi est deja samedi a Porto-Novo", () => {
    // Vendredi 23:30 UTC = samedi 00:30 local jusqu'a samedi 12:00 UTC : tout dans le week-end local.
    expect(heuresOuvreesEcoulees(new Date("2026-09-25T23:30:00Z"), new Date("2026-09-26T12:00:00Z"))).toBe(0);
  });
});

describe("delaiCibleDepasse", () => {
  it(`depasse strictement ${DELAI_CIBLE_HEURES_OUVREES} heures ouvrees`, () => {
    const demande = new Date("2026-09-21T00:00:00Z"); // lundi
    // Jeudi 2026-09-24 00:00 UTC = 72 h ecoulees exactement, pas depasse.
    expect(delaiCibleDepasse(demande, new Date("2026-09-24T00:00:00Z"))).toBe(false);
    expect(delaiCibleDepasse(demande, new Date("2026-09-24T01:00:00Z"))).toBe(true);
  });

  it("une demande faite le vendredi n'est pas en retard le lundi suivant (le week-end ne compte pas)", () => {
    expect(delaiCibleDepasse(new Date("2026-09-25T09:00:00Z"), new Date("2026-09-28T09:00:00Z"))).toBe(false);
  });
});

describe("etatVerification", () => {
  const maintenant = new Date("2026-09-26T12:00:00Z");
  const base = { statutValidation: "valide", validationDecision: null, ordreVerifieLe: null };

  it("jamais verifie : a traiter", () => {
    expect(etatVerification(base, maintenant)).toBe("a_traiter");
  });

  it("verifie depuis moins d'un an : verifie", () => {
    expect(etatVerification({ ...base, validationDecision: "approuve", ordreVerifieLe: new Date("2026-03-01T00:00:00Z") }, maintenant)).toBe("verifie");
  });

  it("verifie depuis plus d'un an : a revalider", () => {
    expect(etatVerification({ ...base, validationDecision: "approuve", ordreVerifieLe: new Date("2025-08-01T00:00:00Z") }, maintenant)).toBe("a_revalider");
  });

  it("complement demande : complement, meme si une verification ancienne existe", () => {
    expect(etatVerification({ ...base, validationDecision: "complement", ordreVerifieLe: new Date("2026-03-01T00:00:00Z") }, maintenant)).toBe("complement");
  });

  it("un refus prime sur tout", () => {
    expect(etatVerification({ statutValidation: "rejete", validationDecision: "complement", ordreVerifieLe: new Date("2026-03-01T00:00:00Z") }, maintenant)).toBe("refuse");
  });

  it("seuls a traiter et a revalider attendent une action", () => {
    expect(attendUneAction("a_traiter")).toBe(true);
    expect(attendUneAction("a_revalider")).toBe(true);
    expect(attendUneAction("complement")).toBe(false);
    expect(attendUneAction("verifie")).toBe(false);
    expect(attendUneAction("refuse")).toBe(false);
  });
});
