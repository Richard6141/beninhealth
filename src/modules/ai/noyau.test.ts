import { describe, expect, it } from "vitest";
import { assainirTexte, detecterFuites, type IdentitePatient } from "@/modules/ai/minimisation";
import { extrairePuces, validerReponse } from "@/modules/ai/validation";
import { construireElements, estTexteSensible, moisAnnee, type DonneesDossierIa } from "@/modules/ai/sources";
import {
  choisirFournisseur,
  creerFournisseurFactice,
  ErreurIaIndisponible,
  FournisseurDesactive,
  FournisseurReglesLocales,
} from "@/modules/ai/provider";
import { produireResume } from "@/modules/ai/pipeline";
import type { ElementSource } from "@/modules/ai/regles";

const identite: IdentitePatient = {
  nom: "Agbodjan",
  prenom: "Kossi",
  identifiantSante: "BJ-2026-000042",
  telephone: "+2290197123456",
  autresNoms: ["Dr Assogba"],
};

describe("assainirTexte (RG-IA-04)", () => {
  it("remplace le nom, le prenom et le nom complet par 'le patient', sans casse ni accents", () => {
    expect(assainirTexte("Kossi Agbodjan revu ; AGBODJAN va bien ; kossi est venu", identite)).toBe("le patient revu ; le patient va bien ; le patient est venu");
  });

  it("retire l'identifiant sante, le telephone, le NPI, l'e-mail et un nom de proche connu", () => {
    const texte = "Joindre au +2290197123456 ou 97 12 34 56, id BJ-2026-000042, NPI 1234567890123, k@exemple.bj, orienté par Dr Assogba";

    const resultat = assainirTexte(texte, identite);

    expect(resultat).not.toMatch(/97 ?12 ?34 ?56|BJ-2026|1234567890123|exemple\.bj|Assogba/);
    expect(resultat).toContain("[retiré]");
    expect(detecterFuites(resultat, identite)).toEqual([]);
  });

  it("ne detruit ni une date ISO, ni une tension, ni un resultat, ni une posologie", () => {
    const texte = "Le 2026-09-26 tension 120/80, glycémie 1.5 g/L, 500 mg 3 fois par jour, 7 jours, température 38.5";

    expect(assainirTexte(texte, identite)).toBe(texte);
  });

  it("n'agit pas sur un nom trop court ou trop courant pour etre retire proprement", () => {
    expect(assainirTexte("Bio est un prénom", { ...identite, nom: "Bo", prenom: "Li" })).toBe("Bio est un prénom");
  });

  it("ne coupe pas un mot qui contient le nom (mot entier seulement)", () => {
    expect(assainirTexte("Kossiwa est un autre prénom", identite)).toBe("Kossiwa est un autre prénom");
  });
});

describe("detecterFuites (CA-2)", () => {
  it("detecte chaque famille de donnee personnelle restante", () => {
    expect(detecterFuites("Kossi", identite)).toContain("nom:Kossi");
    expect(detecterFuites("BJ-2026-000042", identite)).toContain("identifiant_sante");
    expect(detecterFuites("au 0197123456", identite)).toContain("telephone_motif");
    expect(detecterFuites("NPI 1234567890123", identite)).toContain("npi");
    expect(detecterFuites("a@b.bj", identite)).toContain("email");
  });

  it("un texte medical ordinaire ne declenche rien", () => {
    expect(detecterFuites("Consultation de mars 2026 : fièvre, paludisme simple, tension 120/80 [S3]", identite)).toEqual([]);
  });
});

const elements: ElementSource[] = [
  { etiquette: "S1", type: "allergie", texte: "pénicilline", date: null },
  { etiquette: "S2", type: "traitement", texte: "Prescrit en mars 2026 : Amlodipine 5 mg, 1 par jour, 30 jours", date: null },
  { etiquette: "S3", type: "resultat_anormal", texte: "Glycémie à jeun, mai 2026 : Glycémie à jeun 1.8 g/L (H)", date: null },
];

