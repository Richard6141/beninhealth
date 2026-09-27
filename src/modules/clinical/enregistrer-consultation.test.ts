import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Brouillon et validation d'une consultation (F-CLI-05/06/07, RG-CLI-40,
 * RG-CLI-50, RG-CLI-61) : qui peut ecrire, sur quelle base d'acces, un seul
 * brouillon par patient, et ce que la validation verrouille et declenche.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
// Frontiere du module : la logique interne (routage vers le tuteur d'une
// personne a charge) est testee dans son propre fichier
// (facility/destinataire-notification-patient.test.ts), pas ici.
vi.mock("@/modules/facility/destinataire-notification-patient", () => ({
  destinataireNotificationPatient: vi.fn(async (patientId: string) => `user-de-${patientId}`),
}));
vi.mock("@/modules/pilotage/file-taches", () => ({ publierEvenementPilotage: vi.fn(async () => undefined) }));
vi.mock("@/modules/administration/validation-professionnels-controle", () => ({
  professionnelValide: vi.fn(async () => true),
  MESSAGE_ORDRE_NON_VERIFIE: "Votre numéro d'Ordre n'est pas encore vérifié par le ministère.",
}));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    patient: { findUnique: vi.fn() },
    consentement: { findUnique: vi.fn() },
    rendezVous: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    consultation: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    priseEnChargeInfirmiere: { updateMany: vi.fn() },
    diagnosticCim10: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (rappel: (tx: unknown) => unknown) => rappel(prisma));
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { publierEvenementPilotage } from "@/modules/pilotage/file-taches";
import { professionnelValide } from "@/modules/administration/validation-professionnels-controle";
import { enregistrerConsultationAction } from "./actions";

const prismaMock = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  patient: { findUnique: Mock };
  consentement: { findUnique: Mock };
  rendezVous: { findUnique: Mock; findFirst: Mock; updateMany: Mock };
  consultation: { findUnique: Mock; findFirst: Mock; create: Mock; update: Mock };
  priseEnChargeInfirmiere: { updateMany: Mock };
  diagnosticCim10: { findUnique: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;
const evenementPilotageMock = publierEvenementPilotage as unknown as Mock;
const ordreVerifieMock = professionnelValide as unknown as Mock;

const ETAT = { error: null, success: false };
const MAINTENANT = new Date("2026-09-26T10:00:00.000Z");

function formulaire(surcharges: Record<string, string> = {}): FormData {
  const champs: Record<string, string> = {
    patientId: "pat-1",
    motif: "Fievre depuis 3 jours",
    conclusion: "Paludisme simple",
    symptomes: "fievre\nmaux de tete",
    temperatureCelsius: "37.2",
    // RG-CLI-52 : exige pour valider. Par defaut un code du referentiel de
    // test (voir prismaMock.diagnosticCim10.findUnique dans beforeEach),
    // ecrasable au cas par cas par les tests qui verifient son absence.
    diagnosticPrincipalCode: "B54",
    ...surcharges,
  };
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

const valider = { intent: "valider" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
  ordreVerifieMock.mockResolvedValue(true);
  prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", userId: "user-med", etablissementId: "etab-1" });
  prismaMock.patient.findUnique.mockResolvedValue({ id: "pat-1", dateNaissance: new Date(1990, 0, 15) });
  prismaMock.consentement.findUnique.mockResolvedValue({ statut: "actif", typeAcces: "dossier_complet", dateFin: new Date(MAINTENANT.getTime() + 3600_000) });
  prismaMock.consultation.findFirst.mockResolvedValue(null);
  // RG-ACC-15 : base d'acces en ecriture par defaut (rendez-vous confirme de
  // CE professionnel, aujourd'hui) - un consentement seul ne suffit jamais a
  // creer une consultation. Les tests qui portent specifiquement sur cette
  // regle l'ecrasent au cas par cas (mockResolvedValueOnce(null) ou variantes).
  prismaMock.rendezVous.findFirst.mockResolvedValue({
    id: "rdv-defaut",
    patientId: "pat-1",
    professionnelId: "pro-1",
    etablissementId: "etab-1",
    statut: "confirme",
    date: MAINTENANT,
    heureArrivee: null,
  });
  prismaMock.consultation.create.mockResolvedValue({ id: "c-new", rendezVousId: null, date: MAINTENANT, etablissementId: "etab-1" });
  prismaMock.consultation.update.mockResolvedValue({});
  prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.priseEnChargeInfirmiere.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.diagnosticCim10.findUnique.mockImplementation(async ({ where }: { where: { code: string } }) =>
    where.code === "B54" ? { code: "B54", libelle: "Paludisme, sans precision", sensible: false, actif: true } : null
  );
});

describe("qui peut enregistrer une consultation", () => {
  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await enregistrerConsultationAction(ETAT, formulaire())).success).toBe(false);
  });

  for (const role of ["infirmier", "pharmacien", "laboratoire", "agent_communautaire", "admin_etablissement", "admin_national", "patient"]) {
    it(`refuse le role ${role}, meme avec un profil professionnel`, async () => {
      getSessionMock.mockResolvedValue({ userId: "user-x", roles: [role] });
      const resultat = await enregistrerConsultationAction(ETAT, formulaire());
      expect(resultat.success).toBe(false);
      expect(resultat.error).toContain("medecins");
      expect(prismaMock.consultation.create).not.toHaveBeenCalled();
    });
  }

  it("refuse un compte medecin sans profil professionnel", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue(null);
    expect((await enregistrerConsultationAction(ETAT, formulaire())).success).toBe(false);
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it("refuse un patient inconnu", async () => {
    prismaMock.patient.findUnique.mockResolvedValue(null);
    expect((await enregistrerConsultationAction(ETAT, formulaire())).error).toContain("introuvable");
  });
});

