/*
  Warnings:

  - Made the column `empreinteContenu` on table `Prescription` required. This step will fail if there are existing NULL values in that column.
  - Made the column `numero` on table `Prescription` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateTable
CREATE TABLE "Vaccination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "professionnelId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "vaccin" TEXT NOT NULL,
    "numeroDose" INTEGER NOT NULL,
    "dateAdministration" DATETIME NOT NULL,
    "numeroLot" TEXT NOT NULL,
    "siteInjection" TEXT NOT NULL,
    "voie" TEXT NOT NULL,
    "saisieParErreur" BOOLEAN NOT NULL DEFAULT false,
    "motifRetrait" TEXT,
    "dateCreation" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vaccination_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Vaccination_professionnelId_fkey" FOREIGN KEY ("professionnelId") REFERENCES "ProfessionnelSante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Vaccination_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentMedical" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "consultationId" TEXT,
    "type" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "dateDocument" DATETIME NOT NULL,
    "niveauConfidentialite" TEXT NOT NULL DEFAULT 'normal',
    "cheminFichier" TEXT NOT NULL,
    "nomFichierOriginal" TEXT NOT NULL,
    "typeMime" TEXT NOT NULL,
    "tailleOctets" INTEGER NOT NULL,
    "retirePourErreur" BOOLEAN NOT NULL DEFAULT false,
    "motifRetrait" TEXT,
    "dateCreation" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentMedical_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentMedical_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DocumentMedical_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriseEnChargeInfirmiere" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "infirmierId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "prioriteTri" TEXT NOT NULL,
    "temperatureCelsius" REAL,
    "pouls" INTEGER,
    "tensionSystolique" INTEGER,
    "tensionDiastolique" INTEGER,
    "frequenceRespiratoire" INTEGER,
    "saturationOxygene" INTEGER,
    "poidsKg" REAL,
    "tailleCm" REAL,
    "glycemieGL" REAL,
    "noteSoins" TEXT NOT NULL DEFAULT '',
    "statut" TEXT NOT NULL DEFAULT 'en_attente',
    "consultationRattacheeId" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriseEnChargeInfirmiere_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PriseEnChargeInfirmiere_infirmierId_fkey" FOREIGN KEY ("infirmierId") REFERENCES "ProfessionnelSante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PriseEnChargeInfirmiere_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PriseEnChargeInfirmiere_consultationRattacheeId_fkey" FOREIGN KEY ("consultationRattacheeId") REFERENCES "Consultation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Consultation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "professionnelId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "rendezVousId" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motif" TEXT NOT NULL DEFAULT '',
    "symptomes" TEXT NOT NULL DEFAULT '[]',
    "temperatureCelsius" REAL,
    "pouls" INTEGER,
    "tensionSystolique" INTEGER,
    "tensionDiastolique" INTEGER,
    "frequenceRespiratoire" INTEGER,
    "saturationOxygene" INTEGER,
    "poidsKg" REAL,
    "tailleCm" REAL,
    "glycemieGL" REAL,
    "observations" TEXT NOT NULL DEFAULT '',
    "conclusion" TEXT NOT NULL DEFAULT '',
    "statut" TEXT NOT NULL DEFAULT 'brouillon',
    "dateValidation" DATETIME,
    "empreinteContenu" TEXT,
    "saisieParErreur" BOOLEAN NOT NULL DEFAULT false,
    "motifRetrait" TEXT,
    "dateRetrait" DATETIME,
    CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Consultation_professionnelId_fkey" FOREIGN KEY ("professionnelId") REFERENCES "ProfessionnelSante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Consultation_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Consultation_rendezVousId_fkey" FOREIGN KEY ("rendezVousId") REFERENCES "RendezVous" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Consultation" ("conclusion", "date", "dateRetrait", "dateValidation", "empreinteContenu", "etablissementId", "frequenceRespiratoire", "glycemieGL", "id", "motif", "motifRetrait", "observations", "patientId", "poidsKg", "pouls", "professionnelId", "rendezVousId", "saisieParErreur", "saturationOxygene", "statut", "symptomes", "tailleCm", "temperatureCelsius", "tensionDiastolique", "tensionSystolique") SELECT "conclusion", "date", "dateRetrait", "dateValidation", "empreinteContenu", "etablissementId", "frequenceRespiratoire", "glycemieGL", "id", "motif", "motifRetrait", "observations", "patientId", "poidsKg", "pouls", "professionnelId", "rendezVousId", "saisieParErreur", "saturationOxygene", "statut", "symptomes", "tailleCm", "temperatureCelsius", "tensionDiastolique", "tensionSystolique" FROM "Consultation";
DROP TABLE "Consultation";
ALTER TABLE "new_Consultation" RENAME TO "Consultation";
CREATE UNIQUE INDEX "Consultation_rendezVousId_key" ON "Consultation"("rendezVousId");
CREATE TABLE "new_Prescription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consultationId" TEXT NOT NULL,
    "medecinPrescripteurId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" TEXT NOT NULL DEFAULT 'validee',
    "instructions" TEXT NOT NULL DEFAULT '',
    "numero" TEXT NOT NULL,
    "empreinteContenu" TEXT NOT NULL,
    CONSTRAINT "Prescription_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Prescription_medecinPrescripteurId_fkey" FOREIGN KEY ("medecinPrescripteurId") REFERENCES "ProfessionnelSante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Prescription" ("consultationId", "date", "empreinteContenu", "id", "instructions", "medecinPrescripteurId", "numero", "patientId", "statut") SELECT "consultationId", "date", "empreinteContenu", "id", "instructions", "medecinPrescripteurId", "numero", "patientId", "statut" FROM "Prescription";
DROP TABLE "Prescription";
ALTER TABLE "new_Prescription" RENAME TO "Prescription";
CREATE UNIQUE INDEX "Prescription_numero_key" ON "Prescription"("numero");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PriseEnChargeInfirmiere_consultationRattacheeId_key" ON "PriseEnChargeInfirmiere"("consultationRattacheeId");
