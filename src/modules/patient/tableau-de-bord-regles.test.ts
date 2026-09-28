import { describe, expect, it } from "vitest";
import {
  lienTableauDeBord,
  lirePersonneDemandee,
  ongletsPersonnes,
  rendezVousAVenir,
} from "./tableau-de-bord-regles";

describe("lirePersonneDemandee (selecteur de personne, F-CIT-02)", () => {
  it("renvoie null sans parametre : tableau de bord du titulaire", () => {
    expect(lirePersonneDemandee(undefined)).toBeNull();
  });

  it("renvoie l'identifiant demande, espaces retires", () => {
    expect(lirePersonneDemandee("  ckpatient123  ")).toBe("ckpatient123");
  });

  it.each([
    ["vide", ""],
    ["blanc", "   "],
    ["repete", ["a", "b"]],
    ["trop long", "a".repeat(65)],
    ["forme inattendue (barre oblique)", "../admin"],
    ["forme inattendue (espace interne)", "ck 123"],
    ["forme inattendue (esperluette)", "ck&x=1"],
  ])("traite un parametre %s comme absent", (_cas, valeur) => {
    expect(lirePersonneDemandee(valeur as string | string[])).toBeNull();
  });
});

describe("lienTableauDeBord", () => {
  it("pointe vers /app/patient pour le titulaire", () => {
    expect(lienTableauDeBord(null)).toBe("/app/patient");
  });

  it("ajoute ?personne=<id> encode pour une personne a charge", () => {
    expect(lienTableauDeBord("ck123")).toBe("/app/patient?personne=ck123");
    expect(lienTableauDeBord("a b")).toBe("/app/patient?personne=a%20b");
  });
});

describe("ongletsPersonnes", () => {
  const proches = [
    { id: "pat-enfant-1", prenom: "Afi", nom: "Adjovi" },
    { id: "pat-enfant-2", prenom: "Koffi", nom: "Adjovi" },
  ];

  it("n'affiche aucun onglet quand le citoyen ne gere aucune personne a charge", () => {
    expect(ongletsPersonnes([], null)).toEqual([]);
  });

  it("place 'Moi' en premier puis chaque personne a charge, 'Moi' actif par defaut", () => {
    expect(ongletsPersonnes(proches, null)).toEqual([
      { procheId: null, libelle: "Moi", href: "/app/patient", actif: true },
      { procheId: "pat-enfant-1", libelle: "Afi Adjovi", href: "/app/patient?personne=pat-enfant-1", actif: false },
      { procheId: "pat-enfant-2", libelle: "Koffi Adjovi", href: "/app/patient?personne=pat-enfant-2", actif: false },
    ]);
  });

  it("marque actif le seul onglet de la personne a charge affichee", () => {
    const actifs = ongletsPersonnes(proches, "pat-enfant-2").filter((onglet) => onglet.actif);
    expect(actifs.map((onglet) => onglet.procheId)).toEqual(["pat-enfant-2"]);
  });

  it("ne construit des onglets qu'a partir de la liste recue (aucun id invente)", () => {
    const onglets = ongletsPersonnes(proches, "pat-inconnu");
    expect(onglets.map((onglet) => onglet.procheId)).toEqual([null, "pat-enfant-1", "pat-enfant-2"]);
    expect(onglets.some((onglet) => onglet.actif)).toBe(false);
  });
});

describe("rendezVousAVenir", () => {
  const maintenant = Date.parse("2026-09-28T10:00:00.000Z");

  it("ne garde que demande/confirme non passes, tries par date croissante", () => {
    const liste = [
      { id: "r1", statut: "confirme", date: "2026-10-05T09:00:00.000Z" },
      { id: "r2", statut: "demande", date: "2026-10-01T09:00:00.000Z" },
      { id: "r3", statut: "confirme", date: "2026-09-27T09:00:00.000Z" },
      { id: "r4", statut: "annule", date: "2026-10-02T09:00:00.000Z" },
      { id: "r5", statut: "termine", date: "2026-10-03T09:00:00.000Z" },
      { id: "r6", statut: "refuse", date: "2026-10-04T09:00:00.000Z" },
    ];

    expect(rendezVousAVenir(liste, maintenant).map((rdv) => rdv.id)).toEqual(["r2", "r1"]);
  });

  it("garde un rendez-vous exactement a l'instant courant et ne modifie pas la liste recue", () => {
    const liste = [
      { id: "r2", statut: "demande", date: "2026-10-01T09:00:00.000Z" },
      { id: "r1", statut: "confirme", date: "2026-09-28T10:00:00.000Z" },
    ];

    expect(rendezVousAVenir(liste, maintenant).map((rdv) => rdv.id)).toEqual(["r1", "r2"]);
    expect(liste.map((rdv) => rdv.id)).toEqual(["r2", "r1"]);
  });
});
