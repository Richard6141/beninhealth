-- CreateTable
CREATE TABLE "CreneauDisponibilite" (
    "id" TEXT NOT NULL,
    "professionnelId" TEXT NOT NULL,
    "jourSemaine" INTEGER NOT NULL,
    "heureDebutMinutes" INTEGER NOT NULL,
    "heureFinMinutes" INTEGER NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreneauDisponibilite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreneauDisponibilite_professionnelId_jourSemaine_idx" ON "CreneauDisponibilite"("professionnelId", "jourSemaine");

-- AddForeignKey
ALTER TABLE "CreneauDisponibilite" ADD CONSTRAINT "CreneauDisponibilite_professionnelId_fkey" FOREIGN KEY ("professionnelId") REFERENCES "ProfessionnelSante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
