-- CreateTable
CREATE TABLE "CodeReclamationDossier" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "consommeLe" TIMESTAMP(3),

    CONSTRAINT "CodeReclamationDossier_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CodeReclamationDossier" ADD CONSTRAINT "CodeReclamationDossier_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

