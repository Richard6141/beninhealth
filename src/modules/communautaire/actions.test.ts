import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    personneCommunautaire: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    suiviCommunautaire: { findMany: vi.fn(), create: vi.fn() },
    signeDangerCommunautaire: { count: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
    referenceCommunautaire: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/administration/parametres", () => ({ estFonctionnaliteActive: vi.fn(async () => true) }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { MESSAGE_MODULE_INACTIF } from "@/modules/administration/modules-actifs";
import {
  creerSuiviCommunautaireAction,
  enregistrerPersonneAction,
  getMesSuivisCommunautaires,
  getPersonnesEnregistrees,
  getReferencesCommunautairesEtablissement,
  getSignesDangerParType,
  marquerReferenceCommunautaireVueAction,
} from "@/modules/communautaire/actions";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  personneCommunautaire: { findUnique: Mock; findMany: Mock; create: Mock };
  suiviCommunautaire: { findMany: Mock; create: Mock };
  signeDangerCommunautaire: { count: Mock; createMany: Mock; findMany: Mock };
  referenceCommunautaire: { create: Mock; findMany: Mock; findUnique: Mock; update: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const etatSuivi = { error: null, success: false };
const etatPersonne = { error: null, success: false };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

/** Meme helper que formulaire(), avec un champ pouvant porter plusieurs valeurs (cases a cocher, ex. signesDanger). */
function formulaireAvecListe(champs: Record<string, string>, listes: Record<string, string[]>): FormData {
  const donnees = formulaire(champs);
  for (const [cle, valeurs] of Object.entries(listes)) {
    for (const valeur of valeurs) donnees.append(cle, valeur);
  }
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-agent", roles: ["agent_communautaire"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "agent-1", etablissementId: "etab-1" });
  p.suiviCommunautaire.findMany.mockResolvedValue([]);
  p.suiviCommunautaire.create.mockResolvedValue({ id: "suivi-1" });
  p.personneCommunautaire.findMany.mockResolvedValue([]);
  p.personneCommunautaire.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "pers-1",
    chefMenage: null,
    dateNaissanceApproximative: false,
    ...data,
  }));
  p.signeDangerCommunautaire.count.mockResolvedValue(1);
  p.signeDangerCommunautaire.findMany.mockResolvedValue([]);
  p.referenceCommunautaire.create.mockResolvedValue({ id: "ref-1" });
  p.referenceCommunautaire.findMany.mockResolvedValue([]);
});

