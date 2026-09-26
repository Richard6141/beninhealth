-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "analytics";

-- AlterTable
ALTER TABLE "EtablissementSanitaire" ADD COLUMN     "communeId" TEXT,
ADD COLUMN     "zoneSanitaireId" TEXT;

-- CreateTable
CREATE TABLE "Departement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,

    CONSTRAINT "Departement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoneSanitaire" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "departementId" TEXT NOT NULL,

    CONSTRAINT "ZoneSanitaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commune" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "departementId" TEXT NOT NULL,

    CONSTRAINT "Commune_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."AgregatQuotidien" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "etablissementId" TEXT,
    "zoneSanitaireId" TEXT,
    "departementId" TEXT,
    "typeEtablissement" TEXT,
    "indicateur" TEXT NOT NULL,
    "sexe" TEXT,
    "trancheAge" TEXT,
    "dimensionLibre" TEXT,
    "valeur" INTEGER NOT NULL,
    "dateCalcul" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgregatQuotidien_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthAlertReview" (
    "id" TEXT NOT NULL,
    "zoneSanitaireId" TEXT NOT NULL,
    "groupeMaladies" TEXT NOT NULL,
    "semaine" TEXT NOT NULL,
    "casObserves" INTEGER NOT NULL,
    "seuilCalcule" DOUBLE PRECISION NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'nouvelle',
    "commentaire" TEXT,
    "motifFermeture" TEXT,
    "reviewerId" TEXT,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateRevue" TIMESTAMP(3),

    CONSTRAINT "HealthAlertReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Departement_code_key" ON "Departement"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Departement_nom_key" ON "Departement"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "ZoneSanitaire_code_key" ON "ZoneSanitaire"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Commune_departementId_nom_key" ON "Commune"("departementId", "nom");

-- CreateIndex
CREATE INDEX "AgregatQuotidien_indicateur_date_idx" ON "analytics"."AgregatQuotidien"("indicateur", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AgregatQuotidien_date_etablissementId_zoneSanitaireId_depar_key" ON "analytics"."AgregatQuotidien"("date", "etablissementId", "zoneSanitaireId", "departementId", "indicateur", "sexe", "trancheAge", "dimensionLibre");

-- CreateIndex
CREATE UNIQUE INDEX "HealthAlertReview_zoneSanitaireId_groupeMaladies_semaine_key" ON "HealthAlertReview"("zoneSanitaireId", "groupeMaladies", "semaine");

-- AddForeignKey
ALTER TABLE "ZoneSanitaire" ADD CONSTRAINT "ZoneSanitaire_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commune" ADD CONSTRAINT "Commune_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtablissementSanitaire" ADD CONSTRAINT "EtablissementSanitaire_communeId_fkey" FOREIGN KEY ("communeId") REFERENCES "Commune"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtablissementSanitaire" ADD CONSTRAINT "EtablissementSanitaire_zoneSanitaireId_fkey" FOREIGN KEY ("zoneSanitaireId") REFERENCES "ZoneSanitaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthAlertReview" ADD CONSTRAINT "HealthAlertReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
