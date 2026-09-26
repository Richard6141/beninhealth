-- AlterTable
ALTER TABLE "ExamenMedical" ADD COLUMN     "versionResultat" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "VersionResultatExamen" (
    "id" TEXT NOT NULL,
    "examenId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "resultat" TEXT,
    "resultatsParametres" JSONB,
    "empreinteResultat" TEXT,
    "saisiParId" TEXT,
    "valideParId" TEXT,
    "dateValidation" TIMESTAMP(3),
    "motifCorrection" TEXT NOT NULL,
    "corrigeParId" TEXT NOT NULL,
    "dateCorrection" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersionResultatExamen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VersionResultatExamen_examenId_numero_key" ON "VersionResultatExamen"("examenId", "numero");

-- AddForeignKey
ALTER TABLE "VersionResultatExamen" ADD CONSTRAINT "VersionResultatExamen_examenId_fkey" FOREIGN KEY ("examenId") REFERENCES "ExamenMedical"("id") ON DELETE CASCADE ON UPDATE CASCADE;
