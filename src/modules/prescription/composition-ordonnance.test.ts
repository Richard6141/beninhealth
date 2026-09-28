import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    consultation: { findUnique: vi.fn(), findMany: vi.fn() },
    priseEnChargeInfirmiere: { findMany: vi.fn() },
    patient: { findUnique: vi.fn() },
    medicament: { findMany: vi.fn() },
    prescription: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
    evenementPrescription: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});

vi.mock("@/lib/session", () => ({ getSession: vi.fn(), destroySession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("bcryptjs", () => {
  const compare = vi.fn();
  return { default: { compare }, compare };
});
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
// F-PIL-07 : IND-08 (ordonnances), hors du perimetre de ce fichier.
vi.mock("@/modules/pilotage/file-taches", () => ({ publierEvenementPilotage: vi.fn(async () => undefined) }));
// Frontiere du module : la fenetre de grace de 5 minutes et le compteur
// d'echecs (RG-PRE-30 / RG-AUTH-53) sont testes dans leur propre fichier
// (identity/reauthentification.test.ts), pas ici. Toujours "non recente,
// jamais bloquee" : ces tests continuent d'exiger et de valider le mot de
// passe, comme avant ce correctif. motDePasseEtCodeMfaValides n'est PAS
// mockee : elle appelle bcrypt.compare et prisma.user.findUnique, deja
// mockes ci-dessus, exactement comme le faisait actions.ts avant que cette
// verification soit deplacee dans le module partage.
vi.mock("@/modules/identity/reauthentification", async () => {
  const reel = await vi.importActual<typeof import("@/modules/identity/reauthentification")>(
    "@/modules/identity/reauthentification"
  );
  return {
    ...reel,
    reauthentificationRecente: vi.fn(() => false),
    reauthentificationBloquee: vi.fn(() => false),
    enregistrerReauthentificationReussie: vi.fn(),
    enregistrerEchecReauthentification: vi.fn(() => false),
  };
});
// Frontiere du module : la logique interne (routage vers le tuteur d'une
// personne a charge) est testee dans son propre fichier
// (facility/destinataire-notification-patient.test.ts), pas ici.
vi.mock("@/modules/facility/destinataire-notification-patient", () => ({
  destinataireNotificationPatient: vi.fn(async (patientId: string) => patientId),
}));
vi.mock("@/modules/administration/validation-professionnels-controle", () => ({
  professionnelValide: vi.fn(async () => true),
  MESSAGE_ORDRE_NON_VERIFIE: "Votre numéro d'Ordre n'est pas encore vérifié par le ministère.",
}));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { creerPrescriptionAction, renouvelerPrescriptionAction } from "@/modules/prescription/actions";
import { PREFIXE_EMPREINTE, verifierIntegriteOrdonnance } from "./empreinte";

const p = prisma as unknown as {
  user: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
  consultation: { findUnique: Mock; findMany: Mock };
  priseEnChargeInfirmiere: { findMany: Mock };
  patient: { findUnique: Mock };
  medicament: { findMany: Mock };
  prescription: { findMany: Mock; findUnique: Mock; count: Mock; create: Mock };
  evenementPrescription: { create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const compareMock = bcrypt.compare as unknown as Mock;

const MAINTENANT = new Date("2026-09-26T12:00:00.000Z");
const ilYaJours = (jours: number) => new Date(MAINTENANT.getTime() - jours * 24 * 60 * 60 * 1000);
const etatInitial = { error: null, success: false };

function medicaments(nombre: number) {
  return Array.from({ length: nombre }, (_, i) => ({
    id: `med-${i}`,
    nom: `Medicament ${i}`,
    principeActif: `principe-${i}`,
    dosage: "500 mg",
    forme: "comprime",
    classeTherapeutique: `classe-${i}`,
    ageMinimumMois: null,
    contreIndiqueGrossesse: false,
  }));
}

function lignesSoumises(nombre: number, dureeJours = 7) {
  return medicaments(nombre).map((medicament) => ({
    medicamentId: medicament.id,
    dose: 1,
    unite: "comprime",
    voie: "orale",
    frequenceMode: "fois_par_jour",
    frequenceFoisParJour: 1,
    quantite: 7,
    dureeTraitementJours: dureeJours,
  }));
}

function formulaireCreation(lignes: unknown[]): FormData {
  const donnees = new FormData();
  donnees.set("consultationId", "cons-1");
  donnees.set("instructions", "Apres les repas");
  donnees.set("motDePasseSignature", "Demo1234!");
  donnees.set("lignesJSON", JSON.stringify(lignes));
  return donnees;
}

function patient(dateNaissance: string) {
  return {
    id: "pat-1",
    dateNaissance: new Date(dateNaissance),
    allergies: "[]",
    sexe: "M",
    grossesseEnCours: false,
  };
}

const ADULTE = "1990-05-01";
const ENFANT_DE_HUIT_ANS = "2018-03-10";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);

  getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
  compareMock.mockResolvedValue(true);
  p.user.findUnique.mockResolvedValue({ id: "user-med", motDePasseHash: "hash" });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1" });
  p.consultation.findUnique.mockResolvedValue({
    id: "cons-1",
    professionnelId: "pro-1",
    patientId: "pat-1",
    etablissementId: "etab-1",
  });
  p.consultation.findMany.mockResolvedValue([]);
  p.priseEnChargeInfirmiere.findMany.mockResolvedValue([]);
  p.patient.findUnique.mockResolvedValue(patient(ADULTE));
  p.medicament.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    medicaments(12).filter((medicament) => where.id.in.includes(medicament.id))
  );
  p.prescription.findMany.mockResolvedValue([]);
  p.prescription.count.mockResolvedValue(0);
  p.prescription.create.mockResolvedValue({ id: "presc-1" });
  p.evenementPrescription.create.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("creerPrescriptionAction, RG-PRE-01 (de 1 a 10 lignes)", () => {
  it("refuse 11 lignes sans rien enregistrer", async () => {
    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(11)));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("plus de 10 lignes");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });

  it("accepte 10 lignes dont une de 90 jours, et enregistre une empreinte verifiable", async () => {
    const lignes = lignesSoumises(10);
    lignes[0].dureeTraitementJours = 90;

    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignes));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.prescription.create).toHaveBeenCalledTimes(1);

    const { data } = p.prescription.create.mock.calls[0][0] as {
      data: {
        patientId: string;
        medecinPrescripteurId: string;
        date: Date;
        instructions: string;
        empreinteContenu: string;
        lignes: {
          create: {
            medicamentId: string;
            posologie: string;
            quantite: number;
            dureeTraitementJours: number;
          }[];
        };
      };
    };

    expect(data.lignes.create).toHaveLength(10);
    expect(data.empreinteContenu.startsWith(PREFIXE_EMPREINTE)).toBe(true);

    // CA-2 : l'empreinte recalculee sur ce qui a ete ecrit correspond a celle enregistree.
    const relue = {
      patientId: data.patientId,
      prescripteurId: data.medecinPrescripteurId,
      etablissementId: "etab-1",
      date: data.date,
      instructions: data.instructions,
      lignes: data.lignes.create.map((ligne) => ({ ...ligne, nonSubstituable: false })),
    };
    expect(verifierIntegriteOrdonnance(data.empreinteContenu, relue)).toBe("conforme");
  });

  it("refuse une ordonnance sans ligne", async () => {
    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation([]));

    expect(resultat.success).toBe(false);
    expect(p.prescription.create).not.toHaveBeenCalled();
  });
});

