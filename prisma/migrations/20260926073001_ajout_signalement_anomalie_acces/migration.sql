-- CreateTable
CREATE TABLE "SignalementAnomalieAcces" (
    "id" TEXT NOT NULL,
    "regle" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "dateDetection" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" TEXT NOT NULL DEFAULT 'nouveau',
    "commentaire" TEXT,
    "reviewerId" TEXT,
    "dateRevue" TIMESTAMP(3),

    CONSTRAINT "SignalementAnomalieAcces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignalementAnomalieAcces_statut_idx" ON "SignalementAnomalieAcces"("statut");

-- AddForeignKey
ALTER TABLE "SignalementAnomalieAcces" ADD CONSTRAINT "SignalementAnomalieAcces_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalementAnomalieAcces" ADD CONSTRAINT "SignalementAnomalieAcces_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
