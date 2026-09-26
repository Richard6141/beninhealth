import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    patient: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    demandeAccesDossier: {
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    consentement: { findUnique: vi.fn(), upsert: vi.fn() },
    journalAudit: { count: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("bcryptjs", () => {
  const compare = vi.fn();
  const hash = vi.fn();
  return { default: { compare, hash }, compare, hash };
});
vi.mock("@/modules/administration/parametres", () => ({ estFonctionnaliteActive: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/actions", () => ({ creerNotification: vi.fn() }));
vi.mock("@/modules/transfert/envoi-code", () => ({ envoyerCodeDemande: vi.fn() }));

import bcrypt from "bcryptjs";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/actions";
import {
  confirmerCodeAccesAction,
  demanderAccesDossierAction,
  renvoyerCodeAccesAction,
} from "@/modules/transfert/actions";
import { envoyerCodeDemande } from "@/modules/transfert/envoi-code";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  patient: { findUnique: Mock; findMany: Mock };
  user: { findUnique: Mock };
  demandeAccesDossier: { count: Mock; create: Mock; updateMany: Mock; findFirst: Mock; findUnique: Mock };
  consentement: { findUnique: Mock; upsert: Mock };
  journalAudit: { count: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const flagMock = estFonctionnaliteActive as unknown as Mock;
const afterMock = after as unknown as Mock;
const hashMock = bcrypt.hash as unknown as Mock;
const compareMock = bcrypt.compare as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const notifierMock = creerNotification as unknown as Mock;
const envoyerMock = envoyerCodeDemande as unknown as Mock;

const NPI = "1234567890123";

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

const etatInitial = { error: null, success: false };

function patientTrouve(surcharges: Record<string, unknown> = {}) {
  return {
    id: "pat-1",
    userId: "user-pat",
    identifiantSante: "BJ-PAT-0001",
    user: { statut: "actif", telephone: "+229 97 00 00 00", prenom: "Koffi", nom: "Adjovi" },
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "pro-1", roles: ["medecin"] });
  flagMock.mockResolvedValue(true);
  p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-1", etablissementId: "etab-1", statutValidation: "valide" });
  p.patient.findUnique.mockResolvedValue(null);
  p.patient.findMany.mockResolvedValue([]);
  p.demandeAccesDossier.count.mockResolvedValue(0);
  p.demandeAccesDossier.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "dem-1",
    renvois: 0,
    ...data,
  }));
  p.demandeAccesDossier.updateMany.mockResolvedValue({ count: 1 });
  p.journalAudit.count.mockResolvedValue(0);
  hashMock.mockResolvedValue("hash-du-code");
});

const demandeNpi = { mode: "npi", npi: NPI, telephone: "", dateNaissance: "", motif: "consultation", dureeHeures: "24" };

describe("demanderAccesDossierAction : garde-fous", () => {
  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi))).success).toBe(false);
  });

  it("refuse un role sans la permission (patient)", async () => {
    getSessionMock.mockResolvedValue({ userId: "u", roles: ["patient"] });
    const resultat = await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi));
    expect(resultat.success).toBe(false);
    expect(p.demandeAccesDossier.create).not.toHaveBeenCalled();
  });

  it("refuse le mode NPI tant que la fonctionnalite access.by_npi est desactivee", async () => {
    flagMock.mockResolvedValue(false);
    const resultat = await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi));
    expect(resultat.success).toBe(false);
    expect(flagMock).toHaveBeenCalledWith("access.by_npi");
    expect(p.patient.findUnique).not.toHaveBeenCalled();
  });

  it("refuse un NPI qui n'a pas 13 chiffres, sans interroger la base de patients", async () => {
    const resultat = await demanderAccesDossierAction(etatInitial, formulaire({ ...demandeNpi, npi: "12345" }));
    expect(resultat.success).toBe(false);
    expect(p.patient.findUnique).not.toHaveBeenCalled();
  });

  it("refuse un motif ou une duree hors catalogue", async () => {
    expect((await demanderAccesDossierAction(etatInitial, formulaire({ ...demandeNpi, motif: "curiosite" }))).success).toBe(false);
    expect((await demanderAccesDossierAction(etatInitial, formulaire({ ...demandeNpi, dureeHeures: "9999" }))).success).toBe(false);
  });

  it("refuse un professionnel non valide", async () => {
    p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-1", etablissementId: "etab-1", statutValidation: "en_attente" });
    expect((await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi))).success).toBe(false);
  });

  it("bloque au-dela de 20 demandes par heure", async () => {
    p.demandeAccesDossier.count.mockResolvedValueOnce(20).mockResolvedValueOnce(0);
    const resultat = await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi));
    expect(resultat.success).toBe(false);
    expect(p.demandeAccesDossier.create).not.toHaveBeenCalled();
  });

  it("bloque au-dela de 10 demandes sans correspondance par heure (balayage)", async () => {
    p.demandeAccesDossier.count.mockResolvedValueOnce(10).mockResolvedValueOnce(10);
    const resultat = await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi));
    expect(resultat.success).toBe(false);
  });
});

