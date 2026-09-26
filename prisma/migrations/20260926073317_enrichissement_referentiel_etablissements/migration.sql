-- AlterTable
ALTER TABLE "EtablissementSanitaire" ADD COLUMN     "adresse" TEXT,
ADD COLUMN     "arrondissement" TEXT,
ADD COLUMN     "emailEtablissement" TEXT,
ADD COLUMN     "etablissementParentId" TEXT,
ADD COLUMN     "identifiantExterneDhis2" TEXT,
ADD COLUMN     "niveauPyramide" TEXT,
ADD COLUMN     "quartierVillage" TEXT,
ADD COLUMN     "secteur" TEXT,
ADD COLUMN     "sigle" TEXT,
ADD COLUMN     "statut" TEXT NOT NULL DEFAULT 'brouillon',
ADD COLUMN     "telephoneEtablissement" TEXT;

-- AddForeignKey
ALTER TABLE "EtablissementSanitaire" ADD CONSTRAINT "EtablissementSanitaire_etablissementParentId_fkey" FOREIGN KEY ("etablissementParentId") REFERENCES "EtablissementSanitaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;