describe("creerPrescriptionAction, duree bornee a 90 jours", () => {
  it("refuse 91 jours", async () => {
    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(1, 91)));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("90 jours");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });
});

describe("creerPrescriptionAction, RG-PRE-02 (poids sous 12 ans)", () => {
  beforeEach(() => {
    p.patient.findUnique.mockResolvedValue(patient(ENFANT_DE_HUIT_ANS));
  });

  it("refuse la signature sans aucun poids", async () => {
    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(1)));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("poids");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });

  it("refuse un poids relevé il y a plus de 30 jours", async () => {
    p.consultation.findMany.mockResolvedValue([{ date: ilYaJours(40), poidsKg: 24 }]);

    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(1)));

    expect(resultat.success).toBe(false);
    expect(p.prescription.create).not.toHaveBeenCalled();
  });

  it("accepte un poids de consultation relevé il y a 20 jours", async () => {
    p.consultation.findMany.mockResolvedValue([{ date: ilYaJours(20), poidsKg: 24 }]);

    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(1)));

    expect(resultat).toEqual({ error: null, success: true });
  });

  it("accepte un poids relevé par l'infirmier lors d'une prise en charge recente", async () => {
    p.priseEnChargeInfirmiere.findMany.mockResolvedValue([{ date: ilYaJours(1), poidsKg: 24.5 }]);

    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(1)));

    expect(resultat).toEqual({ error: null, success: true });
  });

  it("ne demande aucun poids a un adulte", async () => {
    p.patient.findUnique.mockResolvedValue(patient(ADULTE));

    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(1)));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.priseEnChargeInfirmiere.findMany).not.toHaveBeenCalled();
  });
});

