-- F-CIT-13 : demandes de rectification (type 2), routees vers le
-- professionnel confirmant quand l'element concerne est confirme,
-- escaladees automatiquement sans reponse sous 30 jours.

-- CreateTable
CREATE TABLE "DemandeRectification" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "informationDeclareeId" TEXT,
    "professionnelDestinataireId" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'en_attente',
    "reponseProfessionnel" TEXT,
    "dateTraitement" TIMESTAMP(3),
    "dateEscalade" TIMESTAMP(3),
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandeRectification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandeRectification_professionnelDestinataireId_statut_idx" ON "DemandeRectification"("professionnelDestinataireId", "statut");

-- CreateIndex
CREATE INDEX "DemandeRectification_statut_dateCreation_idx" ON "DemandeRectification"("statut", "dateCreation");

-- AddForeignKey
ALTER TABLE "DemandeRectification" ADD CONSTRAINT "DemandeRectification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeRectification" ADD CONSTRAINT "DemandeRectification_informationDeclareeId_fkey" FOREIGN KEY ("informationDeclareeId") REFERENCES "InformationDeclaree"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeRectification" ADD CONSTRAINT "DemandeRectification_professionnelDestinataireId_fkey" FOREIGN KEY ("professionnelDestinataireId") REFERENCES "ProfessionnelSante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
