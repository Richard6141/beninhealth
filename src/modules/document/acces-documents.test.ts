import { describe, expect, it } from "vitest";
import { consentementPermetLeDocument, type ConsentementDocument } from "./acces-documents";

const MAINTENANT = new Date("2026-09-27T12:00:00.000Z");
const HIER = new Date("2026-09-26T12:00:00.000Z");
const DEMAIN = new Date("2026-09-28T12:00:00.000Z");

function consentement(surcharge: Partial<ConsentementDocument> = {}): ConsentementDocument {
  return { statut: "actif", typeAcces: "documents", dateFin: null, ...surcharge };
}

describe("consentementPermetLeDocument", () => {
  it("refuse sans consentement", () => {
    expect(consentementPermetLeDocument(null, "normal", MAINTENANT)).toBe(false);
    expect(consentementPermetLeDocument(null, "sensible", MAINTENANT)).toBe(false);
  });

  it("refuse un consentement revoque ou expire, y compris a la seconde pres", () => {
    for (const niveau of ["normal", "sensible"]) {
      expect(consentementPermetLeDocument(consentement({ statut: "revoque", typeAcces: "dossier_complet" }), niveau, MAINTENANT)).toBe(false);
      expect(consentementPermetLeDocument(consentement({ typeAcces: "dossier_complet", dateFin: HIER }), niveau, MAINTENANT)).toBe(false);
      expect(consentementPermetLeDocument(consentement({ typeAcces: "dossier_complet", dateFin: MAINTENANT }), niveau, MAINTENANT)).toBe(false);
    }
  });

  it("un document normal s'ouvre avec dossier_complet ou documents, pas avec un autre type", () => {
    expect(consentementPermetLeDocument(consentement({ typeAcces: "documents" }), "normal", MAINTENANT)).toBe(true);
    expect(consentementPermetLeDocument(consentement({ typeAcces: "dossier_complet" }), "normal", MAINTENANT)).toBe(true);
    expect(consentementPermetLeDocument(consentement({ typeAcces: "consultations" }), "normal", MAINTENANT)).toBe(false);
  });

  it("un document sensible exige dossier_complet : un consentement limite aux documents ne suffit pas", () => {
    expect(consentementPermetLeDocument(consentement({ typeAcces: "dossier_complet" }), "sensible", MAINTENANT)).toBe(true);
    expect(consentementPermetLeDocument(consentement({ typeAcces: "documents" }), "sensible", MAINTENANT)).toBe(false);
    expect(consentementPermetLeDocument(consentement({ typeAcces: "consultations" }), "sensible", MAINTENANT)).toBe(false);
  });

  it("accepte un consentement dont la fin est dans le futur", () => {
    expect(consentementPermetLeDocument(consentement({ typeAcces: "dossier_complet", dateFin: DEMAIN }), "sensible", MAINTENANT)).toBe(true);
  });

  it("traite un niveau inconnu comme un document ordinaire", () => {
    expect(consentementPermetLeDocument(consentement({ typeAcces: "documents" }), "autre", MAINTENANT)).toBe(true);
  });
});
