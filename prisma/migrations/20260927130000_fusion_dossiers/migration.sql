-- CreateTable
CREATE TABLE "FusionDossier" (
    "id" TEXT NOT NULL,
    "patientPrincipalId" TEXT NOT NULL,
    "patientSecondaireId" TEXT NOT NULL,
    "userSecondaireId" TEXT NOT NULL,
    "statutCompteAvant" TEXT NOT NULL,
    "fusionneParId" TEXT NOT NULL,
    "approuveParId" TEXT,
    "ecartsIdentite" TEXT NOT NULL DEFAULT '',
    "justification" TEXT NOT NULL,
    "dateFusion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "defusionLimiteLe" TIMESTAMP(3) NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'active',
    "dateDefusion" TIMESTAMP(3),
    "defusionneParId" TEXT,
    "motifDefusion" TEXT,
    "deplacements" JSONB NOT NULL,
    "nonDeplaces" JSONB,

    CONSTRAINT "FusionDossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaireDoublonIgnoree" (
    "id" TEXT NOT NULL,
    "patientAId" TEXT NOT NULL,
    "patientBId" TEXT NOT NULL,
    "ignoreParId" TEXT NOT NULL,
    "motif" TEXT,
    "dateIgnore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaireDoublonIgnoree_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FusionDossier_patientPrincipalId_idx" ON "FusionDossier"("patientPrincipalId");

-- CreateIndex
CREATE INDEX "FusionDossier_patientSecondaireId_statut_idx" ON "FusionDossier"("patientSecondaireId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "PaireDoublonIgnoree_patientAId_patientBId_key" ON "PaireDoublonIgnoree"("patientAId", "patientBId");
