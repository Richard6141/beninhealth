import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Acces d'urgence "bris de glace" (F-CLI-10, RG-CLI-90 a RG-CLI-93). Prisma est
 * simule : ces tests fixent les regles de decision (qui peut, quand, combien
 * de fois, pour combien de temps, avec quelles traces), pas l'acces base.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn(async () => undefined) }));
// Frontiere du module : la logique interne (routage vers le tuteur d'une
// personne a charge) est testee dans son propre fichier
// (facility/destinataire-notification-patient.test.ts), pas ici.
vi.mock("@/modules/facility/destinataire-notification-patient", () => ({
  destinataireNotificationPatient: vi.fn(async (patientId: string) => `destinataire-de-${patientId}`),
}));
vi.mock("@/modules/identity/mfa-totp", () => ({ verifierCodeMfaPourConnexion: vi.fn() }));
vi.mock("@/modules/administration/parametres-lecture", () => ({ lireParametre: vi.fn(async () => 5) }));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn(), findMany: vi.fn() },
    patient: { findUnique: vi.fn() },
    journalAudit: { count: vi.fn() },
    consentement: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (rappel: (tx: unknown) => unknown) => rappel(prisma));
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { verifierCodeMfaPourConnexion } from "@/modules/identity/mfa-totp";
import { destinataireNotificationPatient } from "@/modules/facility/destinataire-notification-patient";
import { lireParametre } from "@/modules/administration/parametres-lecture";
import { viderCompteursDebit } from "@/lib/limite-debit";
import { declencherAccesUrgenceAction } from "./actions";

const prismaMock = prisma as unknown as {
  user: { findUnique: Mock };
  professionnelSante: { findUnique: Mock; findMany: Mock };
  patient: { findUnique: Mock };
  journalAudit: { count: Mock };
  consentement: { findUnique: Mock; upsert: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;
const verifierMfaMock = verifierCodeMfaPourConnexion as unknown as Mock;
const destinataireNotificationPatientMock = destinataireNotificationPatient as unknown as Mock;
const lireParametreMock = lireParametre as unknown as Mock;

const ETAT = { error: null, success: false };
const JUSTIFICATION = "Patient retrouve inconscient a l'accueil, sans accompagnant ni carte.";

function formulaire(surcharges: Record<string, string> = {}): FormData {
  const champs = {
    identifiantSante: "BJ-2026-000042",
    motif: "patient_inconscient",
    justification: JUSTIFICATION,
    codeTotp: "123456",
    ...surcharges,
  };
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

const MAINTENANT = new Date("2026-09-26T10:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  viderCompteursDebit();
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
  prismaMock.user.findUnique.mockResolvedValue({ id: "user-med", mfaActif: true });
  verifierMfaMock.mockResolvedValue(true);
  lireParametreMock.mockResolvedValue(5);
  prismaMock.professionnelSante.findUnique.mockResolvedValue({
    id: "pro-1",
    userId: "user-med",
    etablissementId: "etab-1",
    etablissement: { nom: "CHU de Parakou" },
  });
  prismaMock.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-pat", identifiantSante: "BJ-2026-000042" });
  prismaMock.journalAudit.count.mockResolvedValue(0);
  prismaMock.consentement.findUnique.mockResolvedValue(null);
  prismaMock.consentement.upsert.mockResolvedValue({});
  prismaMock.professionnelSante.findMany.mockResolvedValue([{ userId: "admin-etab" }]);
});

describe("qui peut declencher un acces d'urgence", () => {
  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire());
    expect(resultat.success).toBe(false);
    expect(prismaMock.consentement.upsert).not.toHaveBeenCalled();
  });

  for (const role of ["patient", "pharmacien", "laboratoire", "agent_communautaire", "admin_etablissement", "admin_national"]) {
    it(`refuse le role ${role}`, async () => {
      getSessionMock.mockResolvedValue({ userId: "user-x", roles: [role] });
      const resultat = await declencherAccesUrgenceAction(ETAT, formulaire());
      expect(resultat.success).toBe(false);
      expect(resultat.error).toContain("pas autorise");
      expect(prismaMock.consentement.upsert).not.toHaveBeenCalled();
      expect(verifierMfaMock).not.toHaveBeenCalled();
    });
  }

  it("autorise le medecin et l'infirmier", async () => {
    for (const role of ["medecin", "infirmier"]) {
      getSessionMock.mockResolvedValue({ userId: "user-med", roles: [role] });
      const resultat = await declencherAccesUrgenceAction(ETAT, formulaire());
      expect(resultat.success).toBe(true);
    }
  });
});

