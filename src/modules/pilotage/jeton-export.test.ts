import { describe, expect, it, vi } from "vitest";

/**
 * Jeton de ré-authentification des exports de pilotage (F-PIL-05,
 * RG-PIL-40). NEXTAUTH_SECRET fixe pour une signature déterministe.
 */

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test-jeton-export" })) }));

import {
  DUREE_VALIDITE_JETON_EXPORT_SECONDES,
  creerJetonExport,
  verifierJetonExport,
  type ContenuJetonExport,
} from "./jeton-export";
import { createHmac } from "node:crypto";
import { creerJetonExportAudit, jetonExportAuditValide } from "@/modules/audit/jeton-export-audit";
import { creerJetonExportDonnees, jetonExportDonneesValide } from "@/modules/patient/jeton-export-donnees";

const CONTENU: ContenuJetonExport = {
  utilisateurId: "user-1",
  sessionId: "session-1",
  portee: "national",
  motif: "reunion",
};
const ATTENDU = { utilisateurId: "user-1", sessionId: "session-1", portee: "national" as const };
const T0 = Date.parse("2026-09-26T12:00:00.000Z");

describe("jeton d'export de pilotage", () => {
  it("un jeton valide restitue le motif signé", () => {
    const jeton = creerJetonExport(CONTENU, T0);
    expect(verifierJetonExport(jeton, ATTENDU, T0 + 1000)).toEqual({ ...CONTENU, motifTexte: undefined });
  });

  it("restitue le texte libre du motif « autre »", () => {
    const jeton = creerJetonExport({ ...CONTENU, motif: "autre", motifTexte: "Audit interne du trimestre" }, T0);
    expect(verifierJetonExport(jeton, ATTENDU, T0)?.motifTexte).toBe("Audit interne du trimestre");
  });

  it("est réutilisable pendant 5 minutes (PDF puis CSV), refusé ensuite", () => {
    const jeton = creerJetonExport(CONTENU, T0);
    expect(verifierJetonExport(jeton, ATTENDU, T0 + (DUREE_VALIDITE_JETON_EXPORT_SECONDES - 1) * 1000)).not.toBeNull();
    expect(verifierJetonExport(jeton, ATTENDU, T0 + (DUREE_VALIDITE_JETON_EXPORT_SECONDES + 1) * 1000)).toBeNull();
  });

  it("est refusé pour un autre utilisateur, une autre session ou une autre portée", () => {
    const jeton = creerJetonExport(CONTENU, T0);
    expect(verifierJetonExport(jeton, { ...ATTENDU, utilisateurId: "user-2" }, T0)).toBeNull();
    expect(verifierJetonExport(jeton, { ...ATTENDU, sessionId: "session-2" }, T0)).toBeNull();
    expect(verifierJetonExport(jeton, { ...ATTENDU, portee: "etablissement" }, T0)).toBeNull();
  });

  it("refuse un contenu modifié (le motif ne peut pas être changé après signature)", () => {
    const jeton = creerJetonExport(CONTENU, T0);
    const [donnee, signature] = jeton.split(".");
    const contenuFalsifie = JSON.parse(Buffer.from(donnee, "base64url").toString("utf8"));
    contenuFalsifie.m = "planification";
    const donneeFalsifiee = Buffer.from(JSON.stringify(contenuFalsifie), "utf8").toString("base64url");
    expect(verifierJetonExport(`${donneeFalsifiee}.${signature}`, ATTENDU, T0)).toBeNull();
  });

  it("n'est jamais interchangeable avec les jetons des autres usages (contexte HMAC distinct)", () => {
    const jetonPilotage = creerJetonExport(CONTENU, T0);
    const maintenant = new Date(T0);

    // Un jeton pilotage ne vaut ni pour l'export du journal d'audit, ni pour l'export patient.
    expect(jetonExportAuditValide(jetonPilotage, "user-1", maintenant)).toBe(false);
    expect(jetonExportDonneesValide(jetonPilotage, "user-1", maintenant)).toBe(false);

    // Et réciproquement.
    expect(verifierJetonExport(creerJetonExportAudit("user-1", maintenant), ATTENDU, T0)).toBeNull();
    expect(verifierJetonExport(creerJetonExportDonnees("user-1", maintenant), ATTENDU, T0)).toBeNull();

    // Même charge utile au format pilotage, mais signée avec la clé d'un autre contexte : refusée.
    const [donnee] = jetonPilotage.split(".");
    const signatureAutreContexte = createHmac("sha256", "secret-de-test-jeton-export:export-journal-audit")
      .update(donnee)
      .digest("base64url");
    expect(verifierJetonExport(`${donnee}.${signatureAutreContexte}`, ATTENDU, T0)).toBeNull();
  });

  it("refuse une signature altérée, un jeton mal formé ou absent", () => {
    const jeton = creerJetonExport(CONTENU, T0);
    expect(verifierJetonExport(`${jeton.slice(0, -2)}xx`, ATTENDU, T0)).toBeNull();
    expect(verifierJetonExport("n-importe-quoi", ATTENDU, T0)).toBeNull();
    expect(verifierJetonExport("a.b.c", ATTENDU, T0)).toBeNull();
    expect(verifierJetonExport("", ATTENDU, T0)).toBeNull();
    expect(verifierJetonExport(null, ATTENDU, T0)).toBeNull();
    expect(verifierJetonExport(undefined, ATTENDU, T0)).toBeNull();
  });
});
