-- CreateTable
CREATE TABLE "Medicament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "principeActif" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "forme" TEXT NOT NULL,
    "informationsComplementaires" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consultationId" TEXT NOT NULL,
    "medecinPrescripteurId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" TEXT NOT NULL DEFAULT 'validee',
    "instructions" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Prescription_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Prescription_medecinPrescripteurId_fkey" FOREIGN KEY ("medecinPrescripteurId") REFERENCES "ProfessionnelSante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LignePrescription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prescriptionId" TEXT NOT NULL,
    "medicamentId" TEXT NOT NULL,
    "posologie" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "dureeTraitementJours" INTEGER NOT NULL,
    CONSTRAINT "LignePrescription_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LignePrescription_medicamentId_fkey" FOREIGN KEY ("medicamentId") REFERENCES "Medicament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvenementPrescription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prescriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilisateurId" TEXT NOT NULL,
    "commentaire" TEXT,
    CONSTRAINT "EvenementPrescription_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvenementPrescription_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
