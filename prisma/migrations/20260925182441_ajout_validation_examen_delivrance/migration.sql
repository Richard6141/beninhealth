-- CreateTable
CREATE TABLE "Delivrance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prescriptionId" TEXT NOT NULL,
    "pharmacienId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annulee" BOOLEAN NOT NULL DEFAULT false,
    "motifAnnulation" TEXT,
    "dateAnnulation" DATETIME,
    CONSTRAINT "Delivrance_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Delivrance_pharmacienId_fkey" FOREIGN KEY ("pharmacienId") REFERENCES "ProfessionnelSante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Delivrance_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LigneDelivrance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "delivranceId" TEXT NOT NULL,
    "lignePrescriptionId" TEXT NOT NULL,
    "quantiteDelivree" INTEGER NOT NULL,
    "medicamentDelivreId" TEXT,
    "motifNonDelivrance" TEXT,
    "numeroLot" TEXT,
    "datePeremption" DATETIME,
    CONSTRAINT "LigneDelivrance_delivranceId_fkey" FOREIGN KEY ("delivranceId") REFERENCES "Delivrance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LigneDelivrance_lignePrescriptionId_fkey" FOREIGN KEY ("lignePrescriptionId") REFERENCES "LignePrescription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LigneDelivrance_medicamentDelivreId_fkey" FOREIGN KEY ("medicamentDelivreId") REFERENCES "Medicament" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExamenMedical" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "demandeurId" TEXT NOT NULL,
    "laboratoireId" TEXT NOT NULL,
    "consultationId" TEXT,
    "typeExamen" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" TEXT NOT NULL DEFAULT 'demande',
    "resultat" TEXT,
    "dateResultat" DATETIME,
    "saisiParId" TEXT,
    "valideParId" TEXT,
    "dateValidation" DATETIME,
    "empreinteResultat" TEXT,
    "commentaireValidation" TEXT,
    "sensible" BOOLEAN NOT NULL DEFAULT false,
    "resultatAnnonceAuPatient" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ExamenMedical_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamenMedical_demandeurId_fkey" FOREIGN KEY ("demandeurId") REFERENCES "ProfessionnelSante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExamenMedical_laboratoireId_fkey" FOREIGN KEY ("laboratoireId") REFERENCES "EtablissementSanitaire" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExamenMedical_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExamenMedical_saisiParId_fkey" FOREIGN KEY ("saisiParId") REFERENCES "ProfessionnelSante" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExamenMedical_valideParId_fkey" FOREIGN KEY ("valideParId") REFERENCES "ProfessionnelSante" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExamenMedical" ("consultationId", "date", "dateResultat", "demandeurId", "id", "laboratoireId", "patientId", "resultat", "resultatAnnonceAuPatient", "sensible", "statut", "typeExamen") SELECT "consultationId", "date", "dateResultat", "demandeurId", "id", "laboratoireId", "patientId", "resultat", "resultatAnnonceAuPatient", "sensible", "statut", "typeExamen" FROM "ExamenMedical";
DROP TABLE "ExamenMedical";
ALTER TABLE "new_ExamenMedical" RENAME TO "ExamenMedical";
CREATE TABLE "new_LignePrescription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prescriptionId" TEXT NOT NULL,
    "medicamentId" TEXT NOT NULL,
    "posologie" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "dureeTraitementJours" INTEGER NOT NULL,
    "nonSubstituable" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "LignePrescription_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LignePrescription_medicamentId_fkey" FOREIGN KEY ("medicamentId") REFERENCES "Medicament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_LignePrescription" ("dureeTraitementJours", "id", "medicamentId", "posologie", "prescriptionId", "quantite") SELECT "dureeTraitementJours", "id", "medicamentId", "posologie", "prescriptionId", "quantite" FROM "LignePrescription";
DROP TABLE "LignePrescription";
ALTER TABLE "new_LignePrescription" RENAME TO "LignePrescription";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
