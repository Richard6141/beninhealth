import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * F-AUD-01 (F-AUD, journal d'audit) : export CSV avec motif et
 * re-authentification (verifierMotDePasseExportCsvAuditAction,
 * genererCsvJournalAudit), et un premier test de fumee pour
 * rechercherJournalAudit (jamais teste dans ce depot avant ce jour, aussi
 * peu que le refactor introduit ici, construireContexteRechercheAudit).
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));
vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test" })) }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    journalAudit: { count: vi.fn(), findMany: vi.fn() },
    etablissementSanitaire: { findMany: vi.fn() },
  },
}));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerJetonExportAudit } from "./jeton-export-audit";
import {
  genererCsvJournalAudit,
  rechercherJournalAudit,
  verifierMotDePasseExportCsvAuditAction,
} from "./actions";

const p = prisma as unknown as {
  user: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
  journalAudit: { count: Mock; findMany: Mock };
  etablissementSanitaire: { findMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const bcryptCompareMock = bcrypt.compare as unknown as Mock;

const MAINTENANT = new Date("2026-09-27T12:00:00.000Z");

function formulaire(champs: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

const FILTRES = { dateDebut: "2026-09-01", dateFin: "2026-09-27" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_national"] });
  p.user.findUnique.mockResolvedValue({ id: "admin-1", motDePasseHash: "hash" });
  bcryptCompareMock.mockResolvedValue(true);
  p.journalAudit.count.mockResolvedValue(0);
  p.journalAudit.findMany.mockResolvedValue([]);
  p.etablissementSanitaire.findMany.mockResolvedValue([]);
});

describe("rechercherJournalAudit (fumee, apres refactor construireContexteRechercheAudit)", () => {
  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await rechercherJournalAudit(FILTRES)).toBeNull();
  });

  it("refuse un role sans read:journal_audit", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-1", roles: ["patient"] });
    expect(await rechercherJournalAudit(FILTRES)).toBeNull();
  });

  it("refuse une periode de plus de 31 jours", async () => {
    const resultat = await rechercherJournalAudit({ dateDebut: "2026-01-01", dateFin: "2026-09-27" });
    expect(resultat).toBeNull();
  });

  it("renvoie un resultat pagine pour un role autorise et une periode valide", async () => {
    p.journalAudit.count.mockResolvedValue(1);
    p.journalAudit.findMany.mockResolvedValue([
      {
        id: "ja-1",
        date: MAINTENANT,
        action: "connexion",
        donneeConcernee: "utilisateur:u-2",
        adresseTechnique: "1.2.3.4",
        justification: "test",
        utilisateur: { nom: "Doe", prenom: "Jane", roles: [{ nom: "medecin" }], professionnel: null },
      },
    ]);

    const resultat = await rechercherJournalAudit(FILTRES);

    expect(resultat).not.toBeNull();
    expect(resultat?.total).toBe(1);
    expect(resultat?.entrees[0].acteurNomComplet).toBe("Jane Doe");
  });
});

describe("verifierMotDePasseExportCsvAuditAction (F-AUD-01)", () => {
  const CHAMPS = { motDePasse: "secret", motif: "controle mensuel des acces", ...FILTRES };

  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    const resultat = await verifierMotDePasseExportCsvAuditAction({ error: null, success: false }, formulaire(CHAMPS));
    expect(resultat.success).toBe(false);
    expect(resultat.jeton).toBeUndefined();
  });

  it("refuse un role sans read:journal_audit", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-1", roles: ["patient"] });
    const resultat = await verifierMotDePasseExportCsvAuditAction({ error: null, success: false }, formulaire(CHAMPS));
    expect(resultat.success).toBe(false);
  });

  it("refuse un motif trop court", async () => {
    const resultat = await verifierMotDePasseExportCsvAuditAction(
      { error: null, success: false },
      formulaire({ ...CHAMPS, motif: "court" })
    );
    expect(resultat.success).toBe(false);
    expect(resultat.error).toMatch(/motif/i);
  });

  it("refuse un mot de passe incorrect, sans delivrer de jeton", async () => {
    bcryptCompareMock.mockResolvedValue(false);
    const resultat = await verifierMotDePasseExportCsvAuditAction({ error: null, success: false }, formulaire(CHAMPS));
    expect(resultat).toEqual({ error: "Mot de passe incorrect.", success: false });
  });

  it("delivre un jeton et journalise le motif apres re-authentification reussie", async () => {
    const resultat = await verifierMotDePasseExportCsvAuditAction({ error: null, success: false }, formulaire(CHAMPS));

    expect(resultat.success).toBe(true);
    expect(resultat.jeton).toBeTruthy();
    const [appel] = journaliserMock.mock.calls;
    expect(appel[0].action).toBe("export_journal_audit_demande");
    expect(appel[0].justification).toContain("controle mensuel des acces");
  });
});

