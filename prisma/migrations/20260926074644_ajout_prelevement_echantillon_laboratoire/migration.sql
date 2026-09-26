-- AlterTable
ALTER TABLE "ExamenMedical" ADD COLUMN     "datePrelevement" TIMESTAMP(3),
ADD COLUMN     "identifiantEchantillon" TEXT,
ADD COLUMN     "identiteVerifiee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "motifRejetEchantillon" TEXT,
ADD COLUMN     "preleveurId" TEXT,
ADD COLUMN     "typeEchantillon" TEXT;

-- AddForeignKey
ALTER TABLE "ExamenMedical" ADD CONSTRAINT "ExamenMedical_preleveurId_fkey" FOREIGN KEY ("preleveurId") REFERENCES "ProfessionnelSante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