describe("validation de la demande (CA-1)", () => {
  it("refuse une justification de moins de 20 caracteres, sans rien ecrire", async () => {
    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire({ justification: "Urgence." }));
    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("20 caracteres");
    expect(prismaMock.consentement.upsert).not.toHaveBeenCalled();
    expect(verifierMfaMock).not.toHaveBeenCalled();
  });

  it("compte la justification sans les espaces de debut et de fin", async () => {
    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire({ justification: `   ${"a".repeat(19)}   ` }));
    expect(resultat.success).toBe(false);
  });

  it("accepte 20 caracteres et refuse plus de 500", async () => {
    expect((await declencherAccesUrgenceAction(ETAT, formulaire({ justification: "a".repeat(20) }))).success).toBe(true);
    expect((await declencherAccesUrgenceAction(ETAT, formulaire({ justification: "a".repeat(501) }))).success).toBe(false);
  });

  it("refuse un motif hors de la liste du pack", async () => {
    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire({ motif: "curiosite" }));
    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("Motif");
  });

  it("refuse un code de double authentification qui n'a pas 6 chiffres", async () => {
    for (const code of ["12345", "1234567", "abcdef", ""]) {
      const resultat = await declencherAccesUrgenceAction(ETAT, formulaire({ codeTotp: code }));
      expect(resultat.success).toBe(false);
    }
    expect(verifierMfaMock).not.toHaveBeenCalled();
  });
});

describe("re-authentification (RG-AUTH-53)", () => {
  it("refuse si la double authentification n'est pas activee sur le compte", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-med", mfaActif: false });
    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire());
    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("MFA");
    expect(prismaMock.consentement.upsert).not.toHaveBeenCalled();
  });

  it("refuse un code TOTP incorrect sans ouvrir d'acces ni interroger le patient", async () => {
    verifierMfaMock.mockResolvedValue(false);
    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire());
    expect(resultat).toEqual({ error: "Code de double authentification incorrect.", success: false });
    expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.consentement.upsert).not.toHaveBeenCalled();
  });

  it("verrouille apres 5 codes incorrects : meme un code correct est ensuite refuse, sans le verifier", async () => {
    verifierMfaMock.mockResolvedValue(false);
    for (let i = 0; i < 5; i++) {
      await declencherAccesUrgenceAction(ETAT, formulaire());
    }
    expect(verifierMfaMock).toHaveBeenCalledTimes(5);

    verifierMfaMock.mockResolvedValue(true);
    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("Trop de codes");
    expect(verifierMfaMock).toHaveBeenCalledTimes(5);
    expect(prismaMock.consentement.upsert).not.toHaveBeenCalled();
  });

  it("le verrouillage tombe apres 15 minutes", async () => {
    verifierMfaMock.mockResolvedValue(false);
    for (let i = 0; i < 5; i++) {
      await declencherAccesUrgenceAction(ETAT, formulaire());
    }

    vi.setSystemTime(new Date(MAINTENANT.getTime() + 15 * 60 * 1000 + 1000));
    verifierMfaMock.mockResolvedValue(true);

    expect((await declencherAccesUrgenceAction(ETAT, formulaire())).success).toBe(true);
  });

  it("le verrouillage est propre a chaque professionnel", async () => {
    verifierMfaMock.mockResolvedValue(false);
    for (let i = 0; i < 5; i++) {
      await declencherAccesUrgenceAction(ETAT, formulaire());
    }

    getSessionMock.mockResolvedValue({ userId: "user-autre", roles: ["infirmier"] });
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-autre", mfaActif: true });
    verifierMfaMock.mockResolvedValue(true);

    expect((await declencherAccesUrgenceAction(ETAT, formulaire())).success).toBe(true);
  });

  it("les codes corrects ne comptent pas dans le verrouillage", async () => {
    for (let i = 0; i < 8; i++) {
      prismaMock.consentement.findUnique.mockResolvedValue(null);
      expect((await declencherAccesUrgenceAction(ETAT, formulaire())).success).toBe(true);
    }
  });

  it("verifie le code pour l'utilisateur de la session, jamais pour un id transmis par le formulaire", async () => {
    await declencherAccesUrgenceAction(ETAT, formulaire({ userId: "quelquun-d-autre" }));
    expect(verifierMfaMock).toHaveBeenCalledWith("user-med", "123456");
  });
});