describe("creerSuiviCommunautaireAction : visite de terrain (F-COM)", () => {
  it("enregistre une visite pour un nom en texte libre et la journalise", async () => {
    const resultat = await creerSuiviCommunautaireAction(
      etatSuivi,
      formulaire({ beneficiaireNom: "Adjovi Kouassi", typeVisite: "depistage", localisation: "Village A", notes: "RAS" })
    );

    expect(resultat.success).toBe(true);
    expect(resultat.avertissementDoublonBeneficiaire).toBeNull();
    expect(p.suiviCommunautaire.create.mock.calls[0][0].data).toMatchObject({
      agentId: "agent-1",
      etablissementId: "etab-1",
      personneId: null,
      beneficiaireNom: "Adjovi Kouassi",
      typeVisite: "depistage",
    });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
  });

  it("refuse un role sans droit et une session absente", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-medecin", roles: ["medecin"] });
    expect((await creerSuiviCommunautaireAction(etatSuivi, formulaire({ beneficiaireNom: "X", typeVisite: "autre" }))).success).toBe(false);

    getSessionMock.mockResolvedValue(null);
    expect((await creerSuiviCommunautaireAction(etatSuivi, formulaire({ beneficiaireNom: "X", typeVisite: "autre" }))).error).toContain("Session");
    expect(p.suiviCommunautaire.create).not.toHaveBeenCalled();
  });

  it("exige un beneficiaire (nom ou personne) et un type de visite valide", async () => {
    expect((await creerSuiviCommunautaireAction(etatSuivi, formulaire({ typeVisite: "autre" }))).error).toContain("beneficiaire");
    expect((await creerSuiviCommunautaireAction(etatSuivi, formulaire({ beneficiaireNom: "X", typeVisite: "inconnu" }))).success).toBe(false);
    expect(p.suiviCommunautaire.create).not.toHaveBeenCalled();
  });

  it("avec une personne enregistree, le nom vient de la fiche et jamais du formulaire", async () => {
    p.personneCommunautaire.findUnique.mockResolvedValue({ id: "pers-1", etablissementId: "etab-1", prenom: "Koffi", nom: "Mensah" });

    const resultat = await creerSuiviCommunautaireAction(
      etatSuivi,
      formulaire({ personneId: "pers-1", beneficiaireNom: "Nom falsifie", typeVisite: "vaccination" })
    );

    expect(resultat.success).toBe(true);
    const donnees = p.suiviCommunautaire.create.mock.calls[0][0].data;
    expect(donnees.personneId).toBe("pers-1");
    expect(donnees.beneficiaireNom).toBe("Koffi Mensah");
  });

  it("refuse une personne d'un autre etablissement ou inexistante (jamais confiance dans l'id transmis)", async () => {
    p.personneCommunautaire.findUnique.mockResolvedValueOnce({ id: "pers-9", etablissementId: "autre-etab", prenom: "A", nom: "B" });
    expect((await creerSuiviCommunautaireAction(etatSuivi, formulaire({ personneId: "pers-9", typeVisite: "autre" }))).error).toBe("Personne introuvable.");

    p.personneCommunautaire.findUnique.mockResolvedValueOnce(null);
    expect((await creerSuiviCommunautaireAction(etatSuivi, formulaire({ personneId: "absente", typeVisite: "autre" }))).success).toBe(false);
    expect(p.suiviCommunautaire.create).not.toHaveBeenCalled();
  });

  it("avertit d'un nom deja visite par le meme agent (sans accents ni casse) mais enregistre quand meme", async () => {
    p.suiviCommunautaire.findMany.mockResolvedValue([{ beneficiaireNom: "ADJOVI kouassi" }, { beneficiaireNom: "Autre" }]);

    const resultat = await creerSuiviCommunautaireAction(etatSuivi, formulaire({ beneficiaireNom: "Adjovi Kouassi", typeVisite: "autre" }));

    expect(resultat.success).toBe(true);
    expect(resultat.avertissementDoublonBeneficiaire).toContain("Adjovi Kouassi");
    expect(p.suiviCommunautaire.create).toHaveBeenCalled();
  });

  it("le rapprochement de nom ignore les accents", async () => {
    p.suiviCommunautaire.findMany.mockResolvedValue([{ beneficiaireNom: "Élodie Hounkpè" }]);

    const resultat = await creerSuiviCommunautaireAction(etatSuivi, formulaire({ beneficiaireNom: "elodie hounkpe", typeVisite: "autre" }));

    expect(resultat.avertissementDoublonBeneficiaire).toBeTruthy();
  });
});

