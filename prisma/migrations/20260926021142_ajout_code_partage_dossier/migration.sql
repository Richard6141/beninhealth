-- CreateTable
CREATE TABLE "CodePartageDossier" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "consommeLe" TIMESTAMP(3),
    "consommeParId" TEXT,

    CONSTRAINT "CodePartageDossier_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CodePartageDossier" ADD CONSTRAINT "CodePartageDossier_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodePartageDossier" ADD CONSTRAINT "CodePartageDossier_consommeParId_fkey" FOREIGN KEY ("consommeParId") REFERENCES "ProfessionnelSante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