describe("patient et profil", () => {
  it("refuse un identifiant sante inconnu", async () => {
    prismaMock.patient.findUnique.mockResolvedValue(null);
    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire());
    expect(resultat.success).toBe(false);
    expect(prismaMock.consentement.upsert).not.toHaveBeenCalled();
  });

  it("refuse un compte sans profil professionnel", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue(null);
    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire());
    expect(resultat.success).toBe(false);
    expect(prismaMock.consentement.upsert).not.toHaveBeenCalled();
  });
});

describe("quota de 5 acces par 24 heures (RG-CLI-90)", () => {
  it("compte les acces d'urgence du professionnel sur les 24 dernieres heures", async () => {
    await declencherAccesUrgenceAction(ETAT, formulaire());
    expect(prismaMock.journalAudit.count).toHaveBeenCalledWith({
      where: {
        utilisateurId: "user-med",
        action: "acces_urgence",
        date: { gte: new Date(MAINTENANT.getTime() - 24 * 60 * 60 * 1000) },
      },
    });
  });

  it("autorise le cinquieme acces (4 deja faits)", async () => {
    prismaMock.journalAudit.count.mockResolvedValue(4);
    expect((await declencherAccesUrgenceAction(ETAT, formulaire())).success).toBe(true);
  });

  it("refuse le sixieme acces, journalise la tentative refusee et n'ouvre rien", async () => {
    prismaMock.journalAudit.count.mockResolvedValue(5);

    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("5 acces");
    expect(prismaMock.consentement.upsert).not.toHaveBeenCalled();
    expect(journaliserMock).toHaveBeenCalledTimes(1);
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "user-med",
      action: "acces_urgence_refuse_quota",
      donneeConcernee: "patient:pat-1",
    });
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });
});

describe("limite d'acces d'urgence administrable (F-ADM-07, RG-ADM-50)", () => {
  it("lit la limite dans le parametre urgence.limite_acces_24h a chaque acces", async () => {
    await declencherAccesUrgenceAction(ETAT, formulaire());
    await declencherAccesUrgenceAction(ETAT, formulaire());

    expect(lireParametreMock).toHaveBeenCalledTimes(2);
    expect(lireParametreMock).toHaveBeenCalledWith("urgence.limite_acces_24h");
  });

  it("une limite abaissee a 2 refuse le troisieme acces et l'annonce dans le message", async () => {
    lireParametreMock.mockResolvedValue(2);
    prismaMock.journalAudit.count.mockResolvedValue(2);

    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("2 acces");
    expect(prismaMock.consentement.upsert).not.toHaveBeenCalled();
    expect(journaliserMock.mock.calls[0][0].justification).toContain("Quota de 2 acces");
  });

  it("une limite relevee a 8 autorise le sixieme acces", async () => {
    lireParametreMock.mockResolvedValue(8);
    prismaMock.journalAudit.count.mockResolvedValue(5);

    expect((await declencherAccesUrgenceAction(ETAT, formulaire())).success).toBe(true);
  });
});

describe("consentement existant (RG-CLI-93 : pas de prolongation)", () => {
  it("refuse quand le professionnel a deja un acces autorise et encore valide : l'urgence n'est pas necessaire", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue({
      statut: "actif",
      typeAcces: "dossier_complet",
      dateFin: new Date(MAINTENANT.getTime() + 60 * 60 * 1000),
    });

    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("disposez deja d'un acces autorise");
    expect(prismaMock.consentement.upsert).not.toHaveBeenCalled();
  });

  it("refuse la prolongation d'un acces d'urgence encore actif", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue({
      statut: "actif",
      typeAcces: "urgence",
      dateFin: new Date(MAINTENANT.getTime() + 60 * 60 * 1000),
    });

    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("Prolongation impossible");
    expect(prismaMock.consentement.upsert).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("autorise un nouvel acces quand le precedent acces d'urgence a expire", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue({
      statut: "actif",
      typeAcces: "urgence",
      dateFin: new Date(MAINTENANT.getTime() - 60 * 1000),
    });

    expect((await declencherAccesUrgenceAction(ETAT, formulaire())).success).toBe(true);
    expect(prismaMock.consentement.upsert).toHaveBeenCalledTimes(1);
  });

  it("autorise l'urgence quand l'ancien consentement a ete retire par le patient (sa ligne est reutilisee, jamais dupliquee)", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue({
      statut: "retire",
      typeAcces: "dossier_complet",
      dateFin: new Date(MAINTENANT.getTime() - 3600 * 1000),
    });

    expect((await declencherAccesUrgenceAction(ETAT, formulaire())).success).toBe(true);
    const appel = prismaMock.consentement.upsert.mock.calls[0][0];
    expect(appel.where).toEqual({ patientId_acteurAutoriseId: { patientId: "pat-1", acteurAutoriseId: "user-med" } });
  });
});

