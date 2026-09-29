import { describe, expect, it } from "vitest";
import { allergieCorrespondante } from "./referentiel-allergies";
import { DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC } from "@/modules/administration/correspondance-allergie-atc-catalogue";

/**
 * F-PRE-02 / RG-PRE-10 : "La correspondance allergie <-> medicament DOIT se
 * faire sur la DCI et sur la classe [...] grace a la table de correspondance
 * du referentiel (section 18.4)."
 *
 * Critere d'acceptation CA-1 du pack (section F-PRE-02) : "patient
 * allergique a la penicilline + amoxicilline -> alerte bloquante ; la
 * signature sans justification renvoie une erreur 422." Le code HTTP
 * lui-meme est verifie cote actions.ts (code PRE_BLOCKING_ALERT sur le
 * retour de creerPrescriptionAction) ; ce fichier verifie la fonction pure
 * de correspondance qui alimente ce controle.
 */
describe("allergieCorrespondante (F-PRE-02 / RG-PRE-10)", () => {
  it("CA-1 : une allergie declaree a la classe des penicillines bloque une molecule de cette classe meme si son nom differe du terme d'allergie saisi", () => {
    // Le patient declare "Penicilline" (terme generique) ; le medicament
    // prescrit est l'amoxicilline, DCI differente du terme d'allergie, liee
    // uniquement par la classe ATC (J01C, penicillines).
    const amoxicilline = { principeActif: "Amoxicilline", codeAtc: "J01CA04" };

    const allergie = allergieCorrespondante(amoxicilline, ["Penicilline"], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC);

    expect(allergie).toBe("Penicilline");
  });

  it("correspond aussi via un prefixe partage sur un dosage/forme differents de la meme classe", () => {
    const cloxacilline = { principeActif: "Cloxacilline", codeAtc: "J01CF02" };

    expect(allergieCorrespondante(cloxacilline, ["penicilline"], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC)).toBe(
      "penicilline"
    );
  });

  it("la correspondance DCI directe fonctionne toujours, meme sans table de correspondance ATC", () => {
    const amoxicilline = { principeActif: "Amoxicilline", codeAtc: "J01CA04" };

    // Allergie declaree = DCI exacte du medicament : doit correspondre meme
    // avec une table de correspondance ATC vide (aucun argument fourni).
    expect(allergieCorrespondante(amoxicilline, ["Amoxicilline"])).toBe("Amoxicilline");
    // Fonctionne aussi si l'allergie declaree est une sous-chaine de la DCI
    // (ex. "amoxicilline" declare alors que le principeActif complet est
    // "Amoxicilline / Acide clavulanique").
    const amoxiClav = { principeActif: "Amoxicilline / Acide clavulanique", codeAtc: "J01CR02" };
    expect(allergieCorrespondante(amoxiClav, ["amoxicilline"])).toBe("amoxicilline");
  });

  it("aucun faux positif sur une classe non liee a l'allergie declaree", () => {
    // Paracetamol (antalgique, N02BE01) : ni la DCI ni la classe ATC ne
    // correspondent a une allergie "Penicilline".
    const paracetamol = { principeActif: "Paracétamol", codeAtc: "N02BE01" };
    expect(allergieCorrespondante(paracetamol, ["Penicilline"], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC)).toBeNull();

    // Cephalosporine (J01D) n'est pas couverte par l'allergie "Penicilline"
    // (J01C) : les deux classes sont proches mais distinctes.
    const ceftriaxone = { principeActif: "Ceftriaxone", codeAtc: "J01DD04" };
    expect(allergieCorrespondante(ceftriaxone, ["Penicilline"], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC)).toBeNull();
  });

  it("ne correspond pas quand aucune allergie n'est declaree ou quand la liste est vide", () => {
    const amoxicilline = { principeActif: "Amoxicilline", codeAtc: "J01CA04" };
    expect(allergieCorrespondante(amoxicilline, [], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC)).toBeNull();
  });

  it("ignore une entree d'allergie vide dans la liste declaree", () => {
    const amoxicilline = { principeActif: "Amoxicilline", codeAtc: "J01CA04" };
    expect(allergieCorrespondante(amoxicilline, ["  ", "Penicilline"], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC)).toBe(
      "Penicilline"
    );
  });

  it("compare la classe ATC insensible a la casse et aux espaces superflus", () => {
    const amoxicilline = { principeActif: "Amoxicilline", codeAtc: "j01ca04" };
    expect(allergieCorrespondante(amoxicilline, [" PÉNICILLINE "], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC)).toBe(
      " PÉNICILLINE "
    );
  });

  it("un medicament sans code ATC renseigne ne correspond jamais par la classe (seule la DCI directe peut jouer)", () => {
    const medicamentSansAtc = { principeActif: "Autre molecule", codeAtc: "" };
    expect(
      allergieCorrespondante(medicamentSansAtc, ["Penicilline"], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC)
    ).toBeNull();
  });
});
