-- CreateTable
CREATE TABLE "AddendumConsultation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consultationId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AddendumConsultation_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AddendumConsultation_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "motif" TEXT NOT NULL,
    "symptomes" TEXT NOT NULL DEFAULT '[]',
    "constantes" TEXT NOT NULL DEFAULT '',
    "observations" TEXT NOT NULL DEFAULT '',
    "conclusion" TEXT NOT NULL DEFAULT '',
    "statut" TEXT NOT NULL DEFAULT 'terminee',
    "saisieParErreur" BOOLEAN NOT NULL DEFAULT false,
    "motifRetrait" TEXT,
    "dateRetrait" DATETIME,
    CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Consultation_professionnelId_fkey" FOREIGN KEY ("professionnelId") REFERENCES "ProfessionnelSante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Consultation_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Consultation_rendezVousId_fkey" FOREIGN KEY ("rendezVousId") REFERENCES "RendezVous" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Consultation" ("conclusion", "constantes", "date", "etablissementId", "id", "motif", "observations", "patientId", "professionnelId", "rendezVousId", "statut", "symptomes") SELECT "conclusion", "constantes", "date", "etablissementId", "id", "motif", "observations", "patientId", "professionnelId", "rendezVousId", "statut", "symptomes" FROM "Consultation";
DROP TABLE "Consultation";
ALTER TABLE "new_Consultation" RENAME TO "Consultation";
CREATE UNIQUE INDEX "Consultation_rendezVousId_key" ON "Consultation"("rendezVousId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
