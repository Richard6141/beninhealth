import { describe, expect, it } from "vitest";
import {
  CODES_GROUPES_SENSIBLES,
  classifierGroupeMaladie,
  estGroupeSensible,
} from "@/modules/pilotage/referentiel-groupes-maladies";

/**
 * RG-PIL-05 : la classification decide quelles consultations sont comptees
 * par etablissement ou seulement par departement. Une erreur ici expose une
 * donnee sensible (ou en cache une), donc chaque cas ci-dessous correspond a
 * un defaut reel de l'ancienne recherche par sous-chaine.
 */
describe("classifierGroupeMaladie", () => {
  it("reconnait les conclusions accentuees (l'ancienne version ne les voyait jamais)", () => {
    expect(classifierGroupeMaladie("Diarrhée aiguë chez l'enfant")?.code).toBe("diarrhee");
    expect(classifierGroupeMaladie("Dépression modérée, suivi")?.code).toBe("trouble_mental");
    expect(classifierGroupeMaladie("Fièvre typhoïde")?.code).toBe("typhoide");
  });

  it("ne classe pas un mot courant comme groupe sensible parce qu'il contient un mot-cle court", () => {
    // "ist" dans "assistance", "consistance", "artiste" ; "hiv" dans "hiver" ; "hta" dans un autre mot.
    expect(classifierGroupeMaladie("Consultation avec assistance de l'infirmier")).toBeNull();
    expect(classifierGroupeMaladie("Rhinite d'hiver")).toBeNull();
    expect(classifierGroupeMaladie("Consistance des selles normale")).toBeNull();
    // "dépistage" contient "ist" : cas courant, ne doit pas etre pris pour une IST.
    expect(classifierGroupeMaladie("Dépistage systématique")).toBeNull();
  });

  it("reconnait un mot-cle court quand il est un mot entier", () => {
    expect(classifierGroupeMaladie("Bilan IST demandé")?.code).toBe("ist");
    expect(classifierGroupeMaladie("HTA sévère, traitement débuté")?.code).toBe("hta");
    expect(classifierGroupeMaladie("Sérologie VIH positive")?.code).toBe("vih");
    // Separateurs usuels ("/") : reste un mot entier, et le resultat est bien sensible.
    expect(classifierGroupeMaladie("IST/VIH : conseil")?.sensible).toBe(true);
  });

  it("garde le paludisme sous toutes ses formes courantes", () => {
    expect(classifierGroupeMaladie("Paludisme simple")?.code).toBe("paludisme");
    expect(classifierGroupeMaladie("Accès palustre")?.code).toBe("paludisme");
    expect(classifierGroupeMaladie("Fièvre paludique")?.code).toBe("paludisme");
    expect(classifierGroupeMaladie("palu")?.code).toBe("paludisme");
  });

  it("garde les pluriels et derives des mots-cles longs", () => {
    expect(classifierGroupeMaladie("Diarrhees chroniques")?.code).toBe("diarrhee");
    expect(classifierGroupeMaladie("Bronchites à répétition")?.code).toBe("ira");
    expect(classifierGroupeMaladie("Infection respiratoire basse")?.code).toBe("ira");
  });

  it("renvoie null pour une conclusion non classifiable", () => {
    expect(classifierGroupeMaladie("Certificat médical")).toBeNull();
    expect(classifierGroupeMaladie("")).toBeNull();
  });
});

describe("groupes sensibles", () => {
  it("liste exactement les six groupes marques sensibles dans le referentiel", () => {
    expect([...CODES_GROUPES_SENSIBLES].sort()).toEqual(
      ["addiction", "interruption_grossesse", "ist", "trouble_mental", "vih", "violence"].sort()
    );
  });

  it("estGroupeSensible distingue sensible et non sensible", () => {
    expect(estGroupeSensible("vih")).toBe(true);
    expect(estGroupeSensible("paludisme")).toBe(false);
    expect(estGroupeSensible("inconnu")).toBe(false);
  });
});
