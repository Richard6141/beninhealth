-- AlterTable
ALTER TABLE "EnvoiSms" ADD COLUMN     "derniereErreur" TEXT,
ADD COLUMN     "prochaineTentativeLe" TIMESTAMP(3),
ADD COLUMN     "tentatives" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "EnvoiSms_statut_prochaineTentativeLe_idx" ON "EnvoiSms"("statut", "prochaineTentativeLe");
