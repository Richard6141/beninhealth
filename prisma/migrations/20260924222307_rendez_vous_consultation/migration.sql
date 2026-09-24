-- CreateTable
CREATE TABLE "RendezVous" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "professionnelId" TEXT,
    "date" DATETIME NOT NULL,
    "motif" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'demande',
    "dateCreation" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RendezVous_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RendezVous_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RendezVous_professionnelId_fkey" FOREIGN KEY ("professionnelId") REFERENCES "ProfessionnelSante" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Consultation" (
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
    CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Consultation_professionnelId_fkey" FOREIGN KEY ("professionnelId") REFERENCES "ProfessionnelSante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Consultation_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Consultation_rendezVousId_fkey" FOREIGN KEY ("rendezVousId") REFERENCES "RendezVous" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_rendezVousId_key" ON "Consultation"("rendezVousId");
