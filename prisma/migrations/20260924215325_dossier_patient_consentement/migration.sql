-- CreateTable
CREATE TABLE "Consentement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "acteurAutoriseId" TEXT NOT NULL,
    "typeAcces" TEXT NOT NULL,
    "dateDebut" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" DATETIME,
    "statut" TEXT NOT NULL DEFAULT 'actif',
    CONSTRAINT "Consentement_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Consentement_acteurAutoriseId_fkey" FOREIGN KEY ("acteurAutoriseId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "identifiantSante" TEXT NOT NULL,
    "referenceIdentiteNationale" TEXT,
    "dateNaissance" DATETIME NOT NULL,
    "sexe" TEXT NOT NULL,
    "groupeSanguin" TEXT NOT NULL DEFAULT 'inconnu',
    "contactsUrgence" TEXT NOT NULL DEFAULT '[]',
    "allergies" TEXT NOT NULL DEFAULT '[]',
    "antecedents" TEXT NOT NULL DEFAULT '[]',
    "maladiesChroniques" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Patient" ("contactsUrgence", "dateNaissance", "groupeSanguin", "id", "identifiantSante", "referenceIdentiteNationale", "sexe", "userId") SELECT "contactsUrgence", "dateNaissance", "groupeSanguin", "id", "identifiantSante", "referenceIdentiteNationale", "sexe", "userId" FROM "Patient";
DROP TABLE "Patient";
ALTER TABLE "new_Patient" RENAME TO "Patient";
CREATE UNIQUE INDEX "Patient_userId_key" ON "Patient"("userId");
CREATE UNIQUE INDEX "Patient_identifiantSante_key" ON "Patient"("identifiantSante");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Consentement_patientId_acteurAutoriseId_key" ON "Consentement"("patientId", "acteurAutoriseId");
