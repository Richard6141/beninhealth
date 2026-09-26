-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Medicament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "principeActif" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "forme" TEXT NOT NULL,
    "classeTherapeutique" TEXT NOT NULL DEFAULT '',
    "informationsComplementaires" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_Medicament" ("dosage", "forme", "id", "informationsComplementaires", "nom", "principeActif") SELECT "dosage", "forme", "id", "informationsComplementaires", "nom", "principeActif" FROM "Medicament";
DROP TABLE "Medicament";
ALTER TABLE "new_Medicament" RENAME TO "Medicament";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
