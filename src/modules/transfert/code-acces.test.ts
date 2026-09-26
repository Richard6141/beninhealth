import { describe, expect, it } from "vitest";
import {
  LONGUEUR_CODE,
  codeSaisiAuBonFormat,
  bornesJourneeBenin,
  composerMessageCode,
  dureeAccordee,
  empreinteCritere,
  estDureeAcces,
  estMotifAcces,
  genererCodeNumerique,
  libelleDuree,
  normaliserCodeSaisi,
  normaliserNpi,
} from "@/modules/transfert/code-acces";

describe("genererCodeNumerique", () => {
  it("produit toujours LONGUEUR_CODE chiffres, zeros de tete conserves", () => {
    for (let i = 0; i < 500; i++) {
      expect(genererCodeNumerique()).toMatch(new RegExp(`^\\d{${LONGUEUR_CODE}}$`));
    }
  });
});

describe("normaliserCodeSaisi / codeSaisiAuBonFormat", () => {
  it("accepte une dictee avec espaces ou tirets", () => {
    expect(normaliserCodeSaisi("482 913")).toBe("482913");
    expect(normaliserCodeSaisi("482-913")).toBe("482913");
    expect(codeSaisiAuBonFormat("482913")).toBe(true);
  });

  it("refuse un code trop court, trop long ou non numerique", () => {
    expect(codeSaisiAuBonFormat("48291")).toBe(false);
    expect(codeSaisiAuBonFormat("4829133")).toBe(false);
    expect(codeSaisiAuBonFormat("48A913")).toBe(false);
  });
});

describe("normaliserNpi", () => {
  it("retire espaces, points et tirets", () => {
    expect(normaliserNpi("1234 567.890-123")).toBe("1234567890123");
  });

  it("refuse les saisies non numeriques ou de longueur differente de 13", () => {
    expect(normaliserNpi("ABC1234567890")).toBeNull();
    expect(normaliserNpi("123456789012")).toBeNull();
    expect(normaliserNpi("12345678901234")).toBeNull();
    expect(normaliserNpi("")).toBeNull();
  });
});

describe("empreinteCritere", () => {
  it("est deterministe, distincte selon le mode et selon le secret, et ne contient pas la valeur", () => {
    const a = empreinteCritere("npi", "1234567890", "secret-1");
    expect(a).toBe(empreinteCritere("npi", "1234567890", "secret-1"));
    expect(a).not.toBe(empreinteCritere("telephone", "1234567890", "secret-1"));
    expect(a).not.toBe(empreinteCritere("npi", "1234567890", "secret-2"));
    expect(a).not.toContain("1234567890");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("estMotifAcces / estDureeAcces", () => {
  it("ne reconnait que les valeurs du catalogue", () => {
    expect(estMotifAcces("consultation")).toBe(true);
    expect(estMotifAcces("curiosite")).toBe(false);
    expect(estMotifAcces("toString")).toBe(false);
    expect(estDureeAcces(24)).toBe(true);
    expect(estDureeAcces(9999)).toBe(false);
  });
});

describe("libelleDuree", () => {
  it("formate en heures ou en jours", () => {
    expect(libelleDuree(24)).toBe("24 heures");
    expect(libelleDuree(72)).toBe("3 jours");
    expect(libelleDuree(168)).toBe("7 jours");
    expect(libelleDuree(5)).toBe("5 heures");
  });
});

describe("composerMessageCode", () => {
  const message = composerMessageCode({
    code: "482913",
    titreProfessionnel: "Dr.",
    nomProfessionnel: "Awa Sossou",
    etablissementNom: "CNHU-HKM de Cotonou",
    motif: "avis_specialise",
    dureeAccesHeures: 72,
  });

  it("indique qui demande, pour quoi, combien de temps, et porte le code", () => {
    expect(message).toContain("Dr. Awa Sossou (CNHU-HKM de Cotonou)");
    expect(message).toContain("3 jours");
    expect(message).toContain("un avis spécialisé");
    expect(message).toContain("482913");
  });

  it("previent le patient de ne pas donner le code si la demande est inconnue", () => {
    expect(message).toContain("ne donnez ce code à personne");
  });

  it("indique la confirmation en ligne seulement pour un patient qui a un espace patient", () => {
    const base = {
      code: "482913",
      titreProfessionnel: "Dr.",
      nomProfessionnel: "Awa Sossou",
      etablissementNom: "CNHU-HKM",
      motif: "consultation" as const,
      dureeAccesHeures: 24,
    };
    expect(composerMessageCode({ ...base, confirmationEnLigne: true })).toContain("sans donner le code");
    expect(composerMessageCode({ ...base, confirmationEnLigne: false })).not.toContain("sans donner le code");
    expect(composerMessageCode(base)).not.toContain("sans donner le code");
  });

  it("reste sous la limite de 1000 caracteres de Wapy meme avec de longs noms", () => {
    const long = composerMessageCode({
      code: "000000",
      titreProfessionnel: "Dr.",
      nomProfessionnel: "N".repeat(120),
      etablissementNom: "E".repeat(200),
      motif: "hospitalisation",
      dureeAccesHeures: 168,
      confirmationEnLigne: true,
    });
    expect(long.length).toBeLessThan(1000);
  });
});

describe("dureeAccordee", () => {
  it("avec un signal de presence, accorde la duree demandee", () => {
    expect(dureeAccordee(168, true)).toBe(168);
    expect(dureeAccordee(72, true)).toBe(72);
  });

  it("sans signal, plafonne a 24 h et ne rallonge jamais", () => {
    expect(dureeAccordee(168, false)).toBe(24);
    expect(dureeAccordee(72, false)).toBe(24);
    expect(dureeAccordee(24, false)).toBe(24);
    expect(dureeAccordee(12, false)).toBe(12);
  });
});

describe("bornesJourneeBenin", () => {
  it("la journee beninoise (UTC+1) commence a 23h UTC la veille", () => {
    const { debut, fin } = bornesJourneeBenin(new Date("2026-09-26T10:30:00Z"));
    expect(debut.toISOString()).toBe("2026-09-25T23:00:00.000Z");
    expect(fin.toISOString()).toBe("2026-09-26T23:00:00.000Z");
  });

  it("apres 23h UTC on est deja le lendemain au Benin", () => {
    const { debut } = bornesJourneeBenin(new Date("2026-09-26T23:30:00Z"));
    expect(debut.toISOString()).toBe("2026-09-26T23:00:00.000Z");
  });

  it("la fin est exactement 24 h apres le debut et l'instant courant est dedans", () => {
    const instant = new Date("2026-01-01T00:00:00Z");
    const { debut, fin } = bornesJourneeBenin(instant);
    expect(fin.getTime() - debut.getTime()).toBe(24 * 3600_000);
    expect(instant >= debut && instant < fin).toBe(true);
  });
});
