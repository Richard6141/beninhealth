-- AlterTable
ALTER TABLE "FusionDossier" DROP COLUMN "dateFusion",
ADD COLUMN     "dateDemande" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dateExecution" TIMESTAMP(3),
ADD COLUMN     "motifRefus" TEXT,
ADD COLUMN     "refuseParId" TEXT,
ALTER COLUMN "defusionLimiteLe" DROP NOT NULL,
ALTER COLUMN "statut" SET DEFAULT 'en_attente',
ALTER COLUMN "deplacements" DROP NOT NULL;


