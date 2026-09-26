-- AlterTable
ALTER TABLE "SuiviCommunautaire" ADD COLUMN     "personneId" TEXT;

-- CreateTable
CREATE TABLE "PersonneCommunautaire" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "dateNaissance" TIMESTAMP(3) NOT NULL,
    "dateNaissanceApproximative" BOOLEAN NOT NULL DEFAULT false,
    "sexe" TEXT NOT NULL,
    "villageQuartier" TEXT NOT NULL,
    "chefMenage" TEXT,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonneCommunautaire_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SuiviCommunautaire" ADD CONSTRAINT "SuiviCommunautaire_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "PersonneCommunautaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonneCommunautaire" ADD CONSTRAINT "PersonneCommunautaire_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonneCommunautaire" ADD CONSTRAINT "PersonneCommunautaire_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ProfessionnelSante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

