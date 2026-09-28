import { describe, expect, it } from "vitest";
import {
  analyserFichierCsv,
  analyserLigneCsv,
  validerLignesImport,
  validerLigneImportEtablissement,
  type CommuneReferentiel,
} from "@/modules/administration/import-etablissements-regles";
import type { GeometrieTerritoire } from "@/modules/administration/etablissements-regles";

/**
 * Import CSV du referentiel des etablissements (F-ADM-02, P1 du pack).
 * Module pur : parsing CSV et validation ligne par ligne, sans acces base
 * (le referentiel communes/geometries est toujours passe en parametre).
 */

const OUEME_CARRE: GeometrieTerritoire = {
  nom: "Ouémé",
  type: "Polygon",
  coordonnees: [[[2.4, 6.3], [2.5, 6.3], [2.5, 6.4], [2.4, 6.4], [2.4, 6.3]]],
};

const COMMUNES: CommuneReferentiel[] = [
  { id: "com-porto-novo", nom: "Porto-Novo", departementNom: "Ouémé" },
  { id: "com-cotonou", nom: "Cotonou", departementNom: "Littoral" },
];

const ENTETE = "nom,type,capacite,latitude,longitude,departement,commune,services,adresse";
const LIGNE_VALIDE = 'CS Akpakpa,centre_sante,50,6.35,2.45,Ouémé,Porto-Novo,"Consultation;Vaccination",Rue 12';

