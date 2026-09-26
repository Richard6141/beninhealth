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
    "sensible" BOOLEAN NOT NULL DEFAULT false,
    "resultatAnnonceAuPatient" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ExamenMedical_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamenMedical_demandeurId_fkey" FOREIGN KEY ("demandeurId") REFERENCES "ProfessionnelSante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExamenMedical_laboratoireId_fkey" FOREIGN KEY ("laboratoireId") REFERENCES "EtablissementSanitaire" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExamenMedical_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExamenMedical" ("consultationId", "date", "dateResultat", "demandeurId", "id", "laboratoireId", "patientId", "resultat", "statut", "typeExamen") SELECT "consultationId", "date", "dateResultat", "demandeurId", "id", "laboratoireId", "patientId", "resultat", "statut", "typeExamen" FROM "ExamenMedical";
DROP TABLE "ExamenMedical";
ALTER TABLE "new_ExamenMedical" RENAME TO "ExamenMedical";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