describe("genererCsvJournalAudit (F-AUD-01)", () => {
  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    const resultat = await genererCsvJournalAudit(FILTRES, "peu-importe");
    expect(resultat).toEqual({ error: "Authentification requise." });
  });

  it("refuse sans jeton valide, meme avec une session valide", async () => {
    const resultat = await genererCsvJournalAudit(FILTRES, null);
    expect(resultat).toEqual({ error: "Confirmation du mot de passe requise ou expirée." });
  });

  it("refuse un jeton d'un autre compte", async () => {
    const jeton = creerJetonExportAudit("autre-compte", MAINTENANT);
    const resultat = await genererCsvJournalAudit(FILTRES, jeton);
    expect(resultat).toEqual({ error: "Confirmation du mot de passe requise ou expirée." });
  });

  it("genere un CSV avec BOM UTF-8, en-tetes, et les lignes de la recherche, echappees", async () => {
    p.journalAudit.findMany.mockResolvedValue([
      {
        id: "ja-1",
        date: MAINTENANT,
        action: "connexion",
        donneeConcernee: "utilisateur:u-2",
        adresseTechnique: "1.2.3.4",
        justification: 'Contient une virgule, et des "guillemets"',
        utilisateur: { nom: "Doe", prenom: "Jane", roles: [{ nom: "medecin" }], professionnel: null },
      },
    ]);
    const jeton = creerJetonExportAudit("admin-1", MAINTENANT);

    const resultat = await genererCsvJournalAudit(FILTRES, jeton);

    expect("contenu" in resultat).toBe(true);
    if (!("contenu" in resultat)) throw new Error("attendu");
    expect(resultat.contenu.startsWith("﻿")).toBe(true);
    const lignes = resultat.contenu.slice(1).split("\r\n");
    expect(lignes[0]).toBe("Date,Acteur,Rôle,Établissement,Action,Concerne,Justification");
    expect(lignes[1]).toContain('"Contient une virgule, et des ""guillemets"""');
    expect(lignes[1]).toContain("Jane Doe");
  });

  it("journalise le telechargement avec le nombre de lignes exportees", async () => {
    p.journalAudit.findMany.mockResolvedValue([
      {
        id: "ja-1",
        date: MAINTENANT,
        action: "connexion",
        donneeConcernee: "utilisateur:u-2",
        adresseTechnique: "1.2.3.4",
        justification: "test",
        utilisateur: { nom: "Doe", prenom: "Jane", roles: [{ nom: "medecin" }], professionnel: null },
      },
    ]);
    const jeton = creerJetonExportAudit("admin-1", MAINTENANT);

    await genererCsvJournalAudit(FILTRES, jeton);

    const [appel] = journaliserMock.mock.calls;
    expect(appel[0].action).toBe("export_journal_audit_telecharge");
    expect(appel[0].justification).toContain("1 ligne");
  });

  it("produit un CSV vide (en-tetes seuls) sans erreur pour une periode sans resultat", async () => {
    const jeton = creerJetonExportAudit("admin-1", MAINTENANT);

    const resultat = await genererCsvJournalAudit(FILTRES, jeton);

    expect("contenu" in resultat).toBe(true);
    if (!("contenu" in resultat)) throw new Error("attendu");
    expect(resultat.contenu.slice(1).split("\r\n")).toHaveLength(1);
  });
});
