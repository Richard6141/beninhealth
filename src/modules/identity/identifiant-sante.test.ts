import { describe, expect, it } from "vitest";
import { genererIdentifiantSante, verifierIdentifiantSante } from "@/modules/identity/identifiant-sante";

describe("genererIdentifiantSante (RG-AUTH-06, RG-GEN-01)", () => {
  it("produit le format BJ-XXXXX-XXXXX-C, alphabet Crockford, controle alphanumerique", () => {
    for (let i = 0; i < 200; i++) {
      expect(genererIdentifiantSante()).toMatch(/^BJ-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]$/);
    }
  });

  it("ne repete pas un identifiant et n'est pas sequentiel", () => {
    const identifiants = Array.from({ length: 500 }, () => genererIdentifiantSante());

    expect(new Set(identifiants).size).toBe(500);
  });

  it("chaque identifiant genere passe sa propre verification", () => {
    for (let i = 0; i < 200; i++) {
      const identifiant = genererIdentifiantSante();
      const verification = verifierIdentifiantSante(identifiant);

      expect(verification).toEqual({ valide: true, canonique: identifiant, ancienFormat: false });
    }
  });
});

describe("verifierIdentifiantSante (RG-GEN-02)", () => {
  const identifiant = genererIdentifiantSante();

  it("accepte minuscules, espaces et tirets absents, avec ou sans le prefixe BJ", () => {
    const sansTirets = identifiant.replace(/-/g, "");

    expect(verifierIdentifiantSante(identifiant.toLowerCase()).canonique).toBe(identifiant);
    expect(verifierIdentifiantSante(sansTirets).canonique).toBe(identifiant);
    expect(verifierIdentifiantSante(sansTirets.slice(2)).canonique).toBe(identifiant);
    expect(verifierIdentifiantSante(`  ${identifiant.replace(/-/g, " ")}  `).canonique).toBe(identifiant);
  });

  it("refuse une faute de frappe : chaque caractere modifie change le controle", () => {
    const corps = identifiant.slice(3).replace(/-/g, "");
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    for (let position = 0; position < corps.length; position++) {
      const remplacant = alphabet[(alphabet.indexOf(corps[position]) + 1) % 32];
      const faux = corps.slice(0, position) + remplacant + corps.slice(position + 1);

      expect(verifierIdentifiantSante(`BJ${faux}`).valide).toBe(false);
    }
  });

  it("refuse une longueur ou un caractere impossibles", () => {
    expect(verifierIdentifiantSante("").valide).toBe(false);
    expect(verifierIdentifiantSante("BJ-1234").valide).toBe(false);
    expect(verifierIdentifiantSante(`${identifiant}X`).valide).toBe(false);
    expect(verifierIdentifiantSante("BJ-UUUUU-UUUUU-0").valide).toBe(false);
  });

  it("reconnait les identifiants historiques sans controle", () => {
    expect(verifierIdentifiantSante("bj-sante-pat-0042")).toEqual({
      valide: true,
      canonique: "BJ-SANTE-PAT-0042",
      ancienFormat: true,
    });
  });

  it("lit I et L comme 1, O comme 0 (confusions de Crockford)", () => {
    const corps = "0123456789";
    const sansConfusion = genererAvecCorps(corps);
    const confondu = sansConfusion.replace("0", "O").replace("1", "I");

    expect(verifierIdentifiantSante(confondu).canonique).toBe(sansConfusion);
  });
});

/** Cherche un identifiant valide pour un corps donne : essaie les caracteres de controle possibles. */
function genererAvecCorps(corps: string): string {
  for (const controle of "0123456789ABCDEFGHJKMNPQRSTVWXYZ") {
    const candidat = `BJ-${corps.slice(0, 5)}-${corps.slice(5)}-${controle}`;

    if (verifierIdentifiantSante(candidat).valide) {
      return candidat;
    }
  }

  throw new Error("Le controle de ce corps est un symbole special : choisir un autre corps.");
}