describe("demanderAccesDossierAction : RG-CLI-10, meme reponse que le patient existe ou non", () => {
  it("patient existant : succes, demande liee au patient, envoi differe", async () => {
    p.patient.findUnique.mockResolvedValue(patientTrouve());
    const resultat = await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi));

    expect(resultat).toMatchObject({ error: null, success: true, demandeId: "dem-1" });
    expect(p.demandeAccesDossier.create.mock.calls[0][0].data).toMatchObject({
      patientId: "pat-1",
      demandeurId: "pro-1",
      etablissementId: "etab-1",
      modeRecherche: "npi",
      motif: "consultation",
      dureeAccesHeures: 24,
    });
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it("patient inexistant : meme succes, meme forme, aucun envoi", async () => {
    const existant = await (async () => {
      p.patient.findUnique.mockResolvedValue(patientTrouve());
      return demanderAccesDossierAction(etatInitial, formulaire(demandeNpi));
    })();

    vi.clearAllMocks();
    hashMock.mockResolvedValue("hash-du-code");
    p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-1", etablissementId: "etab-1", statutValidation: "valide" });
    p.demandeAccesDossier.count.mockResolvedValue(0);
    p.demandeAccesDossier.updateMany.mockResolvedValue({ count: 1 });
    p.demandeAccesDossier.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "dem-2", ...data }));
    p.patient.findUnique.mockResolvedValue(null);

    const inexistant = await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi));

    expect(Object.keys(inexistant).sort()).toEqual(Object.keys(existant).sort());
    expect(inexistant).toMatchObject({ error: null, success: true });
    expect(p.demandeAccesDossier.create.mock.calls[0][0].data.patientId).toBeNull();
    expect(afterMock).not.toHaveBeenCalled();
    // Le hash est calcule dans les deux cas : pas de difference de temps liee a bcrypt.
    expect(hashMock).toHaveBeenCalledTimes(1);
  });

  it("ne renvoie jamais le code, ni son empreinte, ni le NPI dans la reponse", async () => {
    p.patient.findUnique.mockResolvedValue(patientTrouve());
    const resultat = JSON.stringify(await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi)));
    expect(resultat).not.toContain(NPI);
    expect(resultat).not.toContain("hash-du-code");
    const codeHache = hashMock.mock.calls[0][0] as string;
    expect(resultat).not.toContain(codeHache);
  });

  it("ne stocke ni le NPI ni le telephone en clair : uniquement une empreinte", async () => {
    p.patient.findUnique.mockResolvedValue(patientTrouve());
    await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi));
    const donnees = JSON.stringify(p.demandeAccesDossier.create.mock.calls[0][0].data);
    expect(donnees).not.toContain(NPI);
    expect(p.demandeAccesDossier.create.mock.calls[0][0].data.empreinteCritere).toMatch(/^[0-9a-f]{64}$/);
  });

  it("le code hache est celui passe a l'envoi differe", async () => {
    p.patient.findUnique.mockResolvedValue(patientTrouve());
    await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi));
    const codeHache = hashMock.mock.calls[0][0] as string;
    await (afterMock.mock.calls[0][0] as () => Promise<unknown>)();
    expect(envoyerMock).toHaveBeenCalledWith({ demandeId: "dem-1", code: codeHache, numeroEnvoi: 0 });
  });

  it("un professionnel qui saisit son propre NPI n'obtient aucun envoi", async () => {
    p.patient.findUnique.mockResolvedValue(patientTrouve({ userId: "pro-1" }));
    const resultat = await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi));
    expect(resultat.success).toBe(true);
    expect(afterMock).not.toHaveBeenCalled();
    expect(p.demandeAccesDossier.create.mock.calls[0][0].data.patientId).toBeNull();
  });

  it("un patient deja sollicite 5 fois en 24 h ne recoit rien de plus, sans que le demandeur le sache", async () => {
    p.patient.findUnique.mockResolvedValue(patientTrouve());
    p.demandeAccesDossier.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(0);
    const resultat = await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi));
    expect(resultat.success).toBe(true);
    expect(afterMock).not.toHaveBeenCalled();
    expect(p.demandeAccesDossier.create.mock.calls[0][0].data.patientId).toBeNull();
    expect(journaliserMock.mock.calls.at(-1)?.[0].action).toBe("acces_dossier_demande_limitee");
  });

  it("un meme demandeur ne peut pas depasser 3 demandes par patient et par jour", async () => {
    p.patient.findUnique.mockResolvedValue(patientTrouve());
    p.demandeAccesDossier.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(3);
    await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi));
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("une demande precedente en attente pour le meme patient est invalidee", async () => {
    p.patient.findUnique.mockResolvedValue(patientTrouve());
    await demanderAccesDossierAction(etatInitial, formulaire(demandeNpi));
    expect(p.demandeAccesDossier.updateMany).toHaveBeenCalledWith({
      where: { demandeurId: "pro-1", patientId: "pat-1", statut: "en_attente" },
      data: { statut: "expire" },
    });
  });
});

