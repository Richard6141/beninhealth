-- CreateTable
CREATE TABLE "TachePilotage" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "etablissementId" TEXT,
    "type" TEXT NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traitee" BOOLEAN NOT NULL DEFAULT false,
    "dateTraitement" TIMESTAMP(3),

    CONSTRAINT "TachePilotage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TachePilotage_traitee_idx" ON "TachePilotage"("traitee");