describe("consentement du patient (RG-CLI-30)", () => {
  it("refuse sans consentement, sans rien ecrire", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(null);
    const resultat = await enregistrerConsultationAction(ETAT, formulaire());
    expect(resultat.error).toContain("consentement");
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it("refuse un consentement retire, expire, ou d'un type qui ne permet pas d'ecrire (urgence, examens, prescriptions, documents)", async () => {
    const cas = [
      { statut: "retire", typeAcces: "dossier_complet", dateFin: new Date(MAINTENANT.getTime() + 3600_000) },
      { statut: "actif", typeAcces: "dossier_complet", dateFin: new Date(MAINTENANT.getTime() - 1000) },
      { statut: "actif", typeAcces: "urgence", dateFin: new Date(MAINTENANT.getTime() + 3600_000) },
      { statut: "actif", typeAcces: "examens", dateFin: new Date(MAINTENANT.getTime() + 3600_000) },
      { statut: "actif", typeAcces: "prescriptions", dateFin: new Date(MAINTENANT.getTime() + 3600_000) },
      { statut: "actif", typeAcces: "documents", dateFin: new Date(MAINTENANT.getTime() + 3600_000) },
    ];
    for (const consentement of cas) {
      prismaMock.consentement.findUnique.mockResolvedValue(consentement);
      expect((await enregistrerConsultationAction(ETAT, formulaire())).success).toBe(false);
    }
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it("accepte dossier_complet et consultations", async () => {
    for (const typeAcces of ["dossier_complet", "consultations"]) {
      prismaMock.consentement.findUnique.mockResolvedValue({ statut: "actif", typeAcces, dateFin: new Date(MAINTENANT.getTime() + 3600_000) });
      expect((await enregistrerConsultationAction(ETAT, formulaire())).success).toBe(true);
    }
  });

  it("cherche le consentement au nom du medecin de la session", async () => {
    await enregistrerConsultationAction(ETAT, formulaire());
    expect(prismaMock.consentement.findUnique).toHaveBeenCalledWith({
      where: { patientId_acteurAutoriseId: { patientId: "pat-1", acteurAutoriseId: "user-med" } },
    });
  });
});

describe("constantes vitales (RG-CLI-50)", () => {
  it("refuse une valeur impossible, meme avec la confirmation", async () => {
    const resultat = await enregistrerConsultationAction(ETAT, formulaire({ temperatureCelsius: "50", confirmerAlerteConstantes: "on" }));
    expect(resultat.error).toBe("Valeur impossible, verifiez la saisie.");
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it("exige une confirmation pour une valeur inhabituelle, puis l'accepte", async () => {
    const sansConfirmation = await enregistrerConsultationAction(ETAT, formulaire({ temperatureCelsius: "39.4" }));
    expect(sansConfirmation.error).toContain("Confirmez");
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();

    const avecConfirmation = await enregistrerConsultationAction(ETAT, formulaire({ temperatureCelsius: "39.4", confirmerAlerteConstantes: "on" }));
    expect(avecConfirmation.success).toBe(true);
  });

  it("utilise l'age du patient : un pouls de 85 est inhabituel pour un enfant de 4 ans", async () => {
    prismaMock.patient.findUnique.mockResolvedValue({ id: "pat-1", dateNaissance: new Date(2022, 0, 15) });
    const resultat = await enregistrerConsultationAction(ETAT, formulaire({ pouls: "85" }));
    expect(resultat.error).toContain("Confirmez");
  });

  it("refuse une tension systolique inferieure a la diastolique", async () => {
    const resultat = await enregistrerConsultationAction(ETAT, formulaire({ tensionSystolique: "70", tensionDiastolique: "90" }));
    expect(resultat.error).toBe("Valeur impossible, verifiez la saisie.");
  });
});

describe("brouillon (RG-CLI-40, RG-CLI-41)", () => {
  it("cree un brouillon sans motif ni conclusion, le journalise et ne valide rien", async () => {
    const resultat = await enregistrerConsultationAction(ETAT, formulaire({ motif: "", conclusion: "" }));

    expect(resultat).toEqual({ error: null, success: true, consultationId: "c-new", valide: false });
    expect(prismaMock.consultation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ patientId: "pat-1", professionnelId: "pro-1", etablissementId: "etab-1", statut: "brouillon", symptomes: JSON.stringify(["fievre", "maux de tete"]) }),
    });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "creation_brouillon", donneeConcernee: "consultation:c-new" });
    expect(evenementPilotageMock).not.toHaveBeenCalled();
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
  });

  it("reprend le brouillon existant du meme medecin pour ce patient au lieu d'en creer un second", async () => {
    prismaMock.consultation.findFirst.mockResolvedValue({ id: "c-brouillon", rendezVousId: null, date: MAINTENANT, etablissementId: "etab-1" });

    const resultat = await enregistrerConsultationAction(ETAT, formulaire());

    expect(resultat).toMatchObject({ success: true, consultationId: "c-brouillon" });
    expect(prismaMock.consultation.findFirst).toHaveBeenCalledWith({ where: { patientId: "pat-1", professionnelId: "pro-1", statut: "brouillon" } });
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
    expect(prismaMock.consultation.update).toHaveBeenCalledTimes(1);
  });

  it("marque la prise en charge infirmiere comme recuperee a la creation seulement", async () => {
    await enregistrerConsultationAction(ETAT, formulaire({ priseEnChargeId: "pec-1" }));
    expect(prismaMock.priseEnChargeInfirmiere.updateMany).toHaveBeenCalledWith({
      where: { id: "pec-1", patientId: "pat-1", statut: "en_attente" },
      data: { statut: "recuperee", consultationRattacheeId: "c-new" },
    });

    prismaMock.priseEnChargeInfirmiere.updateMany.mockClear();
    prismaMock.consultation.findFirst.mockResolvedValue({ id: "c-brouillon", rendezVousId: null, date: MAINTENANT, etablissementId: "etab-1" });
    await enregistrerConsultationAction(ETAT, formulaire({ priseEnChargeId: "pec-1" }));
    expect(prismaMock.priseEnChargeInfirmiere.updateMany).not.toHaveBeenCalled();
  });

  it("n'accepte qu'un rendez-vous de ce patient et de ce medecin", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue({ id: "rdv-1", patientId: "pat-autre", professionnelId: "pro-1" });
    expect((await enregistrerConsultationAction(ETAT, formulaire({ rendezVousId: "rdv-1" }))).error).toContain("rendez-vous est introuvable");

    prismaMock.rendezVous.findUnique.mockResolvedValue({ id: "rdv-1", patientId: "pat-1", professionnelId: "pro-autre" });
    expect((await enregistrerConsultationAction(ETAT, formulaire({ rendezVousId: "rdv-1" }))).error).toContain("rendez-vous est introuvable");

    prismaMock.rendezVous.findUnique.mockResolvedValue({ id: "rdv-1", patientId: "pat-1", professionnelId: "pro-1" });
    expect((await enregistrerConsultationAction(ETAT, formulaire({ rendezVousId: "rdv-1" }))).success).toBe(true);
    expect(prismaMock.consultation.create.mock.calls.at(-1)?.[0].data.rendezVousId).toBe("rdv-1");
  });
});

