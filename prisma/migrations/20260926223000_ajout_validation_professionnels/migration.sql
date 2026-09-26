-- AlterTable
ALTER TABLE "ProfessionnelSante" ADD COLUMN     "ordreVerifieLe" TIMESTAMP(3),
ADD COLUMN     "ordreVerifiePar" TEXT,
ADD COLUMN     "validationDecideLe" TIMESTAMP(3),
ADD COLUMN     "validationDecision" TEXT,
ADD COLUMN     "validationMessage" TEXT;