describe("demanderAccesDossierAction : mode telephone + date de naissance", () => {
  const demandeTel = { mode: "telephone", npi: "", telephone: "0197000000", dateNaissance: "1990-05-04", motif: "avis_specialise", dureeHeures: "72" };

  it("rapproche un telephone saisi sous une autre forme que celui enregistre", async () => {
    p.patient.findMany.mockResolvedValue([patientTrouve()]);
    await demanderAccesDossierAction(etatInitial, formulaire(demandeTel));
    expect(p.patient.findMany.mock.calls[0][0].where.dateNaissance).toEqual(new Date("1990-05-04"));
    expect(p.demandeAccesDossier.create.mock.calls[0][0].data.patientId).toBe("pat-1");
  });

  it("deux dossiers avec le meme telephone et la meme date valent 'aucun resultat'", async () => {
    p.patient.findMany.mockResolvedValue([patientTrouve(), patientTrouve({ id: "pat-2", userId: "user-2" })]);
    await demanderAccesDossierAction(etatInitial, formulaire(demandeTel));
    expect(p.demandeAccesDossier.create.mock.calls[0][0].data.patientId).toBeNull();
  });

  it("ignore un dossier dont le telephone est different", async () => {
    p.patient.findMany.mockResolvedValue([patientTrouve({ user: { statut: "actif", telephone: "+229 96 11 11 11" } })]);
    await demanderAccesDossierAction(etatInitial, formulaire(demandeTel));
    expect(p.demandeAccesDossier.create.mock.calls[0][0].data.patientId).toBeNull();
  });

  it("n'exige pas la fonctionnalite access.by_npi", async () => {
    flagMock.mockResolvedValue(false);
    p.patient.findMany.mockResolvedValue([patientTrouve()]);
    expect((await demanderAccesDossierAction(etatInitial, formulaire(demandeTel))).success).toBe(true);
  });

  it("refuse un numero non beninois ou une date invalide", async () => {
    expect((await demanderAccesDossierAction(etatInitial, formulaire({ ...demandeTel, telephone: "+33612345678" }))).success).toBe(false);
    expect((await demanderAccesDossierAction(etatInitial, formulaire({ ...demandeTel, dateNaissance: "04/05/1990" }))).success).toBe(false);
  });
});

