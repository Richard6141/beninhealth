-- CreateTable
CREATE TABLE "AppelIa" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "patientId" TEXT,
    "fonctionnalite" TEXT NOT NULL,
    "modele" TEXT NOT NULL,
    "versionConsigne" TEXT NOT NULL,
    "nombreSources" INTEGER NOT NULL DEFAULT 0,
    "pucesLues" INTEGER NOT NULL DEFAULT 0,
    "pucesSupprimees" INTEGER NOT NULL DEFAULT 0,
    "dureeMs" INTEGER NOT NULL DEFAULT 0,
    "statut" TEXT NOT NULL,
    "retour" TEXT,
    "commentaireRetour" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppelIa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppelIa_fonctionnalite_date_idx" ON "AppelIa"("fonctionnalite", "date");

-- CreateIndex
CREATE INDEX "AppelIa_utilisateurId_fonctionnalite_date_idx" ON "AppelIa"("utilisateurId", "fonctionnalite", "date");
