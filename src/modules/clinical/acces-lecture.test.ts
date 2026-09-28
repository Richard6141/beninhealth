import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Lecture du resume et de l'historique d'un patient par un professionnel
 * (F-CLI-04, F-CLI-09, RG-CLI-30, RG-CLI-91, RG-LAB-30). Le point central est
 * accesPatientAutorise : quelle base d'acces, pour quel type de donnee.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    professionnelSante: { findUnique: vi.fn() },
    consentement: { findUnique: vi.fn() },
    referencePatient: { findFirst: vi.fn() },
    patient: { findUnique: vi.fn() },
    prescription: { findMany: vi.fn() },
    consultation: { findMany: vi.fn(), count: vi.fn() },
    examenMedical: { findMany: vi.fn() },
    suiviCommunautaire: { findMany: vi.fn() },
    vaccination: { findMany: vi.fn() },
    documentMedical: { findMany: vi.fn() },
    delivrance: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { getHistoriquePatient, getResumePatient } from "./actions";

const prismaMock = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  consentement: { findUnique: Mock };
  referencePatient: { findFirst: Mock };
  patient: { findUnique: Mock };
  prescription: { findMany: Mock };
  consultation: { findMany: Mock; count: Mock };
  examenMedical: { findMany: Mock };
  suiviCommunautaire: { findMany: Mock };
  vaccination: { findMany: Mock };
  documentMedical: { findMany: Mock };
  delivrance: { findMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const MAINTENANT = new Date("2026-09-26T10:00:00.000Z");
const dans = (ms: number) => new Date(MAINTENANT.getTime() + ms);
const HEURE = 60 * 60 * 1000;

const PATIENT = {
  id: "pat-1",
  identifiantSante: "BJ-SANTE-PAT-0001",
  dateNaissance: new Date("1990-01-01"),
  sexe: "F",
  groupeSanguin: "O+",
  allergies: '["Penicilline"]',
  antecedents: "[]",
  maladiesChroniques: "[]",
  contactsUrgence: "[]",
  user: { nom: "Adjovi", prenom: "Rose", telephone: "+22997000000", avatarUrl: null, niveauVerification: "N1" },
};

const medecin = { user: { nom: "Ahouansou", prenom: "Koffi" } };

function consentement(typeAcces: string, surcharges: Record<string, unknown> = {}) {
  return { id: "cons-1", statut: "actif", typeAcces, dateFin: dans(HEURE), ...surcharges };
}

function examen(id: string, surcharges: Record<string, unknown> = {}) {
  return {
    id,
    date: new Date("2026-09-01T09:00:00Z"),
    typeExamen: "Glycemie",
    resultat: "1,1 g/L",
    statut: "termine",
    sensible: false,
    laboratoireId: "lab-1",
    laboratoire: { nom: "Labo Central" },
    demandeur: medecin,
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  getSessionMock.mockResolvedValue({ userId: "user-pro", roles: ["medecin"] });
  prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", userId: "user-pro", etablissementId: "etab-1" });
  prismaMock.consentement.findUnique.mockResolvedValue(consentement("dossier_complet"));
  prismaMock.referencePatient.findFirst.mockResolvedValue(null);
  prismaMock.patient.findUnique.mockResolvedValue(PATIENT);
  prismaMock.prescription.findMany.mockResolvedValue([]);
  prismaMock.consultation.findMany.mockResolvedValue([]);
  prismaMock.consultation.count.mockResolvedValue(0);
  prismaMock.examenMedical.findMany.mockResolvedValue([]);
  prismaMock.suiviCommunautaire.findMany.mockResolvedValue([]);
  prismaMock.vaccination.findMany.mockResolvedValue([]);
  prismaMock.documentMedical.findMany.mockResolvedValue([]);
  prismaMock.delivrance.findMany.mockResolvedValue([]);
});

describe("base d'acces : session, profil, consentement", () => {
  it("renvoie null sans session ou sans profil professionnel, sans rien lire", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getResumePatient("pat-1")).toBeNull();
    expect(await getHistoriquePatient("pat-1")).toBeNull();

    getSessionMock.mockResolvedValue({ userId: "user-pro", roles: ["medecin"] });
    prismaMock.professionnelSante.findUnique.mockResolvedValue(null);
    expect(await getResumePatient("pat-1")).toBeNull();

    expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("cherche le consentement au nom du professionnel de la session pour le patient demande", async () => {
    await getResumePatient("pat-1");
    expect(prismaMock.consentement.findUnique).toHaveBeenCalledWith({
      where: { patientId_acteurAutoriseId: { patientId: "pat-1", acteurAutoriseId: "user-pro" } },
    });
  });

  it("refuse sans consentement ni reference : aucune donnee lue, aucun journal", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(null);

    expect(await getResumePatient("pat-1")).toBeNull();
    expect(await getHistoriquePatient("pat-1")).toBeNull();

    expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.consultation.findMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse un consentement retire, expire, ou d'un autre statut", async () => {
    for (const surcharge of [{ statut: "retire" }, { statut: "revoque" }, { dateFin: dans(-1000) }]) {
      prismaMock.consentement.findUnique.mockResolvedValue(consentement("dossier_complet", surcharge));
      expect(await getResumePatient("pat-1")).toBeNull();
      expect(await getHistoriquePatient("pat-1")).toBeNull();
    }
  });
});