describe("validerReponse (RG-IA-06)", () => {
  it("garde les puces qui citent une source existante", () => {
    const resultat = validerReponse("- Allergie à la pénicilline [S1]\n- Traitement par Amlodipine 5 mg [S2]", elements);

    expect(resultat.disponible).toBe(true);
    expect(resultat.puces.map((puce) => puce.sources)).toEqual([["S1"], ["S2"]]);
    expect(resultat.puces[0].texte).toBe("Allergie à la pénicilline");
  });

  it("supprime une puce sans etiquette, avec une etiquette inconnue, ou avec un nombre absent de la source", () => {
    const resultat = validerReponse(
      ["- Puce sans source", "- Puce avec source inconnue [S9]", "- Glycémie à 2.4 g/L [S3]", "- Glycémie à 1,8 g/L [S3]", "- Allergie [S1]"].join("\n"),
      elements
    );

    expect(resultat.puces.map((puce) => puce.texte)).toEqual(["Glycémie à 1,8 g/L", "Allergie"]);
    expect(resultat.pucesSupprimees).toBe(3);
    expect(resultat.pucesLues).toBe(5);
  });

  it("le nombre de l'etiquette elle-meme n'est pas compte comme une donnee", () => {
    expect(validerReponse("- Allergie [S1]\n- Traitement [S2]", elements).disponible).toBe(true);
  });

  it("moins de 2 puces conformes : resume indisponible", () => {
    const resultat = validerReponse("- Une seule puce valide [S1]\n- Sans source", elements);

    expect(resultat.disponible).toBe(false);
    expect(resultat.puces).toHaveLength(1);
  });

  it("ne lit que 8 puces au plus", () => {
    const reponse = Array.from({ length: 12 }, () => "- Allergie [S1]").join("\n");

    expect(validerReponse(reponse, elements).pucesLues).toBe(8);
  });

  it("extrairePuces ignore les lignes qui ne sont pas des puces", () => {
    expect(extrairePuces("Voici le résumé :\n- un\n* deux\n• trois\ntexte libre\n-collé")).toEqual(["un", "deux", "trois"]);
  });
});

function dossier(surcharges: Partial<DonneesDossierIa> = {}): DonneesDossierIa {
  return {
    dateReference: new Date("2026-09-27T12:00:00.000Z"),
    age: 40,
    sexe: "F",
    allergies: [],
    antecedents: [],
    maladiesChroniques: [],
    traitements: [],
    consultations: [],
    examens: [],
    vaccinations: [],
    ...surcharges,
  };
}

describe("construireElements : filtres et minimisation", () => {
  it("etiquette S1, S2... dans l'ordre et ecarte les donnees de plus de 24 mois", () => {
    const { elements: construits } = construireElements(
      dossier({
        allergies: ["pénicilline"],
        vaccinations: [
          { date: new Date("2026-05-10T00:00:00Z"), vaccin: "Rougeole", numeroDose: 1 },
          { date: new Date("2023-01-10T00:00:00Z"), vaccin: "Polio ancienne", numeroDose: 3 },
        ],
      }),
      identite
    );

    expect(construits.map((element) => element.etiquette)).toEqual(["S1", "S2", "S3"]);
    expect(construits.map((element) => element.texte).join(" ")).not.toContain("Polio ancienne");
  });

  it("ecarte les elements sensibles (RG-IA-05) et les compte sans jamais les garder", () => {
    const { elements: construits, exclusSensibles } = construireElements(
      dossier({
        antecedents: ["sérologie VIH positive", "appendicectomie"],
        consultations: [{ date: new Date("2026-06-10T00:00:00Z"), motif: "anxiété", conclusion: "dépression", tensionSystolique: 120, tensionDiastolique: 80 }],
        examens: [{ date: new Date("2026-06-10T00:00:00Z"), typeExamen: "Sérologie VIH", sensible: true, parametres: [{ libelle: "VIH", valeur: 1, unite: "index", indicateur: "H" }] }],
      }),
      identite
    );

    const texte = construits.map((element) => element.texte).join(" ").toLowerCase();
    expect(texte).toContain("appendicectomie");
    expect(texte).not.toMatch(/vih|depress|dépress|anxi/);
    expect(exclusSensibles).toBe(3);
  });

  it("ne propose que les resultats anormaux, jamais les normaux", () => {
    const { elements: construits } = construireElements(
      dossier({
        examens: [
          {
            date: new Date("2026-06-10T00:00:00Z"),
            typeExamen: "Bilan",
            sensible: false,
            parametres: [
              { libelle: "Glycémie", valeur: 0.9, unite: "g/L", indicateur: "N" },
              { libelle: "Créatinine", valeur: 20, unite: "mg/L", indicateur: "H" },
            ],
          },
        ],
      }),
      identite
    );

    const resultats = construits.filter((element) => element.type === "resultat_anormal");
    expect(resultats).toHaveLength(1);
    expect(resultats[0].texte).toContain("Créatinine");
  });

  it("signale l'absence de mesure de tension et une derniere mesure ancienne", () => {
    const sans = construireElements(dossier(), identite).elements.find((element) => element.type === "information_manquante");
    expect(sans?.texte).toContain("Aucune mesure de tension");

    const ancienne = construireElements(
      dossier({ consultations: [{ date: new Date("2025-05-10T00:00:00Z"), motif: "contrôle", conclusion: "ras", tensionSystolique: 130, tensionDiastolique: 85 }] }),
      identite
    ).elements.find((element) => element.type === "information_manquante");
    expect(ancienne?.texte).toContain("il y a 16 mois");

    const recente = construireElements(
      dossier({ consultations: [{ date: new Date("2026-07-10T00:00:00Z"), motif: "contrôle", conclusion: "ras", tensionSystolique: 130, tensionDiastolique: 85 }] }),
      identite
    ).elements.find((element) => element.type === "information_manquante");
    expect(recente).toBeUndefined();
  });

  it("assainit le texte libre des consultations", () => {
    const { elements: construits } = construireElements(
      dossier({ consultations: [{ date: new Date("2026-06-10T00:00:00Z"), motif: "suivi", conclusion: "Kossi Agbodjan stable, joindre +2290197123456", tensionSystolique: 120, tensionDiastolique: 80 }] }),
      identite
    );

    expect(detecterFuites(construits.map((element) => element.texte).join("\n"), identite)).toEqual([]);
  });

  it("estTexteSensible attrape aussi 'interruption volontaire de grossesse' (plus strict que les indicateurs)", () => {
    expect(estTexteSensible("interruption volontaire de grossesse")).toBe(true);
    expect(estTexteSensible("séropositivité")).toBe(true);
    expect(estTexteSensible("hypertension artérielle")).toBe(false);
  });

  it("moisAnnee formate en francais, en UTC", () => {
    expect(moisAnnee(new Date("2026-09-27T12:00:00Z"))).toBe("septembre 2026");
  });
});