describe("analyserLigneCsv (RFC 4180 simplifie)", () => {
  it("decoupe des champs simples separes par des virgules", () => {
    expect(analyserLigneCsv("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("garde une virgule a l'interieur d'un champ entre guillemets", () => {
    expect(analyserLigneCsv('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });

  it("un guillemet double a l'interieur d'un champ entre guillemets est un guillemet litteral", () => {
    expect(analyserLigneCsv('a,"il dit ""bonjour""",b')).toEqual(["a", 'il dit "bonjour"', "b"]);
  });

  it("un champ vide entre deux virgules reste vide", () => {
    expect(analyserLigneCsv("a,,c")).toEqual(["a", "", "c"]);
  });
});

describe("analyserFichierCsv", () => {
  it("refuse un fichier vide", () => {
    expect(analyserFichierCsv("").erreurEntete).toContain("vide");
  });

  it("refuse un en-tete sans les colonnes obligatoires", () => {
    const resultat = analyserFichierCsv("nom,type\nCS Akpakpa,centre_sante");
    expect(resultat.erreurEntete).toContain("capacite");
    expect(resultat.lignes).toEqual([]);
  });

  it("accepte l'en-tete quels que soient la casse, les accents et l'ordre des colonnes", () => {
    const resultat = analyserFichierCsv(
      "COMMUNE,Departement,Latitude,Longitude,Capacité,Type,Nom\nPorto-Novo,Ouémé,6.35,2.45,50,centre_sante,CS Akpakpa"
    );
    expect(resultat.erreurEntete).toBeNull();
    expect(resultat.lignes).toHaveLength(1);
    expect(resultat.lignes[0].nom).toBe("CS Akpakpa");
  });

  it("numerote les lignes a partir de 2 (la ligne 1 est l'en-tete)", () => {
    const resultat = analyserFichierCsv(`${ENTETE}\n${LIGNE_VALIDE}\n${LIGNE_VALIDE}`);
    expect(resultat.lignes.map((ligne) => ligne.numeroLigne)).toEqual([2, 3]);
  });

  it("ignore les lignes vides du fichier", () => {
    const resultat = analyserFichierCsv(`${ENTETE}\n\n${LIGNE_VALIDE}\n\n`);
    expect(resultat.lignes).toHaveLength(1);
  });
});

describe("validerLigneImportEtablissement", () => {
  const ligneBase = {
    numeroLigne: 2,
    nom: "CS Akpakpa",
    type: "centre_sante",
    capacite: "50",
    latitude: "6.35",
    longitude: "2.45",
    departement: "Ouémé",
    commune: "Porto-Novo",
  };

  it("accepte une ligne complete et valide", () => {
    const resultat = validerLigneImportEtablissement(ligneBase, COMMUNES, [OUEME_CARRE]);
    expect("erreur" in resultat).toBe(false);
    if ("erreur" in resultat) throw new Error("inattendu");
    expect(resultat).toMatchObject({
      nom: "CS Akpakpa",
      type: "centre_sante",
      capacite: 50,
      latitude: 6.35,
      longitude: 2.45,
      communeId: "com-porto-novo",
    });
  });

  it("refuse un nom trop court", () => {
    const resultat = validerLigneImportEtablissement({ ...ligneBase, nom: "CS" }, COMMUNES, [OUEME_CARRE]);
    expect("erreur" in resultat && resultat.erreur).toContain("nom");
  });

  it("refuse un type hors de la liste traitee", () => {
    const resultat = validerLigneImportEtablissement({ ...ligneBase, type: "clinique" }, COMMUNES, [OUEME_CARRE]);
    expect("erreur" in resultat && resultat.erreur).toContain("Type invalide");
  });

  it("refuse une capacite non entiere, negative ou hors limite", () => {
    for (const capacite of ["-1", "abc", "50.5", "999999999"]) {
      const resultat = validerLigneImportEtablissement({ ...ligneBase, capacite }, COMMUNES, [OUEME_CARRE]);
      expect("erreur" in resultat).toBe(true);
    }
  });

  it("refuse des coordonnees hors du Benin (reutilise verifierCoordonnees)", () => {
    const resultat = validerLigneImportEtablissement({ ...ligneBase, latitude: "48.85", longitude: "2.35" }, COMMUNES, [OUEME_CARRE]);
    expect("erreur" in resultat && resultat.erreur).toContain("hors du Bénin");
  });

  it("refuse une commune introuvable dans le departement indique", () => {
    const resultat = validerLigneImportEtablissement({ ...ligneBase, commune: "Abomey" }, COMMUNES, [OUEME_CARRE]);
    expect("erreur" in resultat && resultat.erreur).toContain("introuvable");
  });

  it("refuse une commune qui existe mais dans un autre departement que celui indique", () => {
    const resultat = validerLigneImportEtablissement({ ...ligneBase, commune: "Cotonou" }, COMMUNES, [OUEME_CARRE]);
    expect("erreur" in resultat && resultat.erreur).toContain("introuvable");
  });

  it("trouve la commune malgre des accents ou une casse differente", () => {
    const resultat = validerLigneImportEtablissement(
      { ...ligneBase, departement: "OUEME", commune: "porto novo" },
      COMMUNES,
      [OUEME_CARRE]
    );
    expect("erreur" in resultat).toBe(false);
  });

  it("refuse un point hors du departement declare (reutilise verifierPointDansDepartement)", () => {
    const resultat = validerLigneImportEtablissement({ ...ligneBase, latitude: "6.9", longitude: "2.9" }, COMMUNES, [OUEME_CARRE]);
    expect("erreur" in resultat && resultat.erreur).toContain("département");
  });

  it("n'invente aucun refus de departement quand son contour est inconnu", () => {
    const resultat = validerLigneImportEtablissement(
      { ...ligneBase, departement: "Littoral", commune: "Cotonou" },
      COMMUNES,
      [OUEME_CARRE] // Aucun contour pour Littoral.
    );
    expect("erreur" in resultat).toBe(false);
  });

  it("accepte les services separes par des points-virgules, sans doublon", () => {
    const resultat = validerLigneImportEtablissement({ ...ligneBase, services: "Consultation;Vaccination;consultation" }, COMMUNES, [OUEME_CARRE]);
    expect("erreur" in resultat).toBe(false);
    if ("erreur" in resultat) throw new Error("inattendu");
    expect(resultat.services).toEqual(["Consultation", "Vaccination"]);
  });

  it("refuse une adresse e-mail invalide", () => {
    const resultat = validerLigneImportEtablissement({ ...ligneBase, emailEtablissement: "pas-un-email" }, COMMUNES, [OUEME_CARRE]);
    expect("erreur" in resultat && resultat.erreur).toContain("e-mail");
  });

  it("derive localisation de l'adresse si fournie, sinon du quartier, sinon du nom de la commune", () => {
    const avecAdresse = validerLigneImportEtablissement({ ...ligneBase, adresse: "Rue 12" }, COMMUNES, [OUEME_CARRE]);
    expect("erreur" in avecAdresse).toBe(false);
    if ("erreur" in avecAdresse) throw new Error("inattendu");
    expect(avecAdresse.localisation).toBe("Rue 12");

    const avecQuartier = validerLigneImportEtablissement({ ...ligneBase, quartierVillage: "Akpakpa" }, COMMUNES, [OUEME_CARRE]);
    if ("erreur" in avecQuartier) throw new Error("inattendu");
    expect(avecQuartier.localisation).toBe("Akpakpa");

    const sansRien = validerLigneImportEtablissement(ligneBase, COMMUNES, [OUEME_CARRE]);
    if ("erreur" in sansRien) throw new Error("inattendu");
    expect(sansRien.localisation).toBe("Porto-Novo");
  });
});

describe("validerLignesImport", () => {
  it("separe les lignes valides des invalides, dans leur ordre d'origine", () => {
    const { lignes } = analyserFichierCsv(
      `${ENTETE}\n${LIGNE_VALIDE}\nMauvaise,type_inconnu,10,6.35,2.45,Ouémé,Porto-Novo,,`
    );

    const rapport = validerLignesImport(lignes, COMMUNES, [OUEME_CARRE]);

    expect(rapport.valides).toHaveLength(1);
    expect(rapport.valides[0].nom).toBe("CS Akpakpa");
    expect(rapport.invalides).toHaveLength(1);
    expect(rapport.invalides[0].numeroLigne).toBe(3);
  });
});