describe("confirmerCodeAccesAction", () => {
  const demandeEnCours = {
    id: "dem-1",
    demandeurId: "pro-1",
    patientId: "pat-1",
    patient: patientTrouve(),
    etablissement: { nom: "CNHU-HKM de Cotonou" },
    modeRecherche: "npi",
    motif: "consultation",
    dureeAccesHeures: 24,
    codeHash: "hash-du-code",
    tentatives: 0,
    statut: "en_attente",
  };

  beforeEach(() => {
    p.demandeAccesDossier.findFirst.mockResolvedValue({ ...demandeEnCours });
    p.consentement.findUnique.mockResolvedValue(null);
    p.user.findUnique.mockResolvedValue({ prenom: "Awa", nom: "Sossou" });
    compareMock.mockResolvedValue(true);
  });

  const saisie = { demandeId: "dem-1", code: "482913" };

  it("un bon code cree un consentement 'consultations' de la duree demandee, journalise et notifie le patient", async () => {
    const avant = Date.now();
    const resultat = await confirmerCodeAccesAction({ error: null, success: false }, formulaire(saisie));

    expect(resultat).toEqual({ error: null, success: true, patientId: "pat-1" });
    const appel = p.consentement.upsert.mock.calls[0][0];
    expect(appel.create).toMatchObject({ patientId: "pat-1", acteurAutoriseId: "pro-1", typeAcces: "consultations", statut: "actif" });
    const dureeMs = (appel.create.dateFin as Date).getTime() - avant;
    expect(dureeMs).toBeGreaterThan(24 * 3600_000 - 5_000);
    expect(dureeMs).toBeLessThan(24 * 3600_000 + 5_000);
    expect(journaliserMock.mock.calls.at(-1)?.[0]).toMatchObject({
      action: "acces_dossier_code_reussi",
      donneeConcernee: "patient:pat-1",
    });
    expect(notifierMock).toHaveBeenCalledWith("user-pat", "acces_dossier_code", expect.stringContaining("Awa Sossou"), "/app/patient/consentements");
  });

  it("accepte un code dicte avec espaces", async () => {
    const resultat = await confirmerCodeAccesAction({ error: null, success: false }, formulaire({ ...saisie, code: "482 913" }));
    expect(resultat.success).toBe(true);
    expect(compareMock).toHaveBeenCalledWith("482913", "hash-du-code");
  });

  it("un mauvais code echoue avec le message generique et n'accorde rien", async () => {
    compareMock.mockResolvedValue(false);
    const resultat = await confirmerCodeAccesAction({ error: null, success: false }, formulaire(saisie));
    expect(resultat).toEqual({ error: "Code invalide ou expiré.", success: false });
    expect(p.consentement.upsert).not.toHaveBeenCalled();
    expect(journaliserMock.mock.calls.at(-1)?.[0].action).toBe("acces_dossier_code_echec");
  });

  it("le 3e mauvais essai bloque la demande", async () => {
    compareMock.mockResolvedValue(false);
    p.demandeAccesDossier.findFirst.mockResolvedValue({ ...demandeEnCours, tentatives: 2 });
    await confirmerCodeAccesAction({ error: null, success: false }, formulaire(saisie));
    expect(p.demandeAccesDossier.updateMany).toHaveBeenLastCalledWith({
      where: { id: "dem-1", statut: "en_attente" },
      data: { statut: "bloque" },
    });
  });

  it("une demande expiree, bloquee ou deja utilisee est refusee sans comparer le code", async () => {
    p.demandeAccesDossier.updateMany.mockResolvedValue({ count: 0 });
    const resultat = await confirmerCodeAccesAction({ error: null, success: false }, formulaire(saisie));
    expect(resultat).toEqual({ error: "Code invalide ou expiré.", success: false });
    expect(compareMock).not.toHaveBeenCalled();
  });

  it("une demande d'un autre professionnel est traitee comme introuvable", async () => {
    p.demandeAccesDossier.findFirst.mockResolvedValue(null);
    const resultat = await confirmerCodeAccesAction({ error: null, success: false }, formulaire(saisie));
    expect(resultat).toEqual({ error: "Code invalide ou expiré.", success: false });
    expect(p.demandeAccesDossier.findFirst.mock.calls[0][0].where).toMatchObject({ demandeurId: "pro-1" });
  });

  it("une demande sans patient (aucune correspondance) ne donne jamais acces, meme avec le code du hash", async () => {
    p.demandeAccesDossier.findFirst.mockResolvedValue({ ...demandeEnCours, patientId: null, patient: null });
    const resultat = await confirmerCodeAccesAction({ error: null, success: false }, formulaire(saisie));
    expect(resultat).toEqual({ error: "Code invalide ou expiré.", success: false });
    expect(compareMock).toHaveBeenCalledTimes(1);
    expect(p.consentement.upsert).not.toHaveBeenCalled();
  });

  it("deux confirmations simultanees : la seconde ne cree pas de second acces", async () => {
    p.demandeAccesDossier.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const resultat = await confirmerCodeAccesAction({ error: null, success: false }, formulaire(saisie));
    expect(resultat.success).toBe(false);
    expect(p.consentement.upsert).not.toHaveBeenCalled();
  });

  it("ne retrograde jamais un acces 'dossier_complet' plus long deja accorde par le patient", async () => {
    const dansUnMois = new Date(Date.now() + 30 * 24 * 3600_000);
    p.consentement.findUnique.mockResolvedValue({ statut: "actif", typeAcces: "dossier_complet", dateFin: dansUnMois });
    await confirmerCodeAccesAction({ error: null, success: false }, formulaire(saisie));
    const appel = p.consentement.upsert.mock.calls[0][0];
    expect(appel.update.typeAcces).toBe("dossier_complet");
    expect(appel.update.dateFin).toEqual(dansUnMois);
  });

  it("un acces d'urgence existant est remplace par 'consultations'", async () => {
    p.consentement.findUnique.mockResolvedValue({ statut: "actif", typeAcces: "urgence", dateFin: new Date(Date.now() + 3600_000) });
    await confirmerCodeAccesAction({ error: null, success: false }, formulaire(saisie));
    expect(p.consentement.upsert.mock.calls[0][0].update.typeAcces).toBe("consultations");
  });

  it("bloque un professionnel apres 10 echecs en une heure", async () => {
    p.journalAudit.count.mockResolvedValue(10);
    const resultat = await confirmerCodeAccesAction({ error: null, success: false }, formulaire(saisie));
    expect(resultat.success).toBe(false);
    expect(p.demandeAccesDossier.findFirst).not.toHaveBeenCalled();
  });

  it("refuse un code qui n'a pas 6 chiffres sans toucher la base", async () => {
    const resultat = await confirmerCodeAccesAction({ error: null, success: false }, formulaire({ ...saisie, code: "12" }));
    expect(resultat.success).toBe(false);
    expect(p.demandeAccesDossier.findFirst).not.toHaveBeenCalled();
  });

  it("refuse un role sans la permission", async () => {
    getSessionMock.mockResolvedValue({ userId: "u", roles: ["pharmacien"] });
    expect((await confirmerCodeAccesAction({ error: null, success: false }, formulaire(saisie))).success).toBe(false);
  });

  it("l'echec de la notification n'annule pas l'acces accorde", async () => {
    notifierMock.mockRejectedValueOnce(new Error("panne"));
    const resultat = await confirmerCodeAccesAction({ error: null, success: false }, formulaire(saisie));
    expect(resultat.success).toBe(true);
  });
});