describe("portee du consentement (moindre privilege)", () => {
  for (const type of ["dossier_complet", "consultations", "urgence"]) {
    it(`le type "${type}" ouvre le resume et l'historique`, async () => {
      prismaMock.consentement.findUnique.mockResolvedValue(consentement(type));
      expect(await getResumePatient("pat-1")).not.toBeNull();
      expect(await getHistoriquePatient("pat-1")).not.toBeNull();
    });
  }

  for (const type of ["prescriptions", "examens", "documents", "type_inconnu"]) {
    it(`le type etroit "${type}" n'ouvre ni le resume ni l'historique (chaque module garde son propre controle)`, async () => {
      prismaMock.consentement.findUnique.mockResolvedValue(consentement(type));

      expect(await getResumePatient("pat-1")).toBeNull();
      expect(await getHistoriquePatient("pat-1")).toBeNull();

      expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.examenMedical.findMany).not.toHaveBeenCalled();
      expect(journaliserMock).not.toHaveBeenCalled();
    });
  }

  it("un consentement etroit n'empeche pas une reference valide adressee a l'etablissement du professionnel", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("documents"));
    prismaMock.referencePatient.findFirst.mockResolvedValue({ id: "ref-1", dateFinAcces: dans(24 * HEURE) });

    const resume = await getResumePatient("pat-1");

    expect(resume?.accesReferenceExpirationLe).toBe(dans(24 * HEURE).toISOString());
  });
});

describe("reference (F-CLI-14) comme base d'acces", () => {
  it("n'est cherchee que pour l'etablissement du professionnel et tant qu'elle n'a pas expire", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(null);

    await getResumePatient("pat-1");

    expect(prismaMock.referencePatient.findFirst).toHaveBeenCalledWith({
      where: { patientId: "pat-1", etablissementDestinationId: "etab-1", dateFinAcces: { gt: MAINTENANT } },
      orderBy: { dateFinAcces: "desc" },
    });
  });

  it("ouvre le resume avec sa date d'expiration, et journalise la reference utilisee", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(null);
    prismaMock.referencePatient.findFirst.mockResolvedValue({ id: "ref-1", dateFinAcces: dans(24 * HEURE) });

    const resume = await getResumePatient("pat-1");

    expect(resume?.accesReferenceExpirationLe).toBe(dans(24 * HEURE).toISOString());
    expect(resume?.accesUrgenceExpirationLe).toBeNull();
    expect(journaliserMock.mock.calls[0][0].justification).toContain("reference ref-1");
    // RG-ACC-50 : le niveau de verification reste affiche meme sous un acces
    // restreint (reference) - ce n'est pas une donnee clinique sensible.
    expect(resume?.niveauVerification).toBe("N1");
  });
});