describe("enregistrerPersonneAction : registre de personnes (F-COM-02)", () => {
  const personneValide = {
    nom: "Mensah",
    prenom: "Koffi",
    sexe: "M",
    dateNaissance: "1990-05-05",
    villageQuartier: "Quartier Nord",
  };

  it("enregistre une personne dans l'etablissement et pour l'agent de la session", async () => {
    const resultat = await enregistrerPersonneAction(etatPersonne, formulaire(personneValide));

    expect(resultat.success).toBe(true);
    expect(resultat.personneCreee).toMatchObject({ nomComplet: "Koffi Mensah", villageQuartier: "Quartier Nord" });
    expect(p.personneCommunautaire.create.mock.calls[0][0].data).toMatchObject({ etablissementId: "etab-1", agentId: "agent-1", chefMenage: null });
    expect(journaliserMock.mock.calls[0][0].justification).toContain("aucun doublon");
  });

  it("refuse un role sans droit", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-patient", roles: ["patient"] });

    expect((await enregistrerPersonneAction(etatPersonne, formulaire(personneValide))).success).toBe(false);
    expect(p.personneCommunautaire.create).not.toHaveBeenCalled();
  });

  it("refuse une date de naissance future ou illisible, et un sexe hors M/F", async () => {
    expect((await enregistrerPersonneAction(etatPersonne, formulaire({ ...personneValide, dateNaissance: "2999-01-01" }))).error).toContain("naissance");
    expect((await enregistrerPersonneAction(etatPersonne, formulaire({ ...personneValide, dateNaissance: "pas-une-date" }))).error).toContain("naissance");
    expect((await enregistrerPersonneAction(etatPersonne, formulaire({ ...personneValide, sexe: "X" }))).success).toBe(false);
    expect(p.personneCommunautaire.create).not.toHaveBeenCalled();
  });

  it("exige nom, prenom et village ou quartier", async () => {
    for (const champ of ["nom", "prenom", "villageQuartier"]) {
      expect((await enregistrerPersonneAction(etatPersonne, formulaire({ ...personneValide, [champ]: "  " }))).success).toBe(false);
    }
    expect(p.personneCommunautaire.create).not.toHaveBeenCalled();
  });

  it("un doublon (meme nom, prenom, naissance, sans accents ni casse) bloque et ne renvoie que des informations minimales", async () => {
    p.personneCommunautaire.findMany.mockResolvedValue([
      { nom: "MENSAH", prenom: "koffi", sexe: "M", dateNaissance: new Date("1990-05-05"), villageQuartier: "Quartier Sud", telephone: "secret" },
    ]);

    const resultat = await enregistrerPersonneAction(etatPersonne, formulaire(personneValide));

    expect(resultat.success).toBe(false);
    expect(resultat.candidatDoublon).toEqual({ initiales: "KM", anneeNaissance: 1990, sexe: "M", villageQuartier: "Quartier Sud" });
    expect(JSON.stringify(resultat)).not.toContain("secret");
    expect(p.personneCommunautaire.create).not.toHaveBeenCalled();
  });

  it("le controle de doublon est limite a l'etablissement de l'agent", async () => {
    await enregistrerPersonneAction(etatPersonne, formulaire(personneValide));

    expect(p.personneCommunautaire.findMany.mock.calls[0][0].where).toMatchObject({ etablissementId: "etab-1" });
  });

  it("forcer malgre un doublon exige une justification d'au moins 10 caracteres, tracee au journal", async () => {
    p.personneCommunautaire.findMany.mockResolvedValue([
      { nom: "Mensah", prenom: "Koffi", sexe: "M", dateNaissance: new Date("1990-05-05"), villageQuartier: "Quartier Sud" },
    ]);

    const trop = await enregistrerPersonneAction(etatPersonne, formulaire({ ...personneValide, confirmerMalgreDoublon: "on", justificationDoublon: "court" }));
    expect(trop.success).toBe(false);
    expect(trop.error).toContain("justification");

    const ok = await enregistrerPersonneAction(
      etatPersonne,
      formulaire({ ...personneValide, confirmerMalgreDoublon: "on", justificationDoublon: "Homonyme d'un autre village" })
    );
    expect(ok.success).toBe(true);
    expect(journaliserMock.mock.calls[0][0].justification).toContain("Homonyme d'un autre village");
  });
});