describe("renouvelerPrescriptionAction", () => {
  function ancienne(surcharge: Record<string, unknown> = {}, nombreLignes = 2, dureeJours = 7) {
    return {
      id: "presc-ancienne",
      numero: "RX-2026-0001",
      patientId: "pat-1",
      instructions: "Apres les repas",
      patient: patient(ADULTE),
      lignes: medicaments(nombreLignes).map((medicament) => ({
        medicamentId: medicament.id,
        medicament,
        posologie: "1 comprime 1 fois par jour",
        quantite: 7,
        dureeTraitementJours: dureeJours,
        nonSubstituable: false,
      })),
      ...surcharge,
    };
  }

  function formulaireRenouvellement(): FormData {
    const donnees = new FormData();
    donnees.set("prescriptionId", "presc-ancienne");
    donnees.set("consultationId", "cons-1");
    donnees.set("motDePasseSignature", "Demo1234!");
    return donnees;
  }

  it("refuse de renouveler une ordonnance de plus de 10 lignes", async () => {
    p.prescription.findUnique.mockResolvedValue(ancienne({}, 11));

    const resultat = await renouvelerPrescriptionAction(etatInitial, formulaireRenouvellement());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("plus de 10 lignes");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });

  it("refuse de renouveler une ligne de plus de 90 jours", async () => {
    p.prescription.findUnique.mockResolvedValue(ancienne({}, 2, 120));

    const resultat = await renouvelerPrescriptionAction(etatInitial, formulaireRenouvellement());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("90 jours");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });

  it("refuse de renouveler pour un enfant de moins de 12 ans sans poids recent", async () => {
    p.prescription.findUnique.mockResolvedValue(ancienne({ patient: patient(ENFANT_DE_HUIT_ANS) }));

    const resultat = await renouvelerPrescriptionAction(etatInitial, formulaireRenouvellement());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("poids");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });

  it("renouvelle une ordonnance conforme et enregistre une empreinte verifiable", async () => {
    p.prescription.findUnique.mockResolvedValue(ancienne());

    const resultat = await renouvelerPrescriptionAction(etatInitial, formulaireRenouvellement());

    expect(resultat).toEqual({ error: null, success: true });
    const { data } = p.prescription.create.mock.calls[0][0] as {
      data: {
        patientId: string;
        medecinPrescripteurId: string;
        date: Date;
        instructions: string;
        empreinteContenu: string;
        lignes: { create: { medicamentId: string; posologie: string; quantite: number; dureeTraitementJours: number; nonSubstituable: boolean }[] };
      };
    };

    const relue = {
      patientId: data.patientId,
      prescripteurId: data.medecinPrescripteurId,
      etablissementId: "etab-1",
      date: data.date,
      instructions: data.instructions,
      lignes: data.lignes.create,
    };
    expect(verifierIntegriteOrdonnance(data.empreinteContenu, relue)).toBe("conforme");
  });
});

