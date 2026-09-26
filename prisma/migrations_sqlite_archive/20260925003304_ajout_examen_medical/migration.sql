-- CreateTable
CREATE TABLE "ExamenMedical" (
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
    CONSTRAINT "ExamenMedical_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamenMedical_demandeurId_fkey" FOREIGN KEY ("demandeurId") REFERENCES "ProfessionnelSante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExamenMedical_laboratoireId_fkey" FOREIGN KEY ("laboratoireId") REFERENCES "EtablissementSanitaire" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExamenMedical_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
