-- CreateTable
CREATE TABLE "ActionAdministrateurEnAttente" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cibleUserId" TEXT,
    "parametres" JSONB NOT NULL,
    "demandeParId" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'en_attente',
    "decideParId" TEXT,
    "motifDecision" TEXT,
    "dateDemande" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateDecision" TIMESTAMP(3),
    "expireLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionAdministrateurEnAttente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionAdministrateurEnAttente_statut_expireLe_idx" ON "ActionAdministrateurEnAttente"("statut", "expireLe");
