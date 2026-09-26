import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * `vitest run` ne charge pas .env automatiquement (contrairement a `next
 * dev`/aux commandes Prisma CLI) : ce test etant le premier a avoir besoin
 * d'une vraie variable d'environnement, on la lit nous-memes plutot que
 * d'ajouter une dependance dotenv pour ce seul besoin.
 */
function chargerVariableEnvDepuisFichier(nom: string): string | undefined {
  if (process.env[nom]) return process.env[nom];
  try {
    const contenu = readFileSync(path.resolve(__dirname, "../../../.env"), "utf-8");
    for (const ligne of contenu.split("\n")) {
      const [cle, ...reste] = ligne.split("=");
      if (cle.trim() === nom) return reste.join("=").trim().replace(/^"|"$/g, "");
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Test d'integration pour RG-PIL-04 du pack : verifie reellement, contre la
 * base Postgres, que le role `analytics_reader` (prisma/analytics-role.sql)
 * peut lire le schema "analytics" mais n'a aucun droit sur le schema
 * "public" (dossiers patients, journal d'audit, etc.). Contrairement aux
 * autres tests de ce depot (jamais de vraie connexion base de donnees), ce
 * test doit se connecter reellement : une isolation de permissions Postgres
 * ne peut pas etre prouvee par un mock, seul le moteur de base de donnees
 * l'applique. Ignore silencieusement si ANALYTICS_READER_DATABASE_URL n'est
 * pas configuree (environnement sans ce role provisionne).
 */

const url = chargerVariableEnvDepuisFichier("ANALYTICS_READER_DATABASE_URL");
const decrire = url ? describe : describe.skip;

decrire("role analytics_reader (RG-PIL-04)", () => {
  it("peut lire le schema analytics", async () => {
    const client = new PrismaClient({ datasources: { db: { url } } });
    try {
      await expect(client.agregatQuotidien.findMany({ take: 1 })).resolves.toBeDefined();
    } finally {
      await client.$disconnect();
    }
  });

  it("ne peut pas lire le schema public (aucune donnee nominative accessible)", async () => {
    const client = new PrismaClient({ datasources: { db: { url } } });
    try {
      await expect(client.user.findMany({ take: 1 })).rejects.toThrow();
      await expect(client.patient.findMany({ take: 1 })).rejects.toThrow();
      await expect(client.journalAudit.findMany({ take: 1 })).rejects.toThrow();
    } finally {
      await client.$disconnect();
    }
  });
});