describe("base d'acces en ecriture a la CREATION d'une consultation (RG-ACC-15)", () => {
  it("refuse la creation quand ni un contexte de soins (B4) ni un rendez-vous confirme du jour (B3) n'existe, meme avec un consentement actif", async () => {
    prismaMock.rendezVous.findFirst.mockResolvedValue(null);

    const resultat = await enregistrerConsultationAction(ETAT, formulaire());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("Un consentement seul ne permet pas de creer une consultation");
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it("accepte via un contexte de soins B4 (patient arrive dans l'etablissement), meme sans rendez-vous avec ce professionnel precis", async () => {
    prismaMock.rendezVous.findFirst.mockResolvedValue({
      id: "rdv-arrivee",
      patientId: "pat-1",
      professionnelId: "pro-autre",
      etablissementId: "etab-1",
      statut: "demande",
      date: new Date(MAINTENANT.getTime() + 3 * 24 * 3600_000),
      heureArrivee: new Date(MAINTENANT.getTime() - 3600_000),
    });

    const resultat = await enregistrerConsultationAction(ETAT, formulaire());

    expect(resultat.success).toBe(true);
  });

  it("interroge la base sur une fenetre de 72 h exactement pour le contexte de soins B4", async () => {
    prismaMock.rendezVous.findFirst.mockResolvedValue(null);

    await enregistrerConsultationAction(ETAT, formulaire());

    const critere = prismaMock.rendezVous.findFirst.mock.calls[0][0];
    const seuilAttendu = new Date(MAINTENANT.getTime() - 72 * 3600_000);
    expect(critere.where.OR[0].heureArrivee.gte).toEqual(seuilAttendu);
    expect(critere.where.OR[0].etablissementId).toBe("etab-1");
    expect(critere.where.OR[1]).toMatchObject({ professionnelId: "pro-1", statut: "confirme" });
  });

  it("accepte via un rendez-vous confirme du jour avec CE professionnel, meme sans arrivee enregistree", async () => {
    prismaMock.rendezVous.findFirst.mockResolvedValue({
      id: "rdv-confirme",
      patientId: "pat-1",
      professionnelId: "pro-1",
      etablissementId: "etab-1",
      statut: "confirme",
      date: MAINTENANT,
      heureArrivee: null,
    });

    const resultat = await enregistrerConsultationAction(ETAT, formulaire());

    expect(resultat.success).toBe(true);
  });

  it("ne re-verifie jamais cette base pour la mise a jour d'un brouillon deja ouvert (base B7, auteur)", async () => {
    prismaMock.rendezVous.findFirst.mockResolvedValue(null);
    prismaMock.consultation.findFirst.mockResolvedValue({ id: "c-brouillon", rendezVousId: null, date: MAINTENANT, etablissementId: "etab-1" });

    const resultat = await enregistrerConsultationAction(ETAT, formulaire());

    expect(resultat.success).toBe(true);
    expect(prismaMock.rendezVous.findFirst).not.toHaveBeenCalled();
  });
});

describe("mise a jour d'un brouillon identifie par le formulaire (Zero Trust)", () => {
  const brouillon = { id: "c-1", patientId: "pat-1", professionnelId: "pro-1", statut: "brouillon", rendezVousId: null, date: MAINTENANT, etablissementId: "etab-1" };

  it("met a jour son propre brouillon", async () => {
    prismaMock.consultation.findUnique.mockResolvedValue(brouillon);
    const resultat = await enregistrerConsultationAction(ETAT, formulaire({ consultationId: "c-1" }));
    expect(resultat).toMatchObject({ success: true, consultationId: "c-1" });
    expect(prismaMock.consultation.update).toHaveBeenCalledTimes(1);
  });

  it("refuse une consultation inconnue ou celle d'un autre medecin", async () => {
    prismaMock.consultation.findUnique.mockResolvedValue(null);
    expect((await enregistrerConsultationAction(ETAT, formulaire({ consultationId: "c-1" }))).error).toContain("introuvable");

    prismaMock.consultation.findUnique.mockResolvedValue({ ...brouillon, professionnelId: "pro-autre" });
    expect((await enregistrerConsultationAction(ETAT, formulaire({ consultationId: "c-1" }))).error).toContain("introuvable");

    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
  });

  it("refuse un brouillon d'un AUTRE patient : le consentement verifie doit etre celui du patient de la consultation", async () => {
    prismaMock.consultation.findUnique.mockResolvedValue({ ...brouillon, patientId: "pat-autre" });

    const resultat = await enregistrerConsultationAction(ETAT, formulaire({ consultationId: "c-1", ...valider }));

    expect(resultat.error).toContain("introuvable");
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
    expect(evenementPilotageMock).not.toHaveBeenCalled();
  });

  it("refuse de modifier une consultation deja validee (contenu verrouille)", async () => {
    prismaMock.consultation.findUnique.mockResolvedValue({ ...brouillon, statut: "terminee" });

    const resultat = await enregistrerConsultationAction(ETAT, formulaire({ consultationId: "c-1" }));

    expect(resultat.error).toContain("deja validee");
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
  });
});

describe("validation (CA-1, RG-CLI-61)", () => {
  it("exige un motif et une conclusion", async () => {
    const sansConclusion = await enregistrerConsultationAction(ETAT, formulaire({ ...valider, conclusion: "" }));
    expect(sansConclusion.error).toBe("Impossible de valider : renseignez conclusion.");

    const sansMotif = await enregistrerConsultationAction(ETAT, formulaire({ ...valider, motif: "  " }));
    expect(sansMotif.error).toBe("Impossible de valider : renseignez motif.");

    const sansRien = await enregistrerConsultationAction(ETAT, formulaire({ ...valider, motif: "", conclusion: "" }));
    expect(sansRien.error).toBe("Impossible de valider : renseignez motif, conclusion.");

    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it("RG-CLI-52, CA-1 du pack : sans diagnostic principal, la validation est refusee avec la liste des champs manquants", async () => {
    const resultat = await enregistrerConsultationAction(ETAT, formulaire({ ...valider, diagnosticPrincipalCode: "" }));

    expect(resultat.error).toBe("Impossible de valider : renseignez diagnostic principal (CIM-10).");
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it("refuse un code de diagnostic introuvable ou desactive, meme pour un simple brouillon", async () => {
    const resultat = await enregistrerConsultationAction(ETAT, formulaire({ diagnosticPrincipalCode: "Z99.9" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("introuvable");
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
  });

  it("RG-CLI-52 : un code du chapitre symptomes (R00-R99) force la certitude 'suspecte', quel que soit le choix saisi", async () => {
    prismaMock.diagnosticCim10.findUnique.mockResolvedValue({ code: "R50.9", libelle: "Fievre, sans precision", sensible: false, actif: true });

    await enregistrerConsultationAction(
      ETAT,
      formulaire({ ...valider, diagnosticPrincipalCode: "R50.9", diagnosticPrincipalCertitude: "confirme" })
    );

    expect(prismaMock.consultation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ diagnosticPrincipalCertitude: "suspecte" }) })
    );
  });

  it("RG-CLI-53 : un diagnostic principal d'un groupe sensible marque la consultation sensible", async () => {
    prismaMock.diagnosticCim10.findUnique.mockResolvedValue({ code: "B20", libelle: "Maladie due au VIH", sensible: true, actif: true });

    await enregistrerConsultationAction(ETAT, formulaire({ diagnosticPrincipalCode: "B20" }));

    expect(prismaMock.consultation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sensible: true, diagnosticPrincipalLibelle: "Maladie due au VIH" }) })
    );
  });

  it("5 diagnostics secondaires au maximum, chacun revalide aupres du referentiel", async () => {
    prismaMock.diagnosticCim10.findUnique.mockImplementation(async ({ where }: { where: { code: string } }) =>
      where.code === "B54" ? { code: "B54", libelle: "Paludisme, sans precision", sensible: false, actif: true } : null
    );

    const troisSecondaires = await enregistrerConsultationAction(
      ETAT,
      formulaire({ diagnosticsSecondaires: JSON.stringify(["B54", "B54", "B54"]) })
    );
    expect(troisSecondaires.success).toBe(true);

    const troisCodesInvalides = await enregistrerConsultationAction(
      ETAT,
      formulaire({ diagnosticsSecondaires: JSON.stringify(["Z99.9"]) })
    );
    expect(troisCodesInvalides.success).toBe(false);

    const troisPlusDeCinq = await enregistrerConsultationAction(
      ETAT,
      formulaire({ diagnosticsSecondaires: JSON.stringify(["B54", "B54", "B54", "B54", "B54", "B54"]) })
    );
    expect(troisPlusDeCinq.success).toBe(false);
    expect(troisPlusDeCinq.error).toContain("5 diagnostics secondaires");
  });

  it("verrouille : statut terminee, date de validation, empreinte SHA-256, evenement de pilotage et journal", async () => {
    const resultat = await enregistrerConsultationAction(ETAT, formulaire(valider));

    expect(resultat).toEqual({ error: null, success: true, consultationId: "c-new", valide: true });
    const miseAJour = prismaMock.consultation.update.mock.calls.at(-1)?.[0];
    expect(miseAJour.where).toEqual({ id: "c-new" });
    expect(miseAJour.data).toMatchObject({ statut: "terminee", dateValidation: MAINTENANT });
    expect(miseAJour.data.empreinteContenu).toMatch(/^[0-9a-f]{64}$/);
    expect(evenementPilotageMock).toHaveBeenCalledWith(expect.anything(), { type: "consultation_validee", date: MAINTENANT, etablissementId: "etab-1" });
    expect(journaliserMock.mock.calls.map((c) => c[0].action)).toEqual(["creation_brouillon", "validation_consultation"]);
  });

  it("F-CLI-07 : notifie le patient a la validation, routee via destinataireNotificationPatient (personne a charge)", async () => {
    await enregistrerConsultationAction(ETAT, formulaire(valider));

    expect(creerNotificationMock).toHaveBeenCalledWith(
      "user-de-pat-1",
      "consultation",
      "Une consultation a ete finalisee dans votre dossier.",
      "/app/patient/dossier"
    );
  });

  it("ne notifie jamais le patient pour un simple enregistrement de brouillon (aucune signature)", async () => {
    await enregistrerConsultationAction(ETAT, formulaire());

    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("l'empreinte change des que le contenu change, et reste identique pour un contenu identique", async () => {
    const empreinte = async (surcharges: Record<string, string>) => {
      prismaMock.consultation.update.mockClear();
      await enregistrerConsultationAction(ETAT, formulaire({ ...valider, ...surcharges }));
      return prismaMock.consultation.update.mock.calls.at(-1)?.[0].data.empreinteContenu as string;
    };

    const a = await empreinte({});
    const b = await empreinte({});
    const c = await empreinte({ conclusion: "Paludisme grave" });

    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it("termine le rendez-vous lie, sans jamais bloquer la signature si son statut ne le permet pas", async () => {
    prismaMock.consultation.create.mockResolvedValue({ id: "c-new", rendezVousId: "rdv-1", date: MAINTENANT, etablissementId: "etab-1" });
    prismaMock.rendezVous.findUnique.mockResolvedValue({ id: "rdv-1", patientId: "pat-1", professionnelId: "pro-1" });

    await enregistrerConsultationAction(ETAT, formulaire({ ...valider, rendezVousId: "rdv-1" }));
    expect(prismaMock.rendezVous.updateMany).toHaveBeenCalledWith({
      where: { id: "rdv-1", statut: { in: ["demande", "confirme", "absent", "en_consultation"] } },
      data: { statut: "termine" },
    });

    // Rendez-vous deja annule : la transition est refusee (0 ligne) mais la consultation est bien validee.
    prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 0 });
    const resultat = await enregistrerConsultationAction(ETAT, formulaire({ ...valider, rendezVousId: "rdv-1" }));
    expect(resultat).toMatchObject({ success: true, valide: true });
  });

  it("un brouillon simple met le rendez-vous en consultation (IN_CARE), sans jamais le terminer ni bloquer le brouillon", async () => {
    prismaMock.consultation.create.mockResolvedValue({ id: "c-new", rendezVousId: "rdv-1", date: MAINTENANT, etablissementId: "etab-1" });
    prismaMock.rendezVous.findUnique.mockResolvedValue({ id: "rdv-1", patientId: "pat-1", professionnelId: "pro-1" });

    await enregistrerConsultationAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(prismaMock.rendezVous.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.rendezVous.updateMany).toHaveBeenCalledWith({
      where: { id: "rdv-1", statut: { in: ["demande", "confirme", "absent"] } },
      data: { statut: "en_consultation" },
    });

    // Rendez-vous deja annule : la transition est refusee, le brouillon est cree quand meme.
    prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 0 });
    const resultat = await enregistrerConsultationAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));
    expect(resultat).toMatchObject({ success: true, valide: false });
  });

  it("un brouillon sans rendez-vous ne touche a aucun rendez-vous", async () => {
    await enregistrerConsultationAction(ETAT, formulaire());
    expect(prismaMock.rendezVous.updateMany).not.toHaveBeenCalled();
  });
});

describe("numero d'Ordre non verifie (interrupteur professionnels.exige_validation_ordre)", () => {
  it("refuse la validation avec un message clair, sans rien ecrire ni publier", async () => {
    ordreVerifieMock.mockResolvedValue(false);

    const resultat = await enregistrerConsultationAction(ETAT, formulaire(valider));

    expect(resultat).toEqual({ error: "Votre numéro d'Ordre n'est pas encore vérifié par le ministère.", success: false });
    expect(ordreVerifieMock).toHaveBeenCalledWith("user-med");
    expect(prismaMock.consultation.create).not.toHaveBeenCalled();
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
    expect(evenementPilotageMock).not.toHaveBeenCalled();
  });

  it("laisse le medecin enregistrer un brouillon (seule la signature est controlee)", async () => {
    ordreVerifieMock.mockResolvedValue(false);

    const resultat = await enregistrerConsultationAction(ETAT, formulaire());

    expect(resultat).toMatchObject({ success: true, valide: false });
    expect(ordreVerifieMock).not.toHaveBeenCalled();
  });
});