describe("resume du patient", () => {
  it("renvoie l'identite, les allergies et l'age, et journalise la consultation du resume (RG-CLI-31)", async () => {
    const resume = await getResumePatient("pat-1");

    expect(resume).toMatchObject({ id: "pat-1", nomComplet: "Rose Adjovi", identifiantSante: "BJ-SANTE-PAT-0001", allergies: ["Penicilline"], age: 36, accesUrgenceExpirationLe: null, niveauVerification: "N1" });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "user-pro",
      action: "consultation_resume_patient",
      donneeConcernee: "patient:pat-1",
      justification: "Resume patient consulte (consentement dossier_complet)",
    });
  });

  it("signale l'expiration d'un acces d'urgence (bandeau rouge, CA-3)", async () => {
    const fin = dans(4 * HEURE);
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("urgence", { dateFin: fin }));

    const resume = await getResumePatient("pat-1");

    expect(resume?.accesUrgenceExpirationLe).toBe(fin.toISOString());
  });

  it("ne lit que les traitements actifs et les consultations terminees", async () => {
    await getResumePatient("pat-1");

    expect(prismaMock.prescription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: "pat-1", statut: { in: ["validee", "delivree_partiellement"] } } })
    );
    expect(prismaMock.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: "pat-1", statut: "terminee" } })
    );
  });

  it("RG-CLI-91 : un acces d'urgence n'ecarte que les consultations sensibles de la requete, un consentement normal ne filtre rien", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("urgence"));

    await getResumePatient("pat-1");

    expect(prismaMock.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: "pat-1", statut: "terminee", sensible: false } })
    );
  });

  it("RG-CLI-30 : un consentement normal ne compte jamais les sensibles masquees (rien n'est masque)", async () => {
    const resume = await getResumePatient("pat-1");

    expect(prismaMock.consultation.count).not.toHaveBeenCalled();
    expect(resume?.elementsSensiblesMasques).toBe(false);
  });

  it("RG-CLI-30 : un acces d'urgence avec au moins une consultation sensible existante signale le resume incomplet", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("urgence"));
    prismaMock.consultation.count.mockResolvedValue(2);

    const resume = await getResumePatient("pat-1");

    expect(prismaMock.consultation.count).toHaveBeenCalledWith({
      where: { patientId: "pat-1", statut: "terminee", sensible: true },
    });
    expect(resume?.elementsSensiblesMasques).toBe(true);
  });

  it("RG-CLI-30 : un acces d'urgence sans aucune consultation sensible ne signale rien", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("urgence"));
    prismaMock.consultation.count.mockResolvedValue(0);

    const resume = await getResumePatient("pat-1");

    expect(resume?.elementsSensiblesMasques).toBe(false);
  });

  it("RG-CLI-30 : un acces par reference compte aussi les sensibles masquees", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(null);
    prismaMock.referencePatient.findFirst.mockResolvedValue({ id: "ref-1", dateFinAcces: dans(HEURE) });
    prismaMock.consultation.count.mockResolvedValue(1);

    const resume = await getResumePatient("pat-1");

    expect(resume?.elementsSensiblesMasques).toBe(true);
  });
});

describe("F-CIT-10 : niveaux d'acces SUMMARY/FULL/FULL_SENSITIVE (RG-ACC-11)", () => {
  it("un niveau SUMMARY n'ouvre jamais l'historique, sans lire aucune donnee d'historique", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("dossier_complet", { niveauAcces: "SUMMARY" }));

    expect(await getHistoriquePatient("pat-1")).toBeNull();

    expect(prismaMock.consultation.findMany).not.toHaveBeenCalled();
    expect(prismaMock.examenMedical.findMany).not.toHaveBeenCalled();
  });

  it("un niveau SUMMARY ouvre quand meme le resume", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("dossier_complet", { niveauAcces: "SUMMARY" }));

    expect(await getResumePatient("pat-1")).not.toBeNull();
  });

  it("un niveau FULL ouvre le resume et l'historique, mais masque les consultations et examens sensibles", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("dossier_complet", { niveauAcces: "FULL" }));

    await getResumePatient("pat-1");
    expect(prismaMock.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: "pat-1", statut: "terminee", sensible: false } })
    );

    prismaMock.examenMedical.findMany.mockResolvedValue([examen("ex-normal"), examen("ex-vih", { sensible: true })]);
    const historique = await getHistoriquePatient("pat-1");
    expect(historique?.evenements.map((e) => e.id)).toEqual(["ex-normal"]);
  });

  it("un niveau FULL_SENSITIVE ouvre le resume et l'historique sans rien masquer", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("dossier_complet", { niveauAcces: "FULL_SENSITIVE" }));

    await getResumePatient("pat-1");
    expect(prismaMock.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: "pat-1", statut: "terminee" } })
    );

    prismaMock.examenMedical.findMany.mockResolvedValue([examen("ex-normal"), examen("ex-vih", { sensible: true })]);
    const historique = await getHistoriquePatient("pat-1");
    expect(historique?.evenements.map((e) => e.id).sort()).toEqual(["ex-normal", "ex-vih"]);
  });

  it("sans niveauAcces precise, se comporte comme FULL_SENSITIVE (lignes anterieures a la migration)", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("dossier_complet"));

    await getResumePatient("pat-1");
    expect(prismaMock.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: "pat-1", statut: "terminee" } })
    );
  });
});

