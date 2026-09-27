import { describe, expect, it } from "vitest";
import {
  MODULES_METIER,
  filtrerNavigationParModules,
  libelleModule,
  type EtatModules,
} from "@/modules/administration/modules-actifs";
import { ACTIVE_PAR_DEFAUT, CLES_FONCTIONNALITES } from "@/modules/administration/fonctionnalites-catalogue";

const navigation = [
  { label: "Tableau de bord", href: "/app/medecin" },
  { label: "Pharmacie", href: "/app/medecin/pharmacie" },
  { label: "Historique des delivrances", href: "/app/medecin/pharmacie/historique" },
  { label: "Laboratoire", href: "/app/medecin/laboratoire" },
  { label: "Suivi communautaire", href: "/app/medecin/communautaire" },
  { label: "Rendez-vous", href: "/app/medecin/rendez-vous" },
  { label: "Mes examens", href: "/app/medecin/examens" },
];

const tousActifs: EtatModules = { "pharmacy.module": true, "lab.module": true, "community.module": true };

describe("filtrerNavigationParModules (F-ADM-07)", () => {
  it("garde toute la navigation quand les 3 modules sont actifs", () => {
    expect(filtrerNavigationParModules(navigation, tousActifs)).toEqual(navigation);
  });

  it("retire la pharmacie et ses sous-pages quand pharmacy.module est inactif", () => {
    const resultat = filtrerNavigationParModules(navigation, { ...tousActifs, "pharmacy.module": false });

    expect(resultat.map((element) => element.href)).not.toContain("/app/medecin/pharmacie");
    expect(resultat.map((element) => element.href)).not.toContain("/app/medecin/pharmacie/historique");
    expect(resultat.map((element) => element.href)).toContain("/app/medecin/laboratoire");
  });

  it("retire le laboratoire quand lab.module est inactif, sans toucher aux examens du medecin", () => {
    const resultat = filtrerNavigationParModules(navigation, { ...tousActifs, "lab.module": false });

    expect(resultat.map((element) => element.href)).not.toContain("/app/medecin/laboratoire");
    expect(resultat.map((element) => element.href)).toContain("/app/medecin/examens");
  });

  it("retire le suivi communautaire quand community.module est inactif", () => {
    const resultat = filtrerNavigationParModules(navigation, { ...tousActifs, "community.module": false });

    expect(resultat.map((element) => element.href)).not.toContain("/app/medecin/communautaire");
    expect(resultat).toHaveLength(navigation.length - 1);
  });

  it("ne confond pas un prefixe voisin (pharmaciens n'est pas la pharmacie)", () => {
    const voisins = [{ label: "X", href: "/app/medecin/pharmacies-partenaires" }];

    expect(filtrerNavigationParModules(voisins, { ...tousActifs, "pharmacy.module": false })).toEqual(voisins);
  });

  it("tout inactif ne garde que ce qui n'appartient a aucun module", () => {
    const resultat = filtrerNavigationParModules(navigation, {
      "pharmacy.module": false,
      "lab.module": false,
      "community.module": false,
    });

    expect(resultat.map((element) => element.label)).toEqual(["Tableau de bord", "Rendez-vous", "Mes examens"]);
  });
});

describe("modules metier et defauts du catalogue", () => {
  it("les 3 modules sont des cles du catalogue, actives par defaut", () => {
    for (const definition of MODULES_METIER) {
      expect(CLES_FONCTIONNALITES).toContain(definition.cle);
      expect(ACTIVE_PAR_DEFAUT[definition.cle]).toBe(true);
    }
  });

  it("toute autre fonctionnalite (IA, SMS reel, FHIR, NPI, demo, ordre) est desactivee par defaut", () => {
    const modules = new Set<string>(MODULES_METIER.map((definition) => definition.cle));
    for (const cle of CLES_FONCTIONNALITES) {
      if (!modules.has(cle)) expect(ACTIVE_PAR_DEFAUT[cle]).toBe(false);
    }
  });

  it("chaque cle du catalogue a un defaut explicite", () => {
    expect(Object.keys(ACTIVE_PAR_DEFAUT).sort()).toEqual([...CLES_FONCTIONNALITES].sort());
  });

  it("libelleModule renvoie le nom lisible", () => {
    expect(libelleModule("lab.module")).toBe("laboratoire");
  });
});