describe("lectures limitees a l'agent et a son etablissement", () => {
  it("getPersonnesEnregistrees ne lit que l'etablissement de l'agent connecte", async () => {
    p.personneCommunautaire.findMany.mockResolvedValue([
      { id: "p1", prenom: "Koffi", nom: "Mensah", dateNaissance: new Date("1990-05-05"), dateNaissanceApproximative: false, sexe: "M", villageQuartier: "Nord", chefMenage: null },
    ]);

    const personnes = await getPersonnesEnregistrees();

    expect(p.personneCommunautaire.findMany.mock.calls[0][0].where).toEqual({ etablissementId: "etab-1" });
    expect(personnes).toEqual([expect.objectContaining({ id: "p1", nomComplet: "Koffi Mensah" })]);
  });

  it("getMesSuivisCommunautaires ne lit que les visites de l'agent connecte", async () => {
    await getMesSuivisCommunautaires();

    expect(p.suiviCommunautaire.findMany.mock.calls[0][0].where).toEqual({ agentId: "agent-1" });
  });

  it("sans session, aucune lecture et une liste vide", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getPersonnesEnregistrees()).toEqual([]);
    expect(await getMesSuivisCommunautaires()).toEqual([]);
    expect(p.personneCommunautaire.findMany).not.toHaveBeenCalled();
    expect(p.suiviCommunautaire.findMany).not.toHaveBeenCalled();
  });
});

describe("signes de danger et reference communautaire (F-COM-03, RG-COM-10)", () => {
  it("cree une reference communautaire quand au moins un signe de danger est coche", async () => {
    const resultat = await creerSuiviCommunautaireAction(
      etatSuivi,
      formulaireAvecListe(
        { beneficiaireNom: "Adjovi Kouassi", typeVisite: "enfant_moins_5_ans" },
        { signesDanger: ["Convulsions", "Vomit tout ce qu'il consomme"] }
      )
    );

    expect(resultat.success).toBe(true);
    expect(resultat.referenceCreee).toBe(true);
    expect(p.suiviCommunautaire.create.mock.calls[0][0].data.signesDangerCoches).toBe(
      JSON.stringify(["Convulsions", "Vomit tout ce qu'il consomme"])
    );
    expect(p.referenceCommunautaire.create.mock.calls[0][0].data).toMatchObject({
      agentId: "agent-1",
      etablissementId: "etab-1",
      beneficiaireNom: "Adjovi Kouassi",
      suiviId: "suivi-1",
      motif: "Convulsions, Vomit tout ce qu'il consomme",
    });
    expect(journaliserMock).toHaveBeenCalledTimes(2);
  });

  it("ne cree aucune reference quand aucun signe de danger n'est coche", async () => {
    const resultat = await creerSuiviCommunautaireAction(
      etatSuivi,
      formulaire({ beneficiaireNom: "X", typeVisite: "suivi_general" })
    );

    expect(resultat.referenceCreee).toBe(false);
    expect(p.referenceCommunautaire.create).not.toHaveBeenCalled();
  });

  it("getSignesDangerParType groupe les signes actifs par type de visite, tries par ordre", async () => {
    p.signeDangerCommunautaire.count.mockResolvedValue(4);
    p.signeDangerCommunautaire.findMany.mockResolvedValue([
      { id: "s1", typeVisite: "enfant_moins_5_ans", libelle: "Convulsions" },
      { id: "s2", typeVisite: "enfant_moins_5_ans", libelle: "Léthargie ou inconscience" },
      { id: "s3", typeVisite: "femme_enceinte", libelle: "Saignement" },
    ]);

    const groupes = await getSignesDangerParType();

    expect(p.signeDangerCommunautaire.findMany.mock.calls[0][0]).toMatchObject({
      where: { actif: true },
      orderBy: { ordre: "asc" },
    });
    expect(groupes).toEqual({
      enfant_moins_5_ans: [{ id: "s1", libelle: "Convulsions" }, { id: "s2", libelle: "Léthargie ou inconscience" }],
      femme_enceinte: [{ id: "s3", libelle: "Saignement" }],
    });
    expect(p.signeDangerCommunautaire.createMany).not.toHaveBeenCalled();
  });

  it("seme le referentiel une seule fois si la table est vide, jamais si elle contient deja des lignes", async () => {
    p.signeDangerCommunautaire.count.mockResolvedValue(0);

    await getSignesDangerParType();

    expect(p.signeDangerCommunautaire.createMany).toHaveBeenCalledTimes(1);

    p.signeDangerCommunautaire.count.mockResolvedValue(8);
    await getSignesDangerParType();

    expect(p.signeDangerCommunautaire.createMany).toHaveBeenCalledTimes(1);
  });

  it("getSignesDangerParType renvoie un objet vide sans session", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getSignesDangerParType()).toEqual({});
    expect(p.signeDangerCommunautaire.findMany).not.toHaveBeenCalled();
  });
});