describe("historique du patient", () => {
  it("n'inclut que les consultations terminees (RG-CLI-41 : jamais un brouillon d'un autre)", async () => {
    await getHistoriquePatient("pat-1");
    expect(prismaMock.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: "pat-1", statut: "terminee" } })
    );
  });

  it("RG-CLI-91 : un acces d'urgence n'expose aucun examen sensible", async () => {
    prismaMock.examenMedical.findMany.mockResolvedValue([examen("ex-normal"), examen("ex-vih", { sensible: true, typeExamen: "Serologie VIH" })]);
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("urgence"));

    const historique = await getHistoriquePatient("pat-1");

    expect(historique?.evenements.map((e) => e.id)).toEqual(["ex-normal"]);
  });

  it("un acces par reference n'expose pas non plus les examens sensibles", async () => {
    prismaMock.examenMedical.findMany.mockResolvedValue([examen("ex-normal"), examen("ex-vih", { sensible: true })]);
    prismaMock.consentement.findUnique.mockResolvedValue(null);
    prismaMock.referencePatient.findFirst.mockResolvedValue({ id: "ref-1", dateFinAcces: dans(HEURE) });

    const historique = await getHistoriquePatient("pat-1");

    expect(historique?.evenements.map((e) => e.id)).toEqual(["ex-normal"]);
  });

  it("RG-CLI-91/RG-CLI-53 : un acces d'urgence n'expose aucune consultation sensible (diagnostic principal d'un groupe sensible)", async () => {
    prismaMock.consultation.findMany.mockResolvedValue([
      { id: "c-normale", date: dans(-HEURE), motif: "Fievre", conclusion: "Paludisme", saisieParErreur: false, motifRetrait: null, etablissementId: "etab-1", etablissement: { nom: "CS Akpakpa" }, professionnel: medecin, sensible: false },
      { id: "c-sensible", date: dans(-2 * HEURE), motif: "Suivi", conclusion: "VIH", saisieParErreur: false, motifRetrait: null, etablissementId: "etab-1", etablissement: { nom: "CS Akpakpa" }, professionnel: medecin, sensible: true },
    ]);
    prismaMock.consentement.findUnique.mockResolvedValue(consentement("urgence"));

    const historique = await getHistoriquePatient("pat-1");

    expect(historique?.evenements.map((e) => e.id)).toEqual(["c-normale"]);
  });

  it("un consentement dossier_complet voit aussi les consultations sensibles", async () => {
    prismaMock.consultation.findMany.mockResolvedValue([
      { id: "c-sensible", date: dans(-HEURE), motif: "Suivi", conclusion: "VIH", saisieParErreur: false, motifRetrait: null, etablissementId: "etab-1", etablissement: { nom: "CS Akpakpa" }, professionnel: medecin, sensible: true },
    ]);

    const historique = await getHistoriquePatient("pat-1");

    expect(historique?.evenements.map((e) => e.id)).toEqual(["c-sensible"]);
  });

  it("un consentement dossier_complet voit les examens sensibles", async () => {
    prismaMock.examenMedical.findMany.mockResolvedValue([examen("ex-normal"), examen("ex-vih", { sensible: true })]);

    const historique = await getHistoriquePatient("pat-1");

    expect(historique?.evenements.map((e) => e.id).sort()).toEqual(["ex-normal", "ex-vih"]);
  });

  it("RG-LAB-30 : un resultat non valide par un second professionnel n'est jamais montre", async () => {
    prismaMock.examenMedical.findMany.mockResolvedValue([examen("ex-en-cours", { statut: "en_cours", resultat: "RESULTAT NON VALIDE" })]);

    const historique = await getHistoriquePatient("pat-1");

    const evenement = historique!.evenements[0];
    expect(evenement.description).toBe("");
    expect(evenement.detailLignes.join(" ")).not.toContain("RESULTAT NON VALIDE");
  });

  it("inclut une vaccination, un document et une delivrance (F-CLI-09 : trois types corriges le 2026-09-28)", async () => {
    prismaMock.vaccination.findMany.mockResolvedValue([
      {
        id: "vac-1",
        dateAdministration: dans(-HEURE),
        vaccin: "BCG",
        numeroDose: 1,
        siteInjection: "Bras gauche",
        voie: "intradermique",
        lieu: "etablissement",
        nomCampagne: null,
        saisieParErreur: false,
        motifRetrait: null,
        etablissementId: "etab-1",
        etablissement: { nom: "CS Akpakpa" },
        professionnel: medecin,
      },
    ]);
    prismaMock.documentMedical.findMany.mockResolvedValue([
      {
        id: "doc-1",
        dateDocument: dans(-2 * HEURE),
        titre: "Compte rendu radio",
        nomFichierOriginal: "radio.pdf",
        type: "imagerie",
        niveauConfidentialite: "normal",
        retirePourErreur: false,
        motifRetrait: null,
        auteur: { nom: "Ahouansou", prenom: "Koffi", professionnel: { etablissementId: "etab-1", etablissement: { nom: "CS Akpakpa" } } },
      },
    ]);
    prismaMock.delivrance.findMany.mockResolvedValue([
      {
        id: "del-1",
        date: dans(-3 * HEURE),
        annulee: false,
        motifAnnulation: null,
        etablissementId: "etab-1",
        etablissement: { nom: "CS Akpakpa" },
        pharmacien: medecin,
        lignes: [
          { quantiteDelivree: 10, motifNonDelivrance: null, medicamentDelivre: null, lignePrescription: { medicament: { nom: "Paracetamol" } } },
        ],
      },
    ]);

    const historique = await getHistoriquePatient("pat-1");

    expect(historique?.evenements.map((e) => ({ id: e.id, type: e.type }))).toEqual([
      { id: "vac-1", type: "vaccination" },
      { id: "doc-1", type: "document" },
      { id: "del-1", type: "delivrance" },
    ]);
    expect(historique?.evenements[2].description).toBe("Paracetamol");
    expect(historique?.evenements[2].detailLignes.join(" ")).toContain("10 delivre");
  });

  it("RG-CLI-91 : un acces d'urgence n'expose aucun document sensible, mais un consentement dossier_complet le voit", async () => {
    const documents = [
      {
        id: "doc-normal",
        dateDocument: dans(-HEURE),
        titre: "Certificat",
        nomFichierOriginal: "certificat.pdf",
        type: "certificat",
        niveauConfidentialite: "normal",
        retirePourErreur: false,
        motifRetrait: null,
        auteur: { nom: "Ahouansou", prenom: "Koffi", professionnel: { etablissementId: "etab-1", etablissement: { nom: "CS Akpakpa" } } },
      },
      {
        id: "doc-sensible",
        dateDocument: dans(-2 * HEURE),
        titre: "Resultat VIH",
        nomFichierOriginal: "resultat.pdf",
        type: "resultat",
        niveauConfidentialite: "sensible",
        retirePourErreur: false,
        motifRetrait: null,
        auteur: { nom: "Ahouansou", prenom: "Koffi", professionnel: { etablissementId: "etab-1", etablissement: { nom: "CS Akpakpa" } } },
      },
    ];
    prismaMock.documentMedical.findMany.mockResolvedValue(documents);

    prismaMock.consentement.findUnique.mockResolvedValue(consentement("urgence"));
    const viaUrgence = await getHistoriquePatient("pat-1");
    expect(viaUrgence?.evenements.map((e) => e.id)).toEqual(["doc-normal"]);

    prismaMock.consentement.findUnique.mockResolvedValue(consentement("dossier_complet"));
    const viaDossierComplet = await getHistoriquePatient("pat-1");
    expect(viaDossierComplet?.evenements.map((e) => e.id).sort()).toEqual(["doc-normal", "doc-sensible"]);
  });

  it("resout l'etablissement d'un document via l'auteur (aucun etablissement propre sur DocumentMedical)", async () => {
    prismaMock.documentMedical.findMany.mockResolvedValue([
      {
        id: "doc-1",
        dateDocument: dans(-HEURE),
        titre: "Compte rendu",
        nomFichierOriginal: "cr.pdf",
        type: "compte_rendu",
        niveauConfidentialite: "normal",
        retirePourErreur: false,
        motifRetrait: null,
        auteur: { nom: "Ahouansou", prenom: "Koffi", professionnel: { etablissementId: "etab-9", etablissement: { nom: "CHU Parakou" } } },
      },
    ]);

    const historique = await getHistoriquePatient("pat-1");

    expect(historique?.evenements[0].etablissementId).toBe("etab-9");
    expect(historique?.evenements[0].etablissementNom).toBe("CHU Parakou");
  });

  it("journalise l'affichage de la liste une seule fois (RG-CLI-80), avec la page", async () => {
    await getHistoriquePatient("pat-1");

    expect(journaliserMock).toHaveBeenCalledTimes(1);
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      action: "consultation_historique_patient",
      donneeConcernee: "patient:pat-1",
      justification: "Historique consulte (page 1/1)",
    });
  });

  it("trie du plus recent au plus ancien, filtre par type, etablissement et dates, et pagine par 25", async () => {
    const consultations = Array.from({ length: 26 }, (_, i) => ({
      id: `c-${i}`,
      date: new Date(Date.UTC(2026, 0, 1 + i, 9)),
      motif: `Motif ${i}`,
      conclusion: "",
      saisieParErreur: false,
      motifRetrait: null,
      etablissementId: i % 2 === 0 ? "etab-1" : "etab-2",
      etablissement: { nom: i % 2 === 0 ? "CS Akpakpa" : "CHU Parakou" },
      professionnel: medecin,
    }));
    prismaMock.consultation.findMany.mockResolvedValue(consultations);
    prismaMock.examenMedical.findMany.mockResolvedValue([examen("ex-1")]);

    const page1 = await getHistoriquePatient("pat-1");
    expect(page1?.total).toBe(27);
    expect(page1?.nombreDePages).toBe(2);
    expect(page1?.evenements).toHaveLength(25);
    // L'examen (septembre) est plus recent que toutes les consultations (janvier).
    expect(page1?.evenements.slice(0, 2).map((e) => e.id)).toEqual(["ex-1", "c-25"]);

    const page2 = await getHistoriquePatient("pat-1", { page: 2 });
    expect(page2?.evenements).toHaveLength(2);

    expect((await getHistoriquePatient("pat-1", { page: 99 }))?.page).toBe(2);
    expect((await getHistoriquePatient("pat-1", { page: -3 }))?.page).toBe(1);

    const examens = await getHistoriquePatient("pat-1", { type: "examen" });
    expect(examens?.evenements.map((e) => e.id)).toEqual(["ex-1"]);

    const etab2 = await getHistoriquePatient("pat-1", { etablissementId: "etab-2" });
    expect(etab2?.total).toBe(13);

    const janvier = await getHistoriquePatient("pat-1", { type: "consultation", dateDebut: "2026-01-10", dateFin: "2026-01-12" });
    expect(janvier?.evenements.map((e) => e.id)).toEqual(["c-11", "c-10", "c-9"]);

    expect(page1?.etablissementsDisponibles.map((e) => e.nom)).toEqual(["CHU Parakou", "CS Akpakpa", "Labo Central"]);
  });
});