describe("renvoyerCodeAccesAction", () => {
  it("renvoie un nouveau code, remet les essais a zero et programme l'envoi", async () => {
    p.demandeAccesDossier.findUnique.mockResolvedValue({ id: "dem-1", patientId: "pat-1", renvois: 1 });
    const resultat = await renvoyerCodeAccesAction(etatInitial, formulaire({ demandeId: "dem-1" }));

    expect(resultat).toMatchObject({ success: true, demandeId: "dem-1" });
    const misAJour = p.demandeAccesDossier.updateMany.mock.calls[0][0];
    expect(misAJour.where).toMatchObject({ id: "dem-1", demandeurId: "pro-1", statut: "en_attente", renvois: { lt: 2 } });
    expect(misAJour.data).toMatchObject({ tentatives: 0, renvois: { increment: 1 } });
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it("meme reponse mais aucun envoi quand la demande n'a pas de patient", async () => {
    p.demandeAccesDossier.findUnique.mockResolvedValue({ id: "dem-1", patientId: null, renvois: 1 });
    expect((await renvoyerCodeAccesAction(etatInitial, formulaire({ demandeId: "dem-1" }))).success).toBe(true);
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("refuse au-dela de 2 renvois ou pour une demande expiree", async () => {
    p.demandeAccesDossier.updateMany.mockResolvedValue({ count: 0 });
    expect((await renvoyerCodeAccesAction(etatInitial, formulaire({ demandeId: "dem-1" }))).success).toBe(false);
    expect(afterMock).not.toHaveBeenCalled();
  });
});
