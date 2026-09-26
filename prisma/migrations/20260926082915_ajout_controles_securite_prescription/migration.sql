-- AlterTable
ALTER TABLE "Medicament" ADD COLUMN     "ageMinimumMois" INTEGER,
ADD COLUMN     "contreIndiqueGrossesse" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "grossesseEnCours" BOOLEAN NOT NULL DEFAULT false;
