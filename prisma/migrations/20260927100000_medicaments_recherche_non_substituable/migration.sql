-- F-PRE-03 : noms commerciaux, code ATC et indicateur "medicament essentiel" (recherche du referentiel).
-- F-PRE-01 : motif de non substitution d'une ligne d'ordonnance.
-- AlterTable
ALTER TABLE "Medicament" ADD COLUMN     "codeAtc" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "essentiel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nomsCommerciaux" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "LignePrescription" ADD COLUMN     "motifNonSubstituable" TEXT;
