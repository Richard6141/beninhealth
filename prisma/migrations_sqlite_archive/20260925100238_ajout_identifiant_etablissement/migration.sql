/*
  Warnings:

  - Added the required column `identifiant` to the `EtablissementSanitaire` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EtablissementSanitaire" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifiant" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "localisation" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "servicesDisponibles" TEXT NOT NULL DEFAULT '[]',
    "capacite" INTEGER NOT NULL
);
-- Retro-compatibilite : les etablissements deja existants recoivent un
-- identifiant BJ-SANTE-ETB-xxxx sequentiel (ordre de creation), au meme
-- format que les identifiants attribues aux nouveaux etablissements par
-- src/modules/identity/gestion-comptes.ts.
INSERT INTO "new_EtablissementSanitaire" ("id", "identifiant", "nom", "type", "localisation", "latitude", "longitude", "servicesDisponibles", "capacite")
SELECT "id", 'BJ-SANTE-ETB-' || printf('%04d', ROW_NUMBER() OVER (ORDER BY rowid)), "nom", "type", "localisation", "latitude", "longitude", "servicesDisponibles", "capacite"
FROM "EtablissementSanitaire";
DROP TABLE "EtablissementSanitaire";
ALTER TABLE "new_EtablissementSanitaire" RENAME TO "EtablissementSanitaire";
CREATE UNIQUE INDEX "EtablissementSanitaire_identifiant_key" ON "EtablissementSanitaire"("identifiant");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
