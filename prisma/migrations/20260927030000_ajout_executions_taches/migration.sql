-- CreateTable
CREATE TABLE "ExecutionTache" (
    "id" TEXT NOT NULL,
    "tache" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "nombreTraite" INTEGER,
    "message" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionTache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExecutionTache_tache_date_idx" ON "ExecutionTache"("tache", "date");

-- CreateIndex
CREATE INDEX "ExecutionTache_statut_date_idx" ON "ExecutionTache"("statut", "date");
