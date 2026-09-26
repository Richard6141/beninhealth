-- CreateTable
CREATE TABLE "DemandeAccesDossier" (
    "id" TEXT NOT NULL,
    "demandeurId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "patientId" TEXT,
    "modeRecherche" TEXT NOT NULL,
    "empreinteCritere" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "dureeAccesHeures" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "renvois" INTEGER NOT NULL DEFAULT 0,
    "statut" TEXT NOT NULL DEFAULT 'en_attente',
    "canal" TEXT,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "valideLe" TIMESTAMP(3),

    CONSTRAINT "DemandeAccesDossier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandeAccesDossier_demandeurId_dateCreation_idx" ON "DemandeAccesDossier"("demandeurId", "dateCreation");

-- CreateIndex
CREATE INDEX "DemandeAccesDossier_patientId_dateCreation_idx" ON "DemandeAccesDossier"("patientId", "dateCreation");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_referenceIdentiteNationale_key" ON "Patient"("referenceIdentiteNationale");

-- CreateIndex
CREATE INDEX "Patient_dateNaissance_idx" ON "Patient"("dateNaissance");

-- AddForeignKey
ALTER TABLE "DemandeAccesDossier" ADD CONSTRAINT "DemandeAccesDossier_demandeurId_fkey" FOREIGN KEY ("demandeurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeAccesDossier" ADD CONSTRAINT "DemandeAccesDossier_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeAccesDossier" ADD CONSTRAINT "DemandeAccesDossier_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