describe("ouverture de l'acces (CA-3 : 4 heures exactement)", () => {
  it("ouvre un consentement de type urgence de 4 heures et le journalise dans la meme transaction", async () => {
    const resultat = await declencherAccesUrgenceAction(ETAT, formulaire());

    const dateFin = new Date(MAINTENANT.getTime() + 4 * 60 * 60 * 1000);
    expect(resultat).toEqual({ error: null, success: true, patientId: "pat-1", dateFin: dateFin.toISOString() });
    expect(prismaMock.consentement.upsert).toHaveBeenCalledWith({
      where: { patientId_acteurAutoriseId: { patientId: "pat-1", acteurAutoriseId: "user-med" } },
      create: { patientId: "pat-1", acteurAutoriseId: "user-med", typeAcces: "urgence", statut: "actif", dateDebut: MAINTENANT, dateFin },
      update: { typeAcces: "urgence", statut: "actif", dateDebut: MAINTENANT, dateFin },
    });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "user-med",
      action: "acces_urgence",
      donneeConcernee: "patient:pat-1",
      justification: `Motif : patient_inconscient. ${JUSTIFICATION}`,
    });
  });

  it("le journal porte la justification complete du professionnel (CA-2 : visible avec elle dans l'historique du patient)", async () => {
    await declencherAccesUrgenceAction(ETAT, formulaire({ motif: "detresse_vitale", justification: "Arret cardiaque constate a l'entree des urgences." }));
    expect(journaliserMock.mock.calls[0][0].justification).toBe("Motif : detresse_vitale. Arret cardiaque constate a l'entree des urgences.");
  });
});

describe("notifications immediates", () => {
  it("previent le patient avec le nom de l'etablissement, sans jamais nommer le professionnel", async () => {
    await declencherAccesUrgenceAction(ETAT, formulaire());

    expect(creerNotificationMock).toHaveBeenCalledWith(
      "destinataire-de-pat-1",
      "acces_urgence",
      expect.stringContaining("CHU de Parakou")
    );
    const message = creerNotificationMock.mock.calls[0][2] as string;
    expect(message).not.toContain("user-med");
  });

  it("F-CLI-10 : la notification du patient est routee via destinataireNotificationPatient (personne a charge)", async () => {
    await declencherAccesUrgenceAction(ETAT, formulaire());

    expect(destinataireNotificationPatientMock).toHaveBeenCalledWith("pat-1");
    expect(creerNotificationMock.mock.calls[0][0]).toBe("destinataire-de-pat-1");
  });

  it("previent les administrateurs de l'etablissement du professionnel, avec l'heure d'expiration et un lien vers le dossier", async () => {
    await declencherAccesUrgenceAction(ETAT, formulaire());

    expect(prismaMock.professionnelSante.findMany).toHaveBeenCalledWith({
      where: { etablissementId: "etab-1", user: { roles: { some: { nom: "admin_etablissement" } } } },
      select: { userId: true },
    });
    expect(creerNotificationMock).toHaveBeenCalledWith(
      "admin-etab",
      "acces_urgence",
      expect.stringContaining("BJ-2026-000042"),
      "/app/medecin/patients/pat-1"
    );
  });

  it("aucune notification quand l'acces est refuse", async () => {
    verifierMfaMock.mockResolvedValue(false);
    await declencherAccesUrgenceAction(ETAT, formulaire());
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });
});