describe("fournisseurs", () => {
  it("le fournisseur desactive refuse tout appel", async () => {
    await expect(FournisseurDesactive.generate({ system: "", input: "", maxTokens: 1 })).rejects.toBeInstanceOf(ErreurIaIndisponible);
  });

  it("un nom de fournisseur inconnu ou absent retombe sur desactive (echec ferme)", () => {
    expect(choisirFournisseur(undefined)).toBe(FournisseurDesactive);
    expect(choisirFournisseur("openai")).toBe(FournisseurDesactive);
    expect(choisirFournisseur("regles_locales")).toBe(FournisseurReglesLocales);
  });

  it("les regles locales ne lisent que l'entree : allergies d'abord, une etiquette par puce, 8 puces au plus", async () => {
    const entree = ["Le patient est une femme de 40 ans.", "Éléments :", ...Array.from({ length: 12 }, (_, i) => `[S${i + 1}] ${i === 5 ? "Allergie" : "Vaccination"} : element ${i + 1}`)].join("\n");

    const reponse = await FournisseurReglesLocales.generate({ system: "", input: entree, maxTokens: 100 });
    const lignes = reponse.texte.split("\n");

    expect(lignes).toHaveLength(8);
    expect(lignes[0]).toBe("- element 6 [S6]");
    expect(reponse.modele).toBe("regles-locales-v1");
  });
});

describe("produireResume (pipeline)", () => {
  const donnees = dossier({
    allergies: ["pénicilline"],
    maladiesChroniques: ["hypertension artérielle"],
    traitements: [{ date: new Date("2026-03-10T00:00:00Z"), lignes: [{ medicament: "Amlodipine 5 mg", posologie: "1 comprimé par jour", dureeJours: 30 }] }],
  });

  it("produit un resume sourcé avec les regles locales", async () => {
    const resultat = await produireResume(donnees, identite, FournisseurReglesLocales);

    expect(resultat.statut).toBe("ok");
    expect(resultat.puces.length).toBeGreaterThanOrEqual(2);
    expect(resultat.puces.every((puce) => puce.sources.length > 0)).toBe(true);
    expect(resultat.sourcesCitees.length).toBeGreaterThan(0);
    expect(resultat.entreeEnvoyee).toContain("Le patient est une femme de 40 ans.");
  });

  it("le fournisseur desactive donne 'indisponible' sans erreur", async () => {
    const resultat = await produireResume(donnees, identite, FournisseurDesactive);

    expect(resultat.statut).toBe("indisponible");
    expect(resultat.puces).toEqual([]);
  });

  it("un fournisseur qui invente des puces sans source ou avec un nombre faux est filtre", async () => {
    const menteur = creerFournisseurFactice("- Le patient a un diabète\n- Allergie à la pénicilline [S1]\n- Traitement par Amlodipine 10 mg [S3]\n- Hypertension artérielle [S2]");

    const resultat = await produireResume(donnees, identite, menteur);

    expect(resultat.puces.map((puce) => puce.texte)).toEqual(["Allergie à la pénicilline", "Hypertension artérielle"]);
    expect(resultat.pucesSupprimees).toBe(2);
  });

  it("une erreur inattendue du fournisseur remonte (elle n'est pas confondue avec une indisponibilite)", async () => {
    const casse = { nom: "casse", generate: async () => Promise.reject(new Error("panne reseau")) };

    await expect(produireResume(donnees, identite, casse)).rejects.toThrow("panne reseau");
  });
});