describe("creerPrescriptionAction, non substituable (F-PRE-01, RG-PHA-12)", () => {
  const MOTIF = "Index therapeutique etroit, ne pas remplacer";

  type DonneesCreation = {
    patientId: string;
    medecinPrescripteurId: string;
    date: Date;
    instructions: string;
    empreinteContenu: string;
    lignes: {
      create: {
        medicamentId: string;
        posologie: string;
        quantite: number;
        dureeTraitementJours: number;
        nonSubstituable: boolean;
        motifNonSubstituable: string | null;
      }[];
    };
  };

  function donneesCreees(): DonneesCreation {
    return (p.prescription.create.mock.calls[0][0] as { data: DonneesCreation }).data;
  }

  it("enregistre l'indicateur et le motif sur la ligne concernee seulement", async () => {
    const lignes = lignesSoumises(2) as Record<string, unknown>[];
    lignes[0].nonSubstituable = true;
    lignes[0].motifNonSubstituable = `  ${MOTIF}  `;

    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignes));

    expect(resultat).toEqual({ error: null, success: true });
    const { lignes: creees } = donneesCreees();
    expect(creees.create[0]).toMatchObject({ nonSubstituable: true, motifNonSubstituable: MOTIF });
    expect(creees.create[1]).toMatchObject({ nonSubstituable: false, motifNonSubstituable: null });
  });

  it("couvre l'indicateur par l'empreinte : la modifier apres coup rend l'ordonnance alteree (CA-2)", async () => {
    const lignes = lignesSoumises(1) as Record<string, unknown>[];
    lignes[0].nonSubstituable = true;
    lignes[0].motifNonSubstituable = MOTIF;

    await creerPrescriptionAction(etatInitial, formulaireCreation(lignes));

    const data = donneesCreees();
    const contenu = (nonSubstituable: boolean) => ({
      patientId: data.patientId,
      prescripteurId: data.medecinPrescripteurId,
      etablissementId: "etab-1",
      date: data.date,
      instructions: data.instructions,
      lignes: data.lignes.create.map((ligne) => ({ ...ligne, nonSubstituable })),
    });

    expect(verifierIntegriteOrdonnance(data.empreinteContenu, contenu(true))).toBe("conforme");
    expect(verifierIntegriteOrdonnance(data.empreinteContenu, contenu(false))).toBe("alteree");
  });

  it("refuse la case cochee sans motif, avec un motif trop court ou fait d'espaces", async () => {
    for (const motif of [undefined, "", "court", "          "]) {
      vi.clearAllMocks();
      const lignes = lignesSoumises(1) as Record<string, unknown>[];
      lignes[0].nonSubstituable = true;
      if (motif !== undefined) lignes[0].motifNonSubstituable = motif;

      const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignes));

      expect(resultat.success, String(motif)).toBe(false);
      expect(resultat.error, String(motif)).toContain("motif de non substitution");
      expect(p.prescription.create).not.toHaveBeenCalled();
    }
  });

  it("refuse un motif de plus de 200 caracteres", async () => {
    const lignes = lignesSoumises(1) as Record<string, unknown>[];
    lignes[0].nonSubstituable = true;
    lignes[0].motifNonSubstituable = "x".repeat(201);

    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignes));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("200");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });

  it("n'enregistre jamais un motif saisi puis abandonne (case decochee)", async () => {
    const lignes = lignesSoumises(1) as Record<string, unknown>[];
    lignes[0].nonSubstituable = false;
    lignes[0].motifNonSubstituable = MOTIF;

    await creerPrescriptionAction(etatInitial, formulaireCreation(lignes));

    expect(donneesCreees().lignes.create[0]).toMatchObject({ nonSubstituable: false, motifNonSubstituable: null });
  });

  it("refuse un medicament retire du referentiel (RG-PRE-20), meme si l'identifiant est connu", async () => {
    p.medicament.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      medicaments(12)
        .filter((medicament) => where.id.in.includes(medicament.id))
        .map((medicament) => ({ ...medicament, actif: medicament.id !== "med-0" }))
    );

    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(2)));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("retire du referentiel");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });
});