describe("references communautaires : lecture et prise en compte par l'etablissement", () => {
  it("getReferencesCommunautairesEtablissement lit les references de l'etablissement du professionnel connecte", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-medecin", roles: ["medecin"] });
    p.referenceCommunautaire.findMany.mockResolvedValue([
      {
        id: "ref-1",
        beneficiaireNom: "Adjovi Kouassi",
        motif: "Convulsions",
        statut: "en_attente",
        dateCreation: new Date("2026-09-27"),
        agent: { user: { prenom: "Awa", nom: "Toure" } },
      },
    ]);

    const references = await getReferencesCommunautairesEtablissement();

    expect(p.referenceCommunautaire.findMany.mock.calls[0][0].where).toEqual({ etablissementId: "etab-1" });
    expect(references).toEqual([
      expect.objectContaining({ id: "ref-1", beneficiaireNom: "Adjovi Kouassi", agentNomComplet: "Awa Toure" }),
    ]);
  });

  it("refuse un role sans droit read:reference_communautaire", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-agent", roles: ["agent_communautaire"] });

    expect(await getReferencesCommunautairesEtablissement()).toEqual([]);
    expect(p.referenceCommunautaire.findMany).not.toHaveBeenCalled();
  });

  it("marquerReferenceCommunautaireVueAction verifie l'etablissement avant de marquer vue (jamais confiance dans le seul id transmis)", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-medecin", roles: ["medecin"] });
    p.referenceCommunautaire.findUnique.mockResolvedValue({ id: "ref-1", etablissementId: "autre-etab" });

    const refuse = await marquerReferenceCommunautaireVueAction(etatSuivi, formulaire({ id: "ref-1" }));
    expect(refuse.error).toBe("Reference introuvable.");
    expect(p.referenceCommunautaire.update).not.toHaveBeenCalled();

    p.referenceCommunautaire.findUnique.mockResolvedValue({ id: "ref-1", etablissementId: "etab-1" });
    const accepte = await marquerReferenceCommunautaireVueAction(etatSuivi, formulaire({ id: "ref-1" }));
    expect(accepte.success).toBe(true);
    expect(p.referenceCommunautaire.update.mock.calls[0][0]).toMatchObject({
      where: { id: "ref-1" },
      data: { statut: "vue", vueParId: "agent-1" },
    });
  });
});

describe("module communautaire desactive (F-ADM-07)", () => {
  it("refuse la visite et l'enregistrement d'une personne quand community.module est inactif", async () => {
    (estFonctionnaliteActive as unknown as Mock).mockResolvedValue(false);

    const visite = await creerSuiviCommunautaireAction(etatSuivi, formulaire({ beneficiaireNom: "X", typeVisite: "autre" }));
    const personne = await enregistrerPersonneAction(
      etatPersonne,
      formulaire({ nom: "Mensah", prenom: "Koffi", sexe: "M", dateNaissance: "1990-05-05", villageQuartier: "Nord" })
    );

    expect(visite).toEqual({ error: MESSAGE_MODULE_INACTIF, success: false });
    expect(personne).toEqual({ error: MESSAGE_MODULE_INACTIF, success: false });
    expect(estFonctionnaliteActive).toHaveBeenCalledWith("community.module");
    expect(p.suiviCommunautaire.create).not.toHaveBeenCalled();
    expect(p.personneCommunautaire.create).not.toHaveBeenCalled();
    (estFonctionnaliteActive as unknown as Mock).mockResolvedValue(true);
  });
});
