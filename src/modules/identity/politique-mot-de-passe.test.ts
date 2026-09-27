import { describe, expect, it } from "vitest";
import {
  LONGUEUR_MAX_MOT_DE_PASSE,
  LONGUEUR_MIN_CITOYEN,
  LONGUEUR_MIN_PROFESSIONNEL,
  evaluerMotDePasse,
} from "@/modules/identity/politique-mot-de-passe";

const citoyen = { minimum: LONGUEUR_MIN_CITOYEN };
const professionnel = { minimum: LONGUEUR_MIN_PROFESSIONNEL };

describe("longueur (RG-AUTH-02, RG-AUTH-43)", () => {
  it("un citoyen : 8 caracteres au moins, 128 au plus", () => {
    expect(evaluerMotDePasse("Tr0mpette", citoyen)).toBeNull();
    expect(evaluerMotDePasse("Kz7pWqx", citoyen)).toMatch(/au moins 8/);
    expect(evaluerMotDePasse("Kz7pWqxL".repeat(17), citoyen)).toMatch(/128/);
    expect(evaluerMotDePasse("a".repeat(LONGUEUR_MAX_MOT_DE_PASSE), citoyen)).not.toMatch(/128/);
  });

  it("un professionnel : 12 caracteres au moins", () => {
    expect(evaluerMotDePasse("Tr0mpette-du-jour", professionnel)).toBeNull();
    expect(evaluerMotDePasse("Tr0mpette", professionnel)).toMatch(/au moins 12/);
  });

  it("aucune regle de composition : ni majuscule, ni chiffre, ni symbole exiges", () => {
    expect(evaluerMotDePasse("chevaltriste", citoyen)).toBeNull();
    expect(evaluerMotDePasse("lundimatinpluvieux", professionnel)).toBeNull();
  });
});

describe("mots de passe courants", () => {
  it.each(["password", "Password", "PASSWORD", "motdepasse", "azertyuiop", "12345678", "qwertyui", "benin2024", "Benin2026", "password123", "Admin123!", "Cotonou2020"])(
    "refuse %s",
    (motDePasse) => {
      expect(evaluerMotDePasse(motDePasse, citoyen)).toMatch(/trop facile/);
    }
  );

  it("refuse les suites et les repetitions", () => {
    expect(evaluerMotDePasse("abcdefgh", citoyen)).toMatch(/trop facile/);
    expect(evaluerMotDePasse("87654321", citoyen)).toMatch(/trop facile/);
    expect(evaluerMotDePasse("aaaaaaaa", citoyen)).toMatch(/trop facile/);
    expect(evaluerMotDePasse("abababab", citoyen)).toMatch(/trop facile/);
  });

  it("accepte un mot courant integre a une vraie phrase de passe", () => {
    expect(evaluerMotDePasse("le benin gagne demain", citoyen)).toBeNull();
    expect(evaluerMotDePasse("Sante2026Benin", citoyen)).toBeNull();
  });
});

describe("informations personnelles", () => {
  const contexte = { telephone: "+22901 97 12 34 56", dateNaissance: new Date("1990-04-23T00:00:00Z"), email: "kofi.adjovi@exemple.bj" };

  it("refuse le numero de telephone, en entier ou sans indicatif", () => {
    expect(evaluerMotDePasse("chat0197123456", { ...citoyen, contexte })).toMatch(/telephone/);
    expect(evaluerMotDePasse("97123456poule", { ...citoyen, contexte })).toMatch(/telephone/);
  });

  it("refuse la date de naissance sous ses formes courantes", () => {
    for (const forme of ["23041990", "19900423", "230490", "04231990"]) {
      expect(evaluerMotDePasse(`zebre${forme}`, { ...citoyen, contexte })).toMatch(/date de naissance/);
    }
  });

  it("refuse la partie locale de l'adresse e-mail", () => {
    expect(evaluerMotDePasse("mon-kofi.adjovi-2", { ...citoyen, contexte })).toMatch(/e-mail/);
  });

  it("accepte un mot de passe sans lien avec ces informations", () => {
    expect(evaluerMotDePasse("girafe-bleue-42x", { ...citoyen, contexte })).toBeNull();
  });

  it("sans contexte, aucune de ces verifications n'a lieu", () => {
    expect(evaluerMotDePasse("chat0197123456", citoyen)).toBeNull();
  });
});
