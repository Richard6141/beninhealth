-- CreateTable
CREATE TABLE "ReferencePatient" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "medecinReferentId" TEXT NOT NULL,
    "etablissementOrigineId" TEXT NOT NULL,
    "etablissementDestinationId" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "niveauUrgence" TEXT NOT NULL,
    "resumeClinique" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'ouverte',
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFinAcces" TIMESTAMP(3) NOT NULL,
    "contreReferenceTexte" TEXT,
    "contreReferenceAuteurId" TEXT,
    "dateContreReference" TIMESTAMP(3),
    "dateCloture" TIMESTAMP(3),

    CONSTRAINT "ReferencePatient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferencePatient_etablissementDestinationId_statut_idx" ON "ReferencePatient"("etablissementDestinationId", "statut");

-- CreateIndex
CREATE INDEX "ReferencePatient_medecinReferentId_idx" ON "ReferencePatient"("medecinReferentId");

-- AddForeignKey
ALTER TABLE "ReferencePatient" ADD CONSTRAINT "ReferencePatient_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferencePatient" ADD CONSTRAINT "ReferencePatient_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferencePatient" ADD CONSTRAINT "ReferencePatient_medecinReferentId_fkey" FOREIGN KEY ("medecinReferentId") REFERENCES "ProfessionnelSante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferencePatient" ADD CONSTRAINT "ReferencePatient_etablissementOrigineId_fkey" FOREIGN KEY ("etablissementOrigineId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferencePatient" ADD CONSTRAINT "ReferencePatient_etablissementDestinationId_fkey" FOREIGN KEY ("etablissementDestinationId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferencePatient" ADD CONSTRAINT "ReferencePatient_contreReferenceAuteurId_fkey" FOREIGN KEY ("contreReferenceAuteurId") REFERENCES "ProfessionnelSante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
