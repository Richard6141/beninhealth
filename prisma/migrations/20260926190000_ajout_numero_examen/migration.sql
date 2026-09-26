-- AlterTable
ALTER TABLE "ExamenMedical" ADD COLUMN     "numero" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ExamenMedical_numero_key" ON "ExamenMedical"("numero");
