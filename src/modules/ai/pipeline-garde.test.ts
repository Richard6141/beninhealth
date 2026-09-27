import { describe, expect, it, vi } from "vitest";

// L'assainissement est neutralise : seul le garde-fou final (detecterFuites) peut alors arreter la requete.
vi.mock("@/modules/ai/minimisation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/ai/minimisation")>();
  return { ...original, assainirTexte: (texte: string) => texte };
});

import { produireResume } from "@/modules/ai/pipeline";
import type { DonneesDossierIa } from "@/modules/ai/sources";

const identite = { nom: "Agbodjan", prenom: "Kossi", identifiantSante: "BJ-2026-000042", telephone: "+2290197123456" };

const donnees: DonneesDossierIa = {
  dateReference: new Date("2026-09-27T12:00:00.000Z"),
  age: 40,
  sexe: "M",
  allergies: ["pénicilline"],
  antecedents: [],
  maladiesChroniques: ["hypertension artérielle"],
  traitements: [],
  consultations: [],
  examens: [],
  vaccinations: [],
};

describe("garde-fou de fuite avant tout appel (CA-2)", () => {
  it("un nom qui a echappe a l'assainissement bloque la requete : le fournisseur n'est jamais appele", async () => {
    let appele = false;
    const espion = { nom: "espion", generate: async () => { appele = true; return { texte: "", modele: "x" }; } };

    const resultat = await produireResume({ ...donnees, allergies: ["pénicilline chez Kossi"] }, identite, espion);

    expect(resultat.statut).toBe("bloque");
    expect(appele).toBe(false);
    expect(resultat.puces).toEqual([]);
  });

  it("un identifiant sante ou un telephone restant bloque aussi la requete", async () => {
    let appels = 0;
    const espion = { nom: "espion", generate: async () => { appels += 1; return { texte: "", modele: "x" }; } };

    expect((await produireResume({ ...donnees, antecedents: ["dossier BJ-2026-000042"] }, identite, espion)).statut).toBe("bloque");
    expect((await produireResume({ ...donnees, antecedents: ["joindre 0197123456"] }, identite, espion)).statut).toBe("bloque");
    expect(appels).toBe(0);
  });

  it("sans fuite, le fournisseur est appele normalement", async () => {
    let appele = false;
    const espion = { nom: "espion", generate: async () => { appele = true; return { texte: "- Allergie [S1]\n- Hypertension [S2]", modele: "x" }; } };

    const resultat = await produireResume(donnees, identite, espion);

    expect(appele).toBe(true);
    expect(resultat.statut).toBe("ok");
  });
});
