-- CreateTable
CREATE TABLE "SuiviCommunautaire" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "patientId" TEXT,
    "beneficiaireNom" TEXT NOT NULL,
    "typeVisite" TEXT NOT NULL,
    "dateVisite" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localisation" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "dateCreation" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SuiviCommunautaire_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ProfessionnelSante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SuiviCommunautaire_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SuiviCommunautaire_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
